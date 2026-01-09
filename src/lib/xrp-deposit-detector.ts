import { Client, AccountTxResponse, TransactionMetadata } from 'xrpl';
import { XRPWalletManager, XRP_NETWORKS } from './wallets/xrp-wallet';
import { AuditLogger, AuditAction } from './security/audit-logger';
import { supabase } from '@/integrations/supabase/client';

/**
 * XRP入金検知結果
 */
export interface XRPDepositResult {
  userId: string;
  depositAddress: string;
  amount: string; // XRP単位
  transactionHash: string;
  ledgerIndex: number;
  destinationTag?: number;
  timestamp: number;
  fee: string;
  sourceAddress: string;
}

/**
 * XRP Ledger情報
 */
export interface XRPLedgerInfo {
  ledgerIndex: number;
  ledgerHash: string;
  closeTime: number;
  totalCoins: string;
}

/**
 * XRPトランザクション詳細
 */
export interface XRPTransactionDetail {
  Account: string;
  Destination: string;
  DestinationTag?: number;
  Amount: string;
  Fee: string;
  TransactionType: string;
  Sequence: number;
  hash: string;
  ledger_index: number;
  date: number;
  validated: boolean;
  meta?: TransactionMetadata;
}

/**
 * XRP入金検知システム
 */
export class XRPDepositDetector {
  private client: Client;
  private network: string;
  private networkConfig: typeof XRP_NETWORKS[keyof typeof XRP_NETWORKS];
  private lastProcessedLedger: number = 0;
  private isConnected: boolean = false;

  constructor(network: string = 'mainnet') {
    this.network = network;
    this.networkConfig = XRP_NETWORKS[network];
    
    if (!this.networkConfig) {
      throw new Error(`サポートされていないXRPネットワーク: ${network}`);
    }

    this.client = new Client(this.networkConfig.server);
  }

  /**
   * XRPLクライアントに接続
   */
  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        this.isConnected = true;
        console.log(`XRPL接続成功: ${this.networkConfig.name}`);
      }
    } catch (error) {
      throw new Error(`XRPL接続に失敗: ${error.message}`);
    }
  }

  /**
   * XRPLクライアントから切断
   */
  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
        this.isConnected = false;
        console.log('XRPL切断完了');
      }
    } catch (error) {
      console.warn('XRPL切断エラー:', error);
    }
  }

  /**
   * 入金検知の開始
   */
  async startDetection(): Promise<void> {
    await this.connect();
    await this.loadLastProcessedLedger();
    
    console.log(`XRP入金検知開始 (ネットワーク: ${this.network}, 最後の処理レジャー: ${this.lastProcessedLedger})`);
  }

  /**
   * 最後に処理したレジャーをロード
   */
  private async loadLastProcessedLedger(): Promise<void> {
    try {
      const { data, error }: {
        data: { last_block_height: number } | null;
        error: unknown;
      } = await supabase
        .from('deposit_detection_state' as unknown as string)
        .select('last_block_height')
        .eq('chain', 'xrp')
        .eq('network', this.network)
        .single();

      if (error || !data) {
        // 初回実行時は現在のレジャーから開始
        const ledgerInfo = await this.getLatestLedger();
        this.lastProcessedLedger = ledgerInfo.ledgerIndex;
      } else {
        this.lastProcessedLedger = data.last_block_height;
      }

    } catch (error) {
      console.error('最後の処理レジャー取得エラー:', error);
      const ledgerInfo = await this.getLatestLedger();
      this.lastProcessedLedger = ledgerInfo.ledgerIndex;
    }
  }

  /**
   * 最後に処理したレジャーを保存
   */
  private async saveLastProcessedLedger(ledgerIndex: number): Promise<void> {
    try {
      const { error }: { error: unknown } = await supabase
        .from('deposit_detection_state' as unknown as string)
        .upsert({
          chain: 'xrp',
          network: this.network,
          last_block_height: ledgerIndex,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('処理レジャー保存エラー:', error);
      }

    } catch (error) {
      console.error('処理レジャー保存エラー:', error);
    }
  }

  /**
   * 最新レジャー情報取得
   */
  async getLatestLedger(): Promise<XRPLedgerInfo> {
    await this.connect();

    try {
      const response = await this.client.request({
        command: 'ledger',
        ledger_index: 'validated',
        full: false
      });

      const ledger = response.result.ledger;

      return {
        ledgerIndex: ledger.ledger_index,
        ledgerHash: ledger.ledger_hash,
        closeTime: ledger.close_time,
        totalCoins: ledger.total_coins ? (parseInt(ledger.total_coins) / 1000000).toString() : '0'
      };

    } catch (error) {
      throw new Error(`最新レジャー取得に失敗: ${error.message}`);
    }
  }

  /**
   * 新しいレジャーをスキャンして入金を検知
   */
  async scanForDeposits(): Promise<XRPDepositResult[]> {
    const results: XRPDepositResult[] = [];

    try {
      await this.connect();
      const latestLedger = await this.getLatestLedger();
      
      // 新しいレジャーがない場合は終了
      if (latestLedger.ledgerIndex <= this.lastProcessedLedger) {
        return results;
      }

      console.log(`XRP新レジャー検知: ${this.lastProcessedLedger + 1} -> ${latestLedger.ledgerIndex}`);

      // 管理対象のアドレス一覧を取得
      const depositAddresses = await this.getDepositAddresses();
      
      if (depositAddresses.length === 0) {
        console.log('管理対象のXRPアドレスがありません');
        await this.saveLastProcessedLedger(latestLedger.ledgerIndex);
        return results;
      }

      // 各アドレスのトランザクション履歴をチェック
      for (const addressInfo of depositAddresses) {
        const addressResults = await this.scanAddressTransactions(
          addressInfo.address,
          addressInfo.userId,
          addressInfo.addressId,
          this.lastProcessedLedger + 1,
          latestLedger.ledgerIndex
        );
        results.push(...addressResults);
      }

      // 処理済みレジャーを更新
      this.lastProcessedLedger = latestLedger.ledgerIndex;
      await this.saveLastProcessedLedger(latestLedger.ledgerIndex);

    } catch (error) {
      console.error('XRP入金スキャンエラー:', error);
      throw error;
    }

    return results;
  }

  /**
   * 指定アドレスのトランザクション履歴をスキャン
   */
  private async scanAddressTransactions(
    address: string,
    userId: string,
    addressId: string,
    fromLedger: number,
    toLedger: number
  ): Promise<XRPDepositResult[]> {
    const results: XRPDepositResult[] = [];

    try {
      // アドレスのトランザクション履歴を取得
      const response: AccountTxResponse = await this.client.request({
        command: 'account_tx',
        account: address,
        ledger_index_min: fromLedger,
        ledger_index_max: toLedger,
        binary: false,
        forward: false,
        limit: 400
      });

      const transactions = response.result.transactions;

      for (const txWrapper of transactions) {
        const tx = txWrapper.tx as unknown as {
          TransactionType: string;
          Destination: string;
          Amount: string | unknown;
          Fee?: string;
          hash?: string;
          Account: string;
          DestinationTag?: number;
        };
        const meta = txWrapper.meta;

        // Paymentトランザクションのみ処理
        if (tx.TransactionType !== 'Payment') continue;

        // 受取人が対象アドレスかチェック
        if (tx.Destination !== address) continue;

        // XRP送金のみ処理（文字列の場合はXRP）
        if (typeof tx.Amount !== 'string') continue;

        const amountDrops = tx.Amount;
        const amountXRP = (parseInt(amountDrops) / 1000000).toFixed(6);
        const feeDrops = tx.Fee || '0';
        const feeXRP = (parseInt(feeDrops) / 1000000).toFixed(6);

        // 入金を記録
        const txWrapperWithDate = txWrapper as unknown as { date?: number; ledger_index: number };
        await this.recordDeposit(
          userId,
          addressId,
          amountXRP,
          tx.hash!,
          txWrapperWithDate.ledger_index,
          address,
          tx.Account,
          tx.DestinationTag,
          feeXRP,
          txWrapperWithDate.date ? txWrapperWithDate.date + 946684800 : Date.now() / 1000 // Ripple Epochから変換
        );

        results.push({
          userId,
          depositAddress: address,
          amount: amountXRP,
          transactionHash: tx.hash!,
          ledgerIndex: txWrapperWithDate.ledger_index,
          destinationTag: tx.DestinationTag,
          timestamp: txWrapperWithDate.date ? txWrapperWithDate.date + 946684800 : Date.now() / 1000,
          fee: feeXRP,
          sourceAddress: tx.Account
        });

        console.log(`XRP入金検知: ${amountXRP} XRP -> ${address} (${tx.hash})`);
      }

    } catch (error) {
      console.error(`アドレス ${address} のトランザクションスキャンエラー:`, error);
    }

    return results;
  }

  /**
   * 管理対象のXRPアドレス一覧を取得
   */
  private async getDepositAddresses(): Promise<Array<{
    address: string;
    userId: string;
    addressId: string;
  }>> {
    try {
      const { data, error }: {
        data: Array<{ id: string; user_id: string; address: string }> | null;
        error: unknown;
      } = await supabase
        .from('deposit_addresses')
        .select('id, user_id, address')
        .eq('chain', 'xrp')
        .eq('network', this.network)
        .eq('active', true);

      if (error) {
        console.error('XRPアドレス取得エラー:', error);
        return [];
      }

      return (data || []).map(item => ({
        address: item.address,
        userId: item.user_id,
        addressId: item.id
      }));

    } catch (error) {
      console.error('XRPアドレス取得エラー:', error);
      return [];
    }
  }

  /**
   * 入金をデータベースに記録
   */
  private async recordDeposit(
    userId: string,
    addressId: string,
    amount: string,
    transactionHash: string,
    ledgerIndex: number,
    address: string,
    sourceAddress: string,
    destinationTag?: number,
    fee?: string,
    timestamp?: number
  ): Promise<void> {
    try {
      // 重複チェック
      const { data: existing }: {
        data: { id: string } | null;
      } = await supabase
        .from('deposits')
        .select('id')
        .eq('transaction_hash', transactionHash)
        .eq('wallet_address', address)
        .eq('asset', 'XRP')
        .single();

      if (existing) {
        console.log(`XRP入金 ${transactionHash} は既に記録済み`);
        return;
      }

      // 入金レコード作成
      const { error }: { error: unknown } = await supabase
        .from('deposits')
        .insert({
          user_id: userId,
          amount: parseFloat(amount),
          currency: 'XRP',
          chain: 'xrp',
          network: this.network,
          asset: 'XRP',
          status: 'confirmed', // XRPは即座に確認済み
          transaction_hash: transactionHash,
          wallet_address: address,
          confirmations_required: 1,
          confirmations_observed: 1,
          memo_tag: destinationTag ? destinationTag.toString() : null,
          created_at: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString()
        });

      if (error) {
        console.error('XRP入金記録エラー:', error);
        throw error;
      }

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.DEPOSIT_CONFIRM,
        'xrp_deposit_detector',
        {
          userId,
          amount,
          transactionHash,
          ledgerIndex,
          address,
          sourceAddress,
          destinationTag,
          fee
        },
        { userId, riskLevel: 'medium' }
      );

      console.log(`XRP入金記録完了: ${amount} XRP (${transactionHash})`);

    } catch (error) {
      console.error('XRP入金記録エラー:', error);
      throw error;
    }
  }

  /**
   * 特定のトランザクションを検証
   */
  async verifyTransaction(txHash: string): Promise<XRPTransactionDetail | null> {
    await this.connect();

    try {
      const response = await this.client.request({
        command: 'tx',
        transaction: txHash
      });

      const tx = response.result as unknown as {
        Account: string;
        Destination: string;
        DestinationTag?: number;
        Amount: string;
        Fee: string;
        TransactionType: string;
        Sequence: number;
        hash: string;
        ledger_index: number;
        date: number;
        validated: boolean;
        meta?: TransactionMetadata;
      };

      return {
        Account: tx.Account,
        Destination: tx.Destination,
        DestinationTag: tx.DestinationTag,
        Amount: tx.Amount,
        Fee: tx.Fee,
        TransactionType: tx.TransactionType,
        Sequence: tx.Sequence,
        hash: tx.hash,
        ledger_index: tx.ledger_index,
        date: tx.date,
        validated: tx.validated,
        meta: tx.meta
      };

    } catch (error) {
      console.error(`トランザクション ${txHash} の検証エラー:`, error);
      return null;
    }
  }

  /**
   * アカウントのXRP残高を取得
   */
  async getAccountBalance(address: string): Promise<string> {
    await this.connect();

    try {
      const response = await this.client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated'
      });

      const balance = response.result.account_data.Balance;
      return (parseInt(balance) / 1000000).toFixed(6); // dropsをXRPに変換

    } catch (error) {
      console.error(`アカウント ${address} の残高取得エラー:`, error);
      return '0';
    }
  }

  /**
   * レジャー範囲での全トランザクション統計
   */
  async getDepositStatistics(fromLedger: number, toLedger: number): Promise<{
    totalDeposits: number;
    totalAmount: string;
    averageAmount: string;
    addresses: number;
  }> {
    try {
      const { data, error }: {
        data: Array<{ amount: number; wallet_address: string }> | null;
        error: unknown;
      } = await supabase
        .from('deposits')
        .select('amount, wallet_address')
        .eq('chain', 'xrp')
        .eq('network', this.network)
        .gte('created_at', new Date(Date.now() - (toLedger - fromLedger) * 4000).toISOString()) // 約4秒/レジャー
        .lte('created_at', new Date().toISOString());

      if (error || !data) {
        return {
          totalDeposits: 0,
          totalAmount: '0',
          averageAmount: '0',
          addresses: 0
        };
      }

      const totalAmount = data.reduce((sum, deposit) => sum + deposit.amount, 0);
      const uniqueAddresses = new Set(data.map(d => d.wallet_address)).size;

      return {
        totalDeposits: data.length,
        totalAmount: totalAmount.toFixed(6),
        averageAmount: data.length > 0 ? (totalAmount / data.length).toFixed(6) : '0',
        addresses: uniqueAddresses
      };

    } catch (error) {
      console.error('XRP入金統計取得エラー:', error);
      return {
        totalDeposits: 0,
        totalAmount: '0',
        averageAmount: '0',
        addresses: 0
      };
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latestLedger?: number;
    network: string;
    lastProcessedLedger: number;
    serverInfo?: Record<string, unknown>;
  }> {
    try {
      await this.connect();
      
      const ledgerInfo = await this.getLatestLedger();
      const serverInfo = await this.client.request({
        command: 'server_info'
      });

      return {
        connected: true,
        latestLedger: ledgerInfo.ledgerIndex,
        network: this.network,
        lastProcessedLedger: this.lastProcessedLedger,
        serverInfo: serverInfo.result.info
      };
      
    } catch (error) {
      return {
        connected: false,
        network: this.network,
        lastProcessedLedger: this.lastProcessedLedger
      };
    }
  }

  /**
   * リソースクリーンアップ
   */
  async cleanup(): Promise<void> {
    await this.disconnect();
  }
}