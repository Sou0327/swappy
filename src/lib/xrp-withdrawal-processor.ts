import { 
  Client, 
  Wallet as XRPLWallet, 
  Payment, 
  dropsToXrp, 
  xrpToDrops, 
  SubmitResponse 
} from 'xrpl';
import { XRPWalletManager, XRP_NETWORKS } from './wallets/xrp-wallet';
import { AuditLogger, AuditAction } from './security/audit-logger';
import { FinancialEncryption } from './security/encryption';
import { supabase } from '@/integrations/supabase/client';

/**
 * XRP出金要求
 */
export interface XRPWithdrawalRequest {
  id: string;
  userId: string;
  toAddress: string;
  amount: string; // XRP単位
  destinationTag?: number;
  fee?: string; // XRP単位
  memo?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  maxFee?: string; // 最大手数料制限
  createdAt: string;
}

/**
 * XRP出金結果
 */
export interface XRPWithdrawalResult {
  withdrawalId: string;
  transactionHash: string;
  actualFee: string; // XRP単位
  ledgerIndex: number;
  validated: boolean;
  status: 'pending' | 'confirmed' | 'failed';
  submittedAt: string;
}

/**
 * XRP出金処理設定
 */
export interface XRPWithdrawalConfig {
  maxDailyAmount: number; // XRP
  maxSingleAmount: number; // XRP
  minReserve: number; // XRP (アカウント準備金)
  maxFee: number; // XRP
  defaultFee: number; // XRP
  hotWalletMinBalance: number; // XRP
  coldWalletThreshold: number; // XRP
  retryAttempts: number;
  retryDelayMs: number;
}

/**
 * XRPホットウォレット設定
 */
export interface XRPHotWalletConfig {
  address: string;
  encryptedSeed: string;
  encryptedPrivateKey: string;
  publicKey: string;
  maxBalance: number; // XRP
  sequence?: number;
}

/**
 * XRP出金処理システム
 */
export class XRPWithdrawalProcessor {
  private client: Client;
  private network: string;
  private networkConfig: typeof XRP_NETWORKS[keyof typeof XRP_NETWORKS];
  private config: XRPWithdrawalConfig;
  private hotWallets: Map<string, XRPHotWalletConfig> = new Map();
  private isConnected: boolean = false;

  constructor(
    network: string = 'mainnet',
    config?: Partial<XRPWithdrawalConfig>
  ) {
    this.network = network;
    this.networkConfig = XRP_NETWORKS[network];
    
    if (!this.networkConfig) {
      throw new Error(`サポートされていないXRPネットワーク: ${network}`);
    }

    this.client = new Client(this.networkConfig.server);
    
    // デフォルト設定
    this.config = {
      maxDailyAmount: 50000, // 50,000 XRP
      maxSingleAmount: 10000, // 10,000 XRP
      minReserve: 10, // 10 XRP
      maxFee: 1, // 1 XRP
      defaultFee: 0.000012, // 12 drops
      hotWalletMinBalance: 1000, // 1,000 XRP
      coldWalletThreshold: 10000, // 10,000 XRP
      retryAttempts: 3,
      retryDelayMs: 5000,
      ...config
    };

    this.loadHotWallets();
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
   * ホットウォレット設定を読み込み
   */
  private async loadHotWallets(): Promise<void> {
    try {
      const { data: wallets } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string | boolean) => {
              eq: (column: string, value: string | boolean) => {
                eq: (column: string, value: string | boolean) => {
                  eq: (column: string, value: string | boolean) => Promise<{
                    data: Array<{ id: string; address: string }> | null;
                  }>;
                };
              };
            };
          };
        };
      })
        .from('admin_wallets')
        .select('*')
        .eq('chain', 'xrp')
        .eq('network', this.network)
        .eq('asset', 'XRP')
        .eq('active', true);

      if (wallets) {
        for (const wallet of wallets) {
          // admin_walletsテーブルは基本的なウォレット情報のみ保存
          // 暗号化された秘密鍵などは別途管理が必要
          this.hotWallets.set(wallet.id, {
            address: wallet.address,
            encryptedSeed: '', // 実装時に別途設定
            encryptedPrivateKey: '', // 実装時に別途設定
            publicKey: '', // 実装時に別途設定
            maxBalance: 1000, // デフォルト値、実装時に設定可能にする
            sequence: 0 // デフォルト値、実装時に取得・更新
          });
        }
      }

    } catch (error) {
      console.error('XRPホットウォレット設定読み込みエラー:', error);
    }
  }

  /**
   * 出金要求を処理
   */
  async processWithdrawal(request: XRPWithdrawalRequest): Promise<XRPWithdrawalResult> {
    try {
      await this.connect();

      // 出金前検証
      await this.validateWithdrawalRequest(request);

      // 最適なホットウォレットを選択
      const hotWallet = await this.selectOptimalHotWallet(parseFloat(request.amount));
      
      if (!hotWallet) {
        throw new Error('利用可能なホットウォレットがありません');
      }

      // XRPLウォレットを復元
      const wallet = await this.restoreWallet(hotWallet);

      // Payment トランザクションを作成・送信
      const result = await this.sendPayment(request, wallet, hotWallet);

      // 出金状態を更新
      await this.updateWithdrawalStatus(request.id, 'pending', result.transactionHash);

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.WITHDRAWAL_REQUEST,
        'xrp_withdrawal_processor',
        {
          withdrawalId: request.id,
          amount: request.amount,
          toAddress: request.toAddress,
          transactionHash: result.transactionHash,
          fee: result.actualFee,
          ledgerIndex: result.ledgerIndex
        },
        { userId: request.userId, riskLevel: 'high' }
      );

      return result;

    } catch (error) {
      console.error(`XRP出金処理エラー (${request.id}):`, error);
      
      // 出金を失敗としてマーク
      await this.updateWithdrawalStatus(request.id, 'failed', undefined, error.message);
      
      throw error;
    }
  }

  /**
   * 出金要求の検証
   */
  private async validateWithdrawalRequest(request: XRPWithdrawalRequest): Promise<void> {
    // アドレス妥当性チェック
    if (!XRPWalletManager.validateXRPAddress(request.toAddress)) {
      throw new Error('無効な送金先アドレス');
    }

    // 金額妥当性チェック
    const amount = parseFloat(request.amount);
    if (amount <= 0) {
      throw new Error('出金額は正の値である必要があります');
    }

    if (amount > this.config.maxSingleAmount) {
      throw new Error(`単回出金限度額を超えています (最大: ${this.config.maxSingleAmount} XRP)`);
    }

    // 最小送金額チェック（1 drop = 0.000001 XRP）
    if (amount < 0.000001) {
      throw new Error('送金額が最小値を下回っています');
    }

    // 日次限度額チェック
    const dailyTotal = await this.getDailyWithdrawalTotal(request.userId);
    if (dailyTotal + amount > this.config.maxDailyAmount) {
      throw new Error(`日次出金限度額を超えています (最大: ${this.config.maxDailyAmount} XRP)`);
    }

    // ユーザー残高チェック
    const userBalance = await this.getUserBalance(request.userId);
    if (userBalance < amount) {
      throw new Error('残高が不足しています');
    }

    // 手数料制限チェック
    if (request.maxFee) {
      const maxFee = parseFloat(request.maxFee);
      if (maxFee > this.config.maxFee) {
        throw new Error(`手数料制限が高すぎます (最大: ${this.config.maxFee} XRP)`);
      }
    }

    // Destination Tagの妥当性チェック
    if (request.destinationTag !== undefined) {
      if (request.destinationTag < 0 || request.destinationTag > 4294967295) {
        throw new Error('無効なDestination Tag');
      }
    }
  }

  /**
   * 最適なホットウォレットを選択
   */
  private async selectOptimalHotWallet(amount: number): Promise<XRPHotWalletConfig | null> {
    for (const [walletId, wallet] of this.hotWallets) {
      try {
        // ウォレット残高を確認
        const accountInfo = await this.client.request({
          command: 'account_info',
          account: wallet.address,
          ledger_index: 'validated'
        });

        const balance = parseFloat(dropsToXrp(accountInfo.result.account_data.Balance));
        const requiredAmount = amount + this.config.defaultFee + this.config.minReserve;

        // 十分な残高があるかチェック
        if (balance >= requiredAmount) {
          // シーケンス番号を更新
          wallet.sequence = accountInfo.result.account_data.Sequence;
          return wallet;
        }

      } catch (error) {
        console.error(`XRPウォレット ${walletId} の残高確認エラー:`, error);
      }
    }

    return null;
  }

  /**
   * 暗号化されたシードからウォレットを復元
   */
  private async restoreWallet(hotWallet: XRPHotWalletConfig): Promise<XRPLWallet> {
    try {
      const encryptedSeed = JSON.parse(hotWallet.encryptedSeed);
      const seed = await FinancialEncryption.decrypt(
        encryptedSeed,
        process.env.WALLET_MASTER_PASSWORD || '***REMOVED***'
      );

      return XRPLWallet.fromSeed(seed);

    } catch (error) {
      throw new Error(`XRPウォレット復元に失敗: ${error.message}`);
    }
  }

  /**
   * XRP送金を実行
   */
  private async sendPayment(
    request: XRPWithdrawalRequest,
    wallet: XRPLWallet,
    hotWallet: XRPHotWalletConfig
  ): Promise<XRPWithdrawalResult> {
    try {
      // 手数料を決定
      const fee = request.fee ? 
        xrpToDrops(request.fee) : 
        xrpToDrops(this.config.defaultFee.toString());

      // Payment トランザクション作成
      const payment: Payment = {
        TransactionType: 'Payment',
        Account: wallet.address,
        Destination: request.toAddress,
        Amount: xrpToDrops(request.amount),
        Fee: fee,
        Sequence: hotWallet.sequence!,
        DestinationTag: request.destinationTag,
        Memos: request.memo ? [{
          Memo: {
            MemoData: Buffer.from(request.memo, 'utf8').toString('hex').toUpperCase()
          }
        }] : undefined
      };

      // トランザクション準備（手数料・シーケンス番号自動設定）
      const prepared = await this.client.autofill(payment);

      // 実際の手数料を確認
      const actualFeeXRP = dropsToXrp(prepared.Fee || fee);
      if (parseFloat(actualFeeXRP) > this.config.maxFee) {
        throw new Error(`手数料が制限を超えています (${actualFeeXRP} XRP > ${this.config.maxFee} XRP)`);
      }

      // トランザクション署名
      const signed = wallet.sign(prepared);

      // リトライロジックでトランザクション送信
      const response = await this.submitWithRetry(signed.tx_blob, request.id);

      // 送信結果を検証
      if (response.result.engine_result !== 'tesSUCCESS') {
        throw new Error(`トランザクション失敗: ${response.result.engine_result_message}`);
      }

      // ホットウォレットのシーケンス番号を更新
      await this.updateWalletSequence(hotWallet, prepared.Sequence! + 1);

      return {
        withdrawalId: request.id,
        transactionHash: signed.hash,
        actualFee: actualFeeXRP.toString(),
        ledgerIndex: (response.result.tx_json as unknown as { inLedger?: number }).inLedger || 0,
        validated: false, // 最初はfalse、後で検証
        status: 'pending',
        submittedAt: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`XRP送金処理に失敗: ${error.message}`);
    }
  }

  /**
   * リトライロジック付きトランザクション送信
   */
  private async submitWithRetry(txBlob: string, withdrawalId: string): Promise<SubmitResponse> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response: SubmitResponse = await this.client.submit(txBlob);
        
        // 成功時はすぐに返す
        if (response.result.engine_result === 'tesSUCCESS' || 
            response.result.engine_result.startsWith('tes')) {
          return response;
        }

        // 一時的なエラーの場合はリトライ
        if (response.result.engine_result === 'terQUEUED' ||
            response.result.engine_result === 'terPRE_SEQ') {
          
          if (attempt < this.config.retryAttempts) {
            console.log(`XRP送金リトライ ${attempt}/${this.config.retryAttempts} (${withdrawalId}): ${response.result.engine_result}`);
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs * attempt));
            continue;
          }
        }

        // 致命的なエラーの場合は即座に失敗
        throw new Error(`送金失敗: ${response.result.engine_result_message}`);

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          console.log(`XRP送金リトライ ${attempt}/${this.config.retryAttempts} (${withdrawalId}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs * attempt));
        }
      }
    }

    throw lastError!;
  }

  /**
   * ウォレットシーケンス番号を更新
   */
  private async updateWalletSequence(hotWallet: XRPHotWalletConfig, newSequence: number): Promise<void> {
    try {
      hotWallet.sequence = newSequence;

      // データベースも更新。admin_walletsテーブルにはsequenceカラムがないため、
      // 実装時には別途シーケンス管理テーブルを作成するか、
      // メモリ内で管理することを推奨
      console.log(`XRPウォレットシーケンス更新: ${hotWallet.address} -> ${newSequence}`);

    } catch (error) {
      console.error('ウォレットシーケンス更新エラー:', error);
    }
  }

  /**
   * 日次出金総額を取得
   */
  private async getDailyWithdrawalTotal(userId: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              eq: (column: string, value: string) => {
                eq: (column: string, value: string) => {
                  gte: (column: string, value: string) => {
                    neq: (column: string, value: string) => Promise<{
                      data: Array<{ amount: number }> | null;
                      error: unknown;
                    }>;
                  };
                };
              };
            };
          };
        };
      })
        .from('withdrawals')
        .select('amount')
        .eq('user_id', userId)
        .eq('chain', 'xrp')
        .eq('network', this.network)
        .gte('created_at', today.toISOString())
        .neq('status', 'failed');

      if (error || !data) {
        return 0;
      }

      return data.reduce((total, withdrawal) => total + withdrawal.amount, 0);

    } catch (error) {
      console.error('日次出金総額取得エラー:', error);
      return 0;
    }
  }

  /**
   * ユーザーXRP残高を取得
   */
  private async getUserBalance(userId: string): Promise<number> {
    try {
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              eq: (column: string, value: string) => {
                single: () => Promise<{
                  data: { available_balance: number } | null;
                  error: unknown;
                }>;
              };
            };
          };
        };
      })
        .from('user_balances')
        .select('available_balance')
        .eq('user_id', userId)
        .eq('asset', 'XRP')
        .single();

      if (error || !data) {
        return 0;
      }

      return data.available_balance;

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

      const { error } = await (supabase as unknown as {
        from: (table: string) => {
          update: (data: Record<string, unknown>) => {
            eq: (column: string, value: string) => Promise<{ error: unknown }>;
          };
        };
      })
        .from('withdrawals')
        .update(updateData)
        .eq('id', withdrawalId);

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
      await this.connect();

      const { data: pendingWithdrawals } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              eq: (column: string, value: string) => {
                eq: (column: string, value: string) => Promise<{
                  data: Array<Record<string, unknown>> | null;
                }>;
              };
            };
          };
        };
      })
        .from('withdrawals')
        .select('*')
        .eq('chain', 'xrp')
        .eq('network', this.network)
        .eq('status', 'pending');

      if (!pendingWithdrawals?.length) {
        return;
      }

      for (const withdrawal of pendingWithdrawals) {
        await this.checkWithdrawalConfirmation(withdrawal);
      }

    } catch (error) {
      console.error('XRP出金確認処理エラー:', error);
    }
  }

  /**
   * 個別出金の確認チェック
   */
  private async checkWithdrawalConfirmation(withdrawal: Record<string, unknown>): Promise<void> {
    try {
      const txResponse = await this.client.request({
        command: 'tx',
        transaction: withdrawal.transaction_hash as string
      });

      const isValidated = txResponse.result.validated;

      if (isValidated) {
        await this.updateWithdrawalStatus(withdrawal.id as string, 'confirmed');

        // 監査ログ記録
        await AuditLogger.log(
          AuditAction.DEPOSIT_CONFIRM,
          'xrp_withdrawal_processor',
          {
            withdrawalId: withdrawal.id,
            transactionHash: withdrawal.transaction_hash,
            ledgerIndex: txResponse.result.ledger_index
          },
          { userId: withdrawal.user_id as string, riskLevel: 'medium' }
        );

        console.log(`XRP出金確認完了: ${withdrawal.id} (レジャー: ${txResponse.result.ledger_index})`);
      }

    } catch (error) {
      if (error.data?.error === 'txnNotFound') {
        // トランザクションが見つからない場合は再確認待ち
        return;
      }
      
      console.error(`出金確認チェックエラー (${withdrawal.id}):`, error);
    }
  }

  /**
   * ホットウォレット残高管理
   */
  async manageHotWalletBalances(): Promise<void> {
    try {
      await this.connect();

      for (const [walletId, wallet] of this.hotWallets) {
        const accountInfo = await this.client.request({
          command: 'account_info',
          account: wallet.address,
          ledger_index: 'validated'
        });

        const balance = parseFloat(dropsToXrp(accountInfo.result.account_data.Balance));

        // 残高が閾値を超えた場合、コールドウォレットに送金
        if (balance > wallet.maxBalance) {
          await this.transferTowardsColdWallet(wallet, balance - this.config.hotWalletMinBalance);
        }

        // 残高が不足している場合、アラート
        if (balance < this.config.hotWalletMinBalance) {
          await this.alertLowBalance(walletId, balance);
        }
      }

    } catch (error) {
      console.error('XRPホットウォレット残高管理エラー:', error);
    }
  }

  /**
   * コールドウォレットへの送金
   */
  private async transferTowardsColdWallet(wallet: XRPHotWalletConfig, amount: number): Promise<void> {
    try {
      // コールドウォレットアドレスを取得
      const coldWalletAddress = await this.getColdWalletAddress();
      
      if (!coldWalletAddress) {
        console.warn('XRPコールドウォレットアドレスが設定されていません');
        return;
      }

      // 内部送金要求を作成
      const internalRequest: XRPWithdrawalRequest = {
        id: `internal_${Date.now()}`,
        userId: 'system',
        toAddress: coldWalletAddress,
        amount: amount.toFixed(6),
        priority: 'low',
        memo: 'ホットウォレット -> コールドウォレット',
        createdAt: new Date().toISOString()
      };

      await this.processWithdrawal(internalRequest);

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.BALANCE_UPDATE,
        'xrp_withdrawal_processor',
        {
          fromAddress: wallet.address,
          toAddress: coldWalletAddress,
          amount,
          type: 'hot_to_cold'
        },
        { userId: 'system', riskLevel: 'medium' }
      );

    } catch (error) {
      console.error('XRPコールドウォレット送金エラー:', error);
    }
  }

  /**
   * 残高不足アラート
   */
  private async alertLowBalance(walletId: string, balance: number): Promise<void> {
    await AuditLogger.log(
      AuditAction.SECURITY_ALERT,
      'xrp_withdrawal_processor',
      {
        walletId,
        balance,
        threshold: this.config.hotWalletMinBalance
      },
      { userId: 'system', riskLevel: 'high' }
    );

    console.warn(`XRPホットウォレット残高不足: ${walletId} (${balance} XRP)`);
  }

  /**
   * コールドウォレットアドレスを取得
   */
  private async getColdWalletAddress(): Promise<string | null> {
    try {
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string | boolean) => {
              eq: (column: string, value: string | boolean) => {
                eq: (column: string, value: string | boolean) => {
                  eq: (column: string, value: string | boolean) => {
                    single: () => Promise<{
                      data: { address: string } | null;
                      error: unknown;
                    }>;
                  };
                };
              };
            };
          };
        };
      })
        .from('admin_wallets')
        .select('address')
        .eq('chain', 'xrp')
        .eq('network', this.network)
        .eq('asset', 'XRP')
        .eq('active', true)
        .single();

      if (error || !data) {
        return null;
      }

      return data.address;

    } catch (error) {
      console.error('XRPコールドウォレットアドレス取得エラー:', error);
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
      sequence: number;
    }>;
    averageProcessingTime: number;
    successRate: number;
  }> {
    try {
      // 未処理出金統計
      const { data: pendingWithdrawals } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              eq: (column: string, value: string) => {
                eq: (column: string, value: string) => Promise<{
                  data: Array<{ amount: number }> | null;
                }>;
              };
            };
          };
        };
      })
        .from('withdrawals')
        .select('amount')
        .eq('chain', 'xrp')
        .eq('network', this.network)
        .eq('status', 'pending');

      const totalPending = pendingWithdrawals?.length || 0;
      const totalPendingAmount = pendingWithdrawals?.reduce((sum, w) => sum + w.amount, 0) || 0;

      // ホットウォレット残高
      await this.connect();
      const hotWalletBalances = [];

      for (const wallet of this.hotWallets.values()) {
        try {
          const accountInfo = await this.client.request({
            command: 'account_info',
            account: wallet.address,
            ledger_index: 'validated'
          });

          const balance = parseFloat(dropsToXrp(accountInfo.result.account_data.Balance));
          
          hotWalletBalances.push({
            address: wallet.address,
            balance: balance.toFixed(6),
            utilization: (balance / wallet.maxBalance) * 100,
            sequence: accountInfo.result.account_data.Sequence
          });
        } catch (error) {
          console.error(`ウォレット ${wallet.address} の残高取得エラー:`, error);
        }
      }

      return {
        totalPendingWithdrawals: totalPending,
        totalPendingAmount: totalPendingAmount.toFixed(6),
        hotWalletBalances,
        averageProcessingTime: 0, // 実装: 実際の処理時間を計算
        successRate: 0 // 実装: 成功率を計算
      };

    } catch (error) {
      console.error('XRP統計情報取得エラー:', error);
      return {
        totalPendingWithdrawals: 0,
        totalPendingAmount: '0',
        hotWalletBalances: [],
        averageProcessingTime: 0,
        successRate: 0
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