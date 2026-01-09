import { BitcoinHDWallet } from './wallets/btc-wallet';
import { UTXOManager, ConstructedTransaction, TransactionOutput, UTXOSelectionStrategy, FeeEstimationLevel } from './utxo-manager';
import { analyzeBTCAddress, validateBTCAddress } from './btc-address-validator';
import { AuditLogger, AuditAction } from './security/audit-logger';
import { FinancialEncryption } from './security/encryption';
import { supabase } from '@/integrations/supabase/client';

/**
 * Bitcoin出金要求
 */
export interface BTCWithdrawalRequest {
  id: string;
  userId: string;
  toAddress: string;
  amount: string; // BTC単位
  fee?: string; // BTC単位
  priority: 'low' | 'medium' | 'high' | 'urgent';
  memo?: string;
  maxFee?: string; // 最大手数料制限
  createdAt: string;
}

/**
 * Bitcoin出金結果
 */
export interface BTCWithdrawalResult {
  withdrawalId: string;
  transactionHash: string;
  actualFee: string; // BTC単位
  inputCount: number;
  outputCount: number;
  totalInput: string; // BTC単位
  changeAmount: string; // BTC単位
  status: 'pending' | 'confirmed' | 'failed';
  broadcastAt: string;
}

/**
 * 出金処理設定
 */
export interface WithdrawalConfig {
  maxDailyAmount: number;
  maxSingleAmount: number;
  minConfirmationsRequired: number;
  maxFeeRate: number; // sat/vB
  dustThreshold: number; // satoshi
  maxInputs: number;
  hotWalletThreshold: number; // BTC
  coldWalletThreshold: number; // BTC
}

/**
 * ホットウォレット設定
 */
export interface HotWalletConfig {
  address: string;
  encryptedPrivateKey: string;
  encryptedSeed: string;
  derivationPath: string;
  addressType: 'P2PKH' | 'P2SH' | 'P2WPKH';
  maxBalance: number; // BTC
}

/**
 * Bitcoin出金処理システム
 */
export class BTCWithdrawalProcessor {
  private utxoManager: UTXOManager;
  private network: 'mainnet' | 'testnet';
  private config: WithdrawalConfig;
  private hotWallets: Map<string, HotWalletConfig> = new Map();

  constructor(
    network: 'mainnet' | 'testnet' = 'mainnet',
    config?: Partial<WithdrawalConfig>
  ) {
    this.network = network;
    this.utxoManager = new UTXOManager(network);
    
    // デフォルト設定
    this.config = {
      maxDailyAmount: 10, // 10 BTC
      maxSingleAmount: 5, // 5 BTC
      minConfirmationsRequired: 6,
      maxFeeRate: 100, // 100 sat/vB
      dustThreshold: 546, // 546 satoshi
      maxInputs: 100,
      hotWalletThreshold: 1, // 1 BTC
      coldWalletThreshold: 10, // 10 BTC
      ...config
    };

    this.loadHotWallets();
  }

  /**
   * ホットウォレット設定を読み込み
   */
  private async loadHotWallets(): Promise<void> {
    try {
      // Supabase型定義との互換性のため型アサーションを使用
      interface AdminWallet {
        id: string;
        address: string;
        chain: string;
        network: string;
        asset: string;
        active: boolean;
      }

      const { data: wallets, error } = await supabase
        .from('admin_wallets')
        .select('id, address, chain, network, asset, active')
        .eq('chain', 'btc')
        .eq('network', this.network)
        .eq('asset', 'BTC')
        .eq('active', true) as { data: AdminWallet[] | null; error: Error | null };

      if (error) {
        console.error('ホットウォレットクエリエラー:', error);
        return;
      }

      if (wallets && Array.isArray(wallets)) {
        for (const wallet of wallets) {
          // 型安全のためのチェック
          if (wallet && typeof wallet === 'object' && wallet.id && wallet.address) {
            // admin_walletsテーブルは基本的なウォレット情報のみ保存
            // 暗号化された秘密鍵などは別途管理が必要
            this.hotWallets.set(String(wallet.id), {
              address: String(wallet.address),
              encryptedPrivateKey: '', // 実装時に別途設定
              encryptedSeed: '', // 実装時に別途設定
              derivationPath: '', // 実装時に別途設定
              addressType: 'P2WPKH', // デフォルト値
              maxBalance: 1 // デフォルト値、実装時に設定可能にする
            });
          }
        }
      }

    } catch (error) {
      console.error('ホットウォレット設定読み込みエラー:', error);
    }
  }

