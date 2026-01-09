import { BitcoinHDWallet } from './wallets/btc-wallet';
import { UTXOManager, UTXO } from './utxo-manager';
import { analyzeBTCAddress } from './btc-address-validator';
import { AuditLogger, AuditAction } from './security/audit-logger';
import { supabase } from '@/integrations/supabase/client';

/**
 * Bitcoin入金検知結果
 */
export interface BTCDepositResult {
  userId: string;
  depositAddress: string;
  amount: string; // BTC単位
  transactionHash: string;
  vout: number;
  blockHeight: number;
  confirmations: number;
  addressType: string;
  timestamp: number;
}

/**
 * Bitcoinブロック情報
 */
export interface BTCBlockInfo {
  height: number;
  hash: string;
  time: number;
  txCount: number;
}

/**
 * BitcoinトランザクションInput
 */
export interface BTCTransactionInput {
  txid: string;
  vout: number;
  scriptSig: string;
  witness?: string[];
  sequence: number;
}

/**
 * BitcoinトランザクションOutput
 */
export interface BTCTransactionOutput {
  value: number; // satoshi
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    type: string;
    addresses?: string[];
  };
}

/**
 * Bitcoinトランザクション詳細
 */
export interface BTCTransaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  locktime: number;
  vin: BTCTransactionInput[];
  vout: BTCTransactionOutput[];
  hex: string;
  blockhash?: string;
  confirmations?: number;
  time?: number;
  blocktime?: number;
}

/**
 * Bitcoin RPC APIクライアント
 */
class BitcoinRPCClient {
  private rpcUrl: string;
  private auth: string;

  constructor(rpcUrl: string, username: string, password: string) {
    this.rpcUrl = rpcUrl;
    this.auth = Buffer.from(`${username}:${password}`).toString('base64');
  }

  /**
   * Bitcoin RPC リクエスト送信
   */
  async call(method: string, params: unknown[] = []): Promise<unknown> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.auth}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`Bitcoin RPC Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Bitcoin RPC Error: ${data.error.message}`);
    }

    return data.result;
  }

  /**
   * 最新ブロック情報取得
   */
  async getLatestBlock(): Promise<BTCBlockInfo> {
    const bestBlockHash = await this.call('getbestblockhash') as string;
    const block = await this.call('getblock', [bestBlockHash]) as {
      height: number;
      hash: string;
      time: number;
      nTx: number;
    };

    return {
      height: block.height,
      hash: block.hash,
      time: block.time,
      txCount: block.nTx
    };
  }

  /**
   * ブロック内のトランザクション一覧取得
   */
  async getBlockTransactions(blockHash: string): Promise<string[]> {
    const block = await this.call('getblock', [blockHash]) as { tx: string[] };
    return block.tx;
  }

  /**
   * トランザクション詳細取得
   */
  async getTransaction(txid: string): Promise<BTCTransaction> {
    return await this.call('getrawtransaction', [txid, true]) as BTCTransaction;
  }

  /**
   * アドレスのUTXO一覧取得
   */
  async getAddressUTXOs(address: string): Promise<UTXO[]> {
    try {
      // Bitcoin Coreにはgetaddressutxosがないため、代替手段を使用
      // 実際の実装では外部APIまたはインデクサーを使用
      const result = await this.call('scantxoutset', ['start', [`addr(${address})`]]) as {
        success: boolean;
        txouts: Array<{
          bestblock: string;
          confirmations: number;
          value: number;
          scriptPubKey: {
            asm: string;
            hex: string;
            type: string;
            address: string;
          };
          txid: string;
          vout: number;
        }>;
      };

      if (!result.success) {
        return [];
      }

      return result.txouts.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        amount: Math.round(utxo.value * 100000000), // BTCをsatoshiに変換
        scriptPubKey: utxo.scriptPubKey.hex,
        address: utxo.scriptPubKey.address,
        confirmations: utxo.confirmations,
        spent: false
      }));

    } catch (error) {
      console.error('アドレスUTXO取得エラー:', error);
      return [];
    }
  }
}

/**
 * Bitcoin入金検知システム
 */
export class BTCDepositDetector {
  private rpcClient: BitcoinRPCClient;
  private utxoManager: UTXOManager;
  private network: 'mainnet' | 'testnet';
  private minConfirmations: number;
  private lastProcessedBlock: number = 0;

  constructor(
    rpcUrl: string,
    username: string,
    password: string,
    network: 'mainnet' | 'testnet' = 'mainnet',
    minConfirmations: number = 6
  ) {
    this.rpcClient = new BitcoinRPCClient(rpcUrl, username, password);
    this.utxoManager = new UTXOManager(network);
    this.network = network;
    this.minConfirmations = minConfirmations;
  }

  /**
   * 入金検知の開始
   */
  async startDetection(): Promise<void> {
    // 最後に処理したブロック高を取得
    await this.loadLastProcessedBlock();
    
    console.log(`Bitcoin入金検知開始 (ネットワーク: ${this.network}, 最小確認数: ${this.minConfirmations})`);
  }

  /**
   * 最後に処理したブロック高をロード
   */
  private async loadLastProcessedBlock(): Promise<void> {
    try {
      // 直接SQLでdeposit_detection_stateテーブルにアクセス
      const { data, error } = await supabase
        .from('deposit_detection_state' as unknown as string)
        .select('last_block_height')
        .eq('chain', 'bitcoin')
        .eq('network', this.network)
        .maybeSingle();

      if (error || !data) {
        // 初回実行時は現在のブロック高から開始
        const latestBlock = await this.rpcClient.getLatestBlock();
        this.lastProcessedBlock = latestBlock.height;
      } else {
        this.lastProcessedBlock = (data as { last_block_height: number }).last_block_height;
      }

    } catch (error) {
      console.error('最後の処理ブロック取得エラー:', error);
      const latestBlock = await this.rpcClient.getLatestBlock();
      this.lastProcessedBlock = latestBlock.height;
    }
  }

  /**
   * 最後に処理したブロック高を保存
   */
  private async saveLastProcessedBlock(blockHeight: number): Promise<void> {
    try {
      // 直接SQLでdeposit_detection_stateテーブルを更新
      const { error } = await supabase
        .from('deposit_detection_state' as unknown as string)
        .upsert({
          chain: 'bitcoin',
          network: this.network,
          last_block_height: blockHeight,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('処理ブロック保存エラー:', error);
      }

    } catch (error) {
      console.error('処理ブロック保存エラー:', error);
    }
  }

  /**
   * 新しいブロックをスキャンして入金を検知
   */
  async scanForDeposits(): Promise<BTCDepositResult[]> {
    const results: BTCDepositResult[] = [];

    try {
      const latestBlock = await this.rpcClient.getLatestBlock();
      
      // 新しいブロックがない場合は終了
      if (latestBlock.height <= this.lastProcessedBlock) {
        return results;
      }

      console.log(`Bitcoin新ブロック検知: ${this.lastProcessedBlock + 1} -> ${latestBlock.height}`);

      // 管理対象のアドレス一覧を取得
      const depositAddresses = await this.getDepositAddresses();
      
      if (depositAddresses.length === 0) {
        console.log('管理対象のBitcoinアドレスがありません');
        await this.saveLastProcessedBlock(latestBlock.height);
        return results;
      }

      // 各ブロックを処理
      for (let height = this.lastProcessedBlock + 1; height <= latestBlock.height; height++) {
        const blockResults = await this.processBlock(height, depositAddresses);
        results.push(...blockResults);
      }

      // 処理済みブロック高を更新
      this.lastProcessedBlock = latestBlock.height;
      await this.saveLastProcessedBlock(latestBlock.height);

    } catch (error) {
      console.error('Bitcoin入金スキャンエラー:', error);
      throw error;
    }

    return results;
  }

  /**
   * 指定されたブロックを処理
   */
  private async processBlock(
    blockHeight: number,
    depositAddresses: Array<{address: string; userId: string; addressId: string}>
  ): Promise<BTCDepositResult[]> {
    const results: BTCDepositResult[] = [];

    try {
      // ブロックハッシュ取得
      const blockHash = await this.rpcClient.call('getblockhash', [blockHeight]) as string;
      
      // ブロック内のトランザクション一覧取得
      const txids = await this.rpcClient.getBlockTransactions(blockHash);

      // 各トランザクションを処理
      for (const txid of txids) {
        const txResults = await this.processTransaction(txid, blockHeight, depositAddresses);
        results.push(...txResults);
      }

    } catch (error) {
      console.error(`ブロック ${blockHeight} 処理エラー:`, error);
    }

    return results;
  }

  /**
   * トランザクションを処理して入金を検知
   */
  private async processTransaction(
    txid: string,
    blockHeight: number,
    depositAddresses: Array<{address: string; userId: string; addressId: string}>
  ): Promise<BTCDepositResult[]> {
    const results: BTCDepositResult[] = [];

    try {
      const tx = await this.rpcClient.getTransaction(txid);

      // 各出力をチェック
      for (const output of tx.vout) {
        if (!output.scriptPubKey.addresses) continue;

        for (const address of output.scriptPubKey.addresses) {
          const depositInfo = depositAddresses.find(d => d.address === address);
          
          if (depositInfo) {
            const amountBTC = (output.value / 100000000).toFixed(8); // satoshiをBTCに変換
            const addressInfo = analyzeBTCAddress(address, this.network);

            // 入金情報を記録
            await this.recordDeposit(
              depositInfo.userId,
              depositInfo.addressId,
              amountBTC,
              txid,
              output.n,
              blockHeight,
              address,
              addressInfo.type
            );

            // UTXOマネージャーに追加
            await this.utxoManager.addUTXO({
              txid,
              vout: output.n,
              amount: output.value, // satoshi単位
              scriptPubKey: output.scriptPubKey.hex,
              address,
              confirmations: tx.confirmations || 0,
              spent: false,
              blockHeight,
              timestamp: tx.time
            }, depositInfo.userId);

            results.push({
              userId: depositInfo.userId,
              depositAddress: address,
              amount: amountBTC,
              transactionHash: txid,
              vout: output.n,
              blockHeight,
              confirmations: tx.confirmations || 0,
              addressType: addressInfo.type,
              timestamp: tx.time || Date.now() / 1000
            });

            console.log(`Bitcoin入金検知: ${amountBTC} BTC -> ${address} (${txid}:${output.n})`);
          }
        }
      }

    } catch (error) {
      console.error(`トランザクション ${txid} 処理エラー:`, error);
    }

    return results;
  }

  /**
   * 管理対象のBitcoinアドレス一覧を取得
   */
  private async getDepositAddresses(): Promise<Array<{
    address: string;
    userId: string;
    addressId: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('deposit_addresses')
        .select('id, user_id, address')
        .eq('chain', 'bitcoin')
        .eq('network', this.network)
        .eq('active', true);

      if (error) {
        console.error('Bitcoinアドレス取得エラー:', error);
        return [];
      }

      return data.map(item => ({
        address: item.address,
        userId: item.user_id,
        addressId: item.id
      }));

    } catch (error) {
      console.error('Bitcoinアドレス取得エラー:', error);
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
    vout: number,
    blockHeight: number,
    address: string,
    addressType: string
  ): Promise<void> {
    try {
      // 重複チェック
      const { data: existing } = await supabase
        .from('deposits')
        .select('id')
        .eq('transaction_hash', transactionHash)
        .eq('wallet_address', address)
        .eq('asset', 'BTC')
        .single();

      if (existing) {
        console.log(`Bitcoin入金 ${transactionHash}:${vout} は既に記録済み`);
        return;
      }

      // 入金レコード作成
      const { error } = await supabase
        .from('deposits')
        .insert({
          user_id: userId,
          amount: parseFloat(amount),
          currency: 'BTC',
          chain: 'bitcoin',
          network: this.network,
          asset: 'BTC',
          status: 'pending',
          transaction_hash: transactionHash,
          wallet_address: address,
          confirmations_required: this.minConfirmations,
          confirmations_observed: 0,
          memo_tag: `${vout}:${addressType}:${blockHeight}`
        });

      if (error) {
        console.error('Bitcoin入金記録エラー:', error);
        throw error;
      }

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.DEPOSIT_REQUEST,
        'btc_deposit_detector',
        {
          userId,
          amount,
          transactionHash,
          vout,
          blockHeight,
          address,
          addressType
        },
        { userId, riskLevel: 'medium' }
      );

      console.log(`Bitcoin入金記録完了: ${amount} BTC (${transactionHash}:${vout})`);

    } catch (error) {
      console.error('Bitcoin入金記録エラー:', error);
      throw error;
    }
  }

  /**
   * 入金確認数を更新
   */
  async updateConfirmations(): Promise<void> {
    try {
      const latestBlock = await this.rpcClient.getLatestBlock();

      // 未確認の入金一覧取得
      const { data: pendingDeposits } = await supabase
        .from('deposits')
        .select('id, transaction_hash, memo_tag, confirmations_required, user_id, amount, asset')
        .eq('chain', 'bitcoin')
        .eq('network', this.network)
        .eq('status', 'pending');

      if (!pendingDeposits?.length) return;

      for (const deposit of pendingDeposits) {
        try {
          const tx = await this.rpcClient.getTransaction(deposit.transaction_hash);
          const confirmations = tx.confirmations || 0;

          // 確認数を更新
          const { error } = await supabase
            .from('deposits')
            .update({
              confirmations_observed: confirmations,
              status: confirmations >= deposit.confirmations_required ? 'confirmed' : 'pending'
            })
            .eq('id', deposit.id);

          if (error) {
            console.error(`確認数更新エラー (${deposit.transaction_hash}):`, error);
            continue;
          }

          // 確認完了時の処理
          if (confirmations >= deposit.confirmations_required) {
            await AuditLogger.log(
              AuditAction.DEPOSIT_CONFIRM,
              'btc_deposit_detector',
              {
                transactionHash: deposit.transaction_hash,
                confirmations,
                amount: deposit.amount
              },
              { userId: deposit.user_id, riskLevel: 'low' }
            );

            console.log(`Bitcoin入金確認完了: ${deposit.transaction_hash} (${confirmations}確認)`);
          }

        } catch (error) {
          console.error(`確認数チェックエラー (${deposit.transaction_hash}):`, error);
        }
      }

    } catch (error) {
      console.error('Bitcoin確認数更新エラー:', error);
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latestBlock?: number;
    network: string;
    lastProcessedBlock: number;
  }> {
    try {
      const latestBlock = await this.rpcClient.getLatestBlock();
      return {
        connected: true,
        latestBlock: latestBlock.height,
        network: this.network,
        lastProcessedBlock: this.lastProcessedBlock
      };
    } catch (error) {
      return {
        connected: false,
        network: this.network,
        lastProcessedBlock: this.lastProcessedBlock
      };
    }
  }
}