  /**
   * 出金要求を処理
   */
  async processWithdrawal(request: BTCWithdrawalRequest): Promise<BTCWithdrawalResult> {
    try {
      // 出金前検証
      await this.validateWithdrawalRequest(request);

      // 最適なホットウォレットを選択
      const hotWallet = await this.selectOptimalHotWallet(parseFloat(request.amount));
      
      if (!hotWallet) {
        throw new Error('利用可能なホットウォレットがありません');
      }

      // トランザクション構築
      const transaction = await this.buildWithdrawalTransaction(request, hotWallet);

      // トランザクション署名・ブロードキャスト
      const result = await this.signAndBroadcastTransaction(transaction, hotWallet, request);

      // 出金状態を更新
      await this.updateWithdrawalStatus(request.id, 'pending', result.transactionHash);

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.WITHDRAWAL_APPROVE, // WITHDRAWAL_PROCESSEDの代わりに使用
        'btc_withdrawal_processor',
        {
          withdrawalId: request.id,
          amount: request.amount,
          toAddress: request.toAddress,
          transactionHash: result.transactionHash,
          fee: result.actualFee
        },
        { userId: request.userId, riskLevel: 'high' }
      );

      return result;

    } catch (error) {
      console.error(`Bitcoin出金処理エラー (${request.id}):`, error);
      
      // 出金を失敗としてマーク
      await this.updateWithdrawalStatus(request.id, 'failed', undefined, error.message);
      
      throw error;
    }
  }

  /**
   * 出金要求の検証
   */
  private async validateWithdrawalRequest(request: BTCWithdrawalRequest): Promise<void> {
    // アドレス妥当性チェック
    if (!validateBTCAddress(request.toAddress, this.network)) {
      throw new Error('無効な送金先アドレス');
    }

    // 金額妥当性チェック
    const amount = parseFloat(request.amount);
    if (amount <= 0) {
      throw new Error('出金額は正の値である必要があります');
    }

    if (amount > this.config.maxSingleAmount) {
      throw new Error(`単回出金限度額を超えています (最大: ${this.config.maxSingleAmount} BTC)`);
    }

    // 日次限度額チェック
    const dailyTotal = await this.getDailyWithdrawalTotal(request.userId);
    if (dailyTotal + amount > this.config.maxDailyAmount) {
      throw new Error(`日次出金限度額を超えています (最大: ${this.config.maxDailyAmount} BTC)`);
    }

    // ユーザー残高チェック
    const userBalance = await this.getUserBalance(request.userId);
    if (userBalance < amount) {
      throw new Error('残高が不足しています');
    }

    // 手数料制限チェック
    if (request.maxFee) {
      const maxFee = parseFloat(request.maxFee);
      if (maxFee < 0.00001) { // 最小手数料
        throw new Error('手数料制限が低すぎます');
      }
    }
  }

  /**
   * 最適なホットウォレットを選択
   */
  private async selectOptimalHotWallet(amount: number): Promise<HotWalletConfig | null> {
    for (const [walletId, wallet] of this.hotWallets) {
      try {
        // ウォレット残高を確認
        const balance = this.utxoManager.getBalanceByAddress(wallet.address, this.config.minConfirmationsRequired);
        const balanceBTC = balance / 100000000; // satoshiをBTCに変換

        // 十分な残高があるかチェック
        if (balanceBTC >= amount + 0.001) { // 手数料余裕を考慮
          return wallet;
        }

      } catch (error) {
        console.error(`ウォレット ${walletId} の残高確認エラー:`, error);
      }
    }

    return null;
  }

  /**
   * 出金トランザクションを構築
   */
  private async buildWithdrawalTransaction(
    request: BTCWithdrawalRequest,
    hotWallet: HotWalletConfig
  ): Promise<ConstructedTransaction> {
    const amountSatoshi = Math.round(parseFloat(request.amount) * 100000000);

    // 出力を定義
    const outputs: TransactionOutput[] = [
      {
        address: request.toAddress,
        amount: amountSatoshi
      }
    ];

    // 手数料レベルをマッピング
    const feeLevel = this.mapPriorityToFeeLevel(request.priority);

    // UTXO選択戦略を決定
    const strategy = this.selectUTXOStrategy(amountSatoshi);

    // トランザクション構築
    const transaction = await this.utxoManager.constructTransaction(
      outputs,
      hotWallet.address, // お釣りアドレス
      feeLevel,
      strategy,
      request.userId
    );

    // 手数料制限チェック
    if (request.maxFee) {
      const maxFeeSatoshi = Math.round(parseFloat(request.maxFee) * 100000000);
      if (transaction.fee > maxFeeSatoshi) {
        throw new Error(`手数料が制限を超えています (${transaction.fee / 100000000} BTC > ${request.maxFee} BTC)`);
      }
    }

    // 入力数制限チェック
    if (transaction.inputs.length > this.config.maxInputs) {
      throw new Error(`入力数が制限を超えています (${transaction.inputs.length} > ${this.config.maxInputs})`);
    }

    return transaction;
  }

  /**
   * 優先度を手数料レベルにマッピング
   */
  private mapPriorityToFeeLevel(priority: string): FeeEstimationLevel {
    switch (priority) {
      case 'urgent':
        return FeeEstimationLevel.URGENT;
      case 'high':
        return FeeEstimationLevel.HIGH;
      case 'medium':
        return FeeEstimationLevel.MEDIUM;
      case 'low':
      default:
        return FeeEstimationLevel.LOW;
    }
  }

  /**
   * UTXO選択戦略を決定
   */
  private selectUTXOStrategy(amountSatoshi: number): UTXOSelectionStrategy {
    const totalBalance = this.utxoManager.getTotalBalance();
    
    if (amountSatoshi > totalBalance * 0.8) {
      // 大額出金は最適化戦略
      return UTXOSelectionStrategy.OPTIMAL;
    } else if (amountSatoshi < 10000000) { // 0.1 BTC未満
      // 小額出金は最小額優先
      return UTXOSelectionStrategy.SMALLEST_FIRST;
    } else {
      // 中額は Branch and Bound
      return UTXOSelectionStrategy.BRANCH_AND_BOUND;
    }
  }

  /**
   * トランザクション署名・ブロードキャスト
   */
  private async signAndBroadcastTransaction(
    transaction: ConstructedTransaction,
    hotWallet: HotWalletConfig,
    request: BTCWithdrawalRequest
  ): Promise<BTCWithdrawalResult> {
    try {
      // 秘密鍵を復号化
      const encryptedPrivateKey = JSON.parse(hotWallet.encryptedPrivateKey);
      const privateKey = await FinancialEncryption.decrypt(
        encryptedPrivateKey,
        process.env.WALLET_MASTER_PASSWORD || '***REMOVED***'
      );

      // トランザクション署名（簡易版）
      // 実際の実装では bitcoinjs-lib を使用
      const signedTransaction = await this.signTransaction(transaction, privateKey);

      // ブロードキャスト（簡易版）
      const txHash = await this.broadcastTransaction(signedTransaction);

      // UTXOを使用済みとしてマーク
      for (const input of transaction.inputs) {
        await this.utxoManager.spendUTXO(input.txid, input.vout, txHash, request.userId);
      }

      return {
        withdrawalId: request.id,
        transactionHash: txHash,
        actualFee: (transaction.fee / 100000000).toFixed(8),
        inputCount: transaction.inputs.length,
        outputCount: transaction.outputs.length,
        totalInput: (transaction.totalInput / 100000000).toFixed(8),
        changeAmount: transaction.changeAmount ? (transaction.changeAmount / 100000000).toFixed(8) : '0',
        status: 'pending',
        broadcastAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('トランザクション署名・ブロードキャストエラー:', error);
      throw new Error(`トランザクション処理に失敗: ${error.message}`);
    }
  }

  /**
   * トランザクション署名（簡易版）
   */
  private async signTransaction(transaction: ConstructedTransaction, privateKey: string): Promise<string> {
    // 実際の実装では bitcoinjs-lib を使用してトランザクションに署名
    // ここでは簡易的な実装
    const txData = {
      inputs: transaction.inputs,
      outputs: transaction.outputs,
      fee: transaction.fee
    };

    return Buffer.from(JSON.stringify(txData)).toString('hex');
  }

  /**
   * トランザクションブロードキャスト（簡易版）
   */
  private async broadcastTransaction(signedTx: string): Promise<string> {
    // 実際の実装では Bitcoin Core RPC の sendrawtransaction を使用
    // ここでは簡易的な実装
    const crypto = await import('crypto');
    const txHash = crypto.createHash('sha256').update(signedTx).digest('hex');
    
    console.log(`Bitcoin トランザクションブロードキャスト: ${txHash}`);
    return txHash;
  }

  /**
   * 日次出金総額を取得
   */
  private async getDailyWithdrawalTotal(userId: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Supabase型定義との互換性のため型アサーションを使用
      interface WithdrawalAmount {
        amount: number;
      }

      const { data, error } = await supabase
        .from('withdrawals')
        .select('amount')
        .eq('user_id', userId)
        .eq('chain', 'bitcoin')
        .eq('network', this.network)
        .gte('created_at', today.toISOString())
        .neq('status', 'failed') as { data: WithdrawalAmount[] | null; error: Error | null };

      if (error || !data) {
        console.error('日次出金総額取得エラー:', error);
        return 0;
      }

      if (!Array.isArray(data)) {
        return 0;
      }

      return data.reduce((total, withdrawal) => {
        const amount = typeof withdrawal.amount === 'number' ? withdrawal.amount : 0;
        return total + amount;
      }, 0);

    } catch (error) {
      console.error('日次出金総額取得エラー:', error);
      return 0;
    }
  }

  /**
   * ユーザーBTC残高を取得
   */
  private async getUserBalance(userId: string): Promise<number> {
    try {
      // Supabase型定義との互換性のため型アサーションを使用
      interface UserBalance {
        available_balance: number;
      }

      const { data, error } = await supabase
        .from('user_balances')
        .select('available_balance')
        .eq('user_id', userId)
        .eq('asset', 'BTC')
        .single() as { data: UserBalance | null; error: Error | null };

      if (error || !data) {
        console.error('ユーザー残高取得エラー:', error);
        return 0;
      }

      return typeof data.available_balance === 'number' ? data.available_balance : 0;

    } catch (error) {
      console.error('ユーザー残高取得エラー:', error);
      return 0;
    }
  }

  /**
   * 出金状態を更新
   */
  private async updateWithdrawalStatus(
    withdrawalId: string,
    status: string,
    transactionHash?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString()
      };

      if (transactionHash) {
        updateData.transaction_hash = transactionHash;
      }

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      // Supabase型定義との互換性のため型アサーションを使用
      const { error } = await supabase
        .from('withdrawals')
        .update(updateData)
        .eq('id', withdrawalId) as { error: Error | null };

      if (error) {
        console.error('出金状態更新エラー:', error);
      }

    } catch (error) {
      console.error('出金状態更新エラー:', error);
    }
  }

  /**
   * 出金確認処理
   */
  async processWithdrawalConfirmations(): Promise<void> {
    try {
      // Supabase型定義との互換性のため型アサーションを使用
      interface PendingWithdrawal {
        id: string;
        user_id: string;
        transaction_hash?: string;
        [key: string]: unknown;
      }

      const { data: pendingWithdrawals, error } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('chain', 'bitcoin')
        .eq('network', this.network)
        .eq('status', 'pending') as { data: PendingWithdrawal[] | null; error: Error | null };

      if (error || !pendingWithdrawals?.length) {
        if (error) {
          console.error('未処理出金取得エラー:', error);
        }
        return;
      }

      for (const withdrawal of pendingWithdrawals) {
        await this.checkWithdrawalConfirmation(withdrawal);
      }

    } catch (error) {
      console.error('出金確認処理エラー:', error);
    }
  }

  /**
   * 個別出金の確認チェック
   */
  private async checkWithdrawalConfirmation(withdrawal: Record<string, unknown>): Promise<void> {
    try {
      // 実際の実装では Bitcoin Core RPC で確認数をチェック
      // ここでは簡易的な実装
      const confirmations = Math.floor(Math.random() * 10); // モック

      if (confirmations >= this.config.minConfirmationsRequired) {
        await this.updateWithdrawalStatus(withdrawal.id as string, 'confirmed');

        // 監査ログ記録
        await AuditLogger.log(
          AuditAction.WITHDRAWAL_APPROVE, // WITHDRAWAL_CONFIRMEDの代わりに使用
          'btc_withdrawal_processor',
          {
            withdrawalId: withdrawal.id,
            confirmations,
            transactionHash: withdrawal.transaction_hash
          },
          { userId: withdrawal.user_id as string, riskLevel: 'medium' }
        );

        console.log(`Bitcoin出金確認完了: ${withdrawal.id} (${confirmations}確認)`);
      }

    } catch (error) {
      console.error(`出金確認チェックエラー (${withdrawal.id}):`, error);
    }
  }

  /**
   * ホットウォレット残高管理
   */
  async manageHotWalletBalances(): Promise<void> {
    try {
      for (const [walletId, wallet] of this.hotWallets) {
        const balance = this.utxoManager.getBalanceByAddress(wallet.address);
        const balanceBTC = balance / 100000000;

        // 残高が閾値を超えた場合、コールドウォレットに送金
        if (balanceBTC > wallet.maxBalance) {
          await this.transferTowardsColdWallet(wallet, balanceBTC - this.config.hotWalletThreshold);
        }

        // 残高が不足している場合、アラート
        if (balanceBTC < this.config.hotWalletThreshold / 2) {
          await this.alertLowBalance(walletId, balanceBTC);
        }
      }

    } catch (error) {
      console.error('ホットウォレット残高管理エラー:', error);
    }
  }

  /**
   * コールドウォレットへの送金
   */
  private async transferTowardsColdWallet(wallet: HotWalletConfig, amount: number): Promise<void> {
    try {
      // コールドウォレットアドレスを取得
      const coldWalletAddress = await this.getColdWalletAddress();
      
      if (!coldWalletAddress) {
        console.warn('コールドウォレットアドレスが設定されていません');
        return;
      }

      // 内部送金要求を作成
      const internalRequest: BTCWithdrawalRequest = {
        id: `internal_${Date.now()}`,
        userId: 'system',
        toAddress: coldWalletAddress,
        amount: amount.toFixed(8),
        priority: 'low',
        memo: 'ホットウォレット -> コールドウォレット',
        createdAt: new Date().toISOString()
      };

      await this.processWithdrawal(internalRequest);

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.SYSTEM_CONFIG, // INTERNAL_TRANSFERの代わりに使用
        'btc_withdrawal_processor',
        {
          fromAddress: wallet.address,
          toAddress: coldWalletAddress,
          amount,
          type: 'hot_to_cold'
        },
        { userId: 'system', riskLevel: 'medium' }
      );

    } catch (error) {
      console.error('コールドウォレット送金エラー:', error);
    }
  }

  /**
   * 残高不足アラート
   */
  private async alertLowBalance(walletId: string, balance: number): Promise<void> {
    await AuditLogger.log(
      AuditAction.SECURITY_ALERT, // LOW_BALANCE_ALERTの代わりに使用
      'btc_withdrawal_processor',
      {
        walletId,
        balance,
        threshold: this.config.hotWalletThreshold
      },
      { userId: 'system', riskLevel: 'high' }
    );

    console.warn(`ホットウォレット残高不足: ${walletId} (${balance} BTC)`);
  }

  /**
   * コールドウォレットアドレスを取得
   */
  private async getColdWalletAddress(): Promise<string | null> {
    try {
      // Supabase型定義との互換性のため型アサーションを使用
      interface WalletAddress {
        address: string;
      }

      const { data, error } = await supabase
        .from('admin_wallets')
        .select('address')
        .eq('chain', 'btc')
        .eq('network', this.network)
        .eq('asset', 'BTC')
        .eq('active', true)
        .single() as { data: WalletAddress | null; error: Error | null };

      if (error || !data) {
        console.error('コールドウォレットアドレス取得エラー:', error);
        return null;
      }

      // 型安全のためのチェック
      if (data && typeof data === 'object' && data.address && typeof data.address === 'string') {
        return data.address;
      }

      return null;

    } catch (error) {
      console.error('コールドウォレットアドレス取得エラー:', error);
      return null;
    }
  }

  /**
   * 統計情報取得
   */
  async getStatistics(): Promise<{
    totalPendingWithdrawals: number;
    totalPendingAmount: string;
    hotWalletBalances: Array<{
      address: string;
      balance: string;
      utilization: number;
    }>;
    averageProcessingTime: number;
    successRate: number;
  }> {
    try {
      // 未処理出金統計
      // Supabase型定義との互換性のため型アサーションを使用
      interface WithdrawalAmount {
        amount: number;
      }

      const { data: pendingWithdrawals, error } = await supabase
        .from('withdrawals')
        .select('amount')
        .eq('chain', 'bitcoin')
        .eq('network', this.network)
        .eq('status', 'pending') as { data: WithdrawalAmount[] | null; error: Error | null };

      const totalPending = pendingWithdrawals?.length || 0;
      let totalPendingAmount = 0;
      
      if (!error && pendingWithdrawals && Array.isArray(pendingWithdrawals)) {
        totalPendingAmount = pendingWithdrawals.reduce((sum, w) => {
          const amount = typeof w.amount === 'number' ? w.amount : 0;
          return sum + amount;
        }, 0);
      }

      // ホットウォレット残高
      const hotWalletBalances = Array.from(this.hotWallets.values()).map(wallet => {
        const balance = this.utxoManager.getBalanceByAddress(wallet.address);
        const balanceBTC = balance / 100000000;
        return {
          address: wallet.address,
          balance: balanceBTC.toFixed(8),
          utilization: (balanceBTC / wallet.maxBalance) * 100
        };
      });

      return {
        totalPendingWithdrawals: totalPending,
        totalPendingAmount: totalPendingAmount.toFixed(8),
        hotWalletBalances,
        averageProcessingTime: 0, // 実装: 実際の処理時間を計算
        successRate: 0 // 実装: 成功率を計算
      };

    } catch (error) {
      console.error('統計情報取得エラー:', error);
      return {
        totalPendingWithdrawals: 0,
        totalPendingAmount: '0',
        hotWalletBalances: [],
        averageProcessingTime: 0,
        successRate: 0
      };
    }
  }
}