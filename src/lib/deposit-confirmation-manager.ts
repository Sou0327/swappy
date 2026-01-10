import { supabase } from '@/integrations/supabase/client';
import { AuditLogger, AuditAction } from './security/audit-logger';

/**
 * 入金承認状態
 */
export enum DepositStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CREDITED = 'credited',
  REJECTED = 'rejected'
}

/**
 * 入金確認設定
 */
export interface ConfirmationConfig {
  chain: string;
  network: string;
  minConfirmations: number;
  maxConfirmations: number;
  timeoutMinutes: number;
  enabled: boolean;
}

/**
 * 入金承認ルール
 */
export interface ApprovalRule {
  id: string;
  chain: string;
  network: string;
  asset: string;
  minAmount: number;
  maxAmount: number;
  autoApprove: boolean;
  requiresManualApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  conditions: Record<string, unknown>;
}

/**
 * 入金詳細情報
 */
export interface DepositInfo {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  chain: string;
  network: string;
  asset: string;
  status: DepositStatus;
  transactionHash: string;
  walletAddress: string;
  confirmationsRequired: number;
  confirmationsObserved: number;
  memoTag?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 入金確認・承認自動化マネージャー
 */
export class DepositConfirmationManager {
  private configs: Map<string, ConfirmationConfig> = new Map();
  private approvalRules: Map<string, ApprovalRule[]> = new Map();
  private isRunning: boolean = false;

  constructor() {
    this.loadConfigurations();
  }

  /**
   * 設定を読み込み
   */
  private async loadConfigurations(): Promise<void> {
    try {
      // デフォルトのチェーン確認設定（各チェーンの minConfirmations はブロックチェーンの特性に基づく）
      const DEFAULT_CHAIN_CONFIGS = {
        eth: { minConfirmations: 12, maxConfirmations: 24, timeout: 60 },
        btc: { minConfirmations: 3, maxConfirmations: 6, timeout: 120 },
        trc: { minConfirmations: 19, maxConfirmations: 38, timeout: 60 },  // TRON
        xrp: { minConfirmations: 1, maxConfirmations: 2, timeout: 30 },    // XRP Ledger
        ada: { minConfirmations: 15, maxConfirmations: 30, timeout: 60 }   // Cardano
      };

      // 確認設定を生成（CHAIN_CONFIGSからデフォルト設定を生成）
      interface ConfirmationConfigData {
        chain: string;
        network: string;
        min_confirmations: number;
        max_confirmations: number;
        timeout_minutes: number;
        enabled: boolean;
      }

      // デフォルト設定を生成（全チェーン x mainnet/testnet）
      const confirmationConfigs: ConfirmationConfigData[] = Object.entries(DEFAULT_CHAIN_CONFIGS).flatMap(
        ([chain, config]) => [
          {
            chain,
            network: 'mainnet',
            min_confirmations: config.minConfirmations,
            max_confirmations: config.maxConfirmations,
            timeout_minutes: config.timeout,
            enabled: true
          },
          {
            chain,
            network: 'testnet',
            min_confirmations: 1, // テストネットは1確認
            max_confirmations: 2,
            timeout_minutes: 30,
            enabled: true
          }
        ]
      );

      for (const config of confirmationConfigs) {
        const key = `${config.chain}-${config.network}`;
        this.configs.set(key, {
          chain: config.chain,
          network: config.network,
          minConfirmations: config.min_confirmations,
          maxConfirmations: config.max_confirmations,
          timeoutMinutes: config.timeout_minutes,
          enabled: config.enabled
        });
      }

      // デフォルト承認ルール（チェーン x 資産ごとの自動承認設定）
      interface ApprovalRuleData {
        id: string;
        chain: string;
        network: string;
        asset: string;
        min_amount: number;
        max_amount: number;
        auto_approve: boolean;
        requires_manual_approval: boolean;
        risk_level: 'low' | 'medium' | 'high';
        conditions?: Record<string, unknown>;
      }

      // デフォルト承認ルールを生成
      const approvalRules: ApprovalRuleData[] = [
        // Ethereum
        { id: 'eth-mainnet-eth-auto', chain: 'eth', network: 'mainnet', asset: 'ETH', min_amount: 0.01, max_amount: 10, auto_approve: true, requires_manual_approval: false, risk_level: 'low' },
        { id: 'eth-mainnet-usdt-auto', chain: 'eth', network: 'mainnet', asset: 'USDT', min_amount: 1, max_amount: 10000, auto_approve: true, requires_manual_approval: false, risk_level: 'low' },
        // Bitcoin
        { id: 'btc-mainnet-btc-auto', chain: 'btc', network: 'mainnet', asset: 'BTC', min_amount: 0.0001, max_amount: 1, auto_approve: true, requires_manual_approval: false, risk_level: 'low' },
        // TRON
        { id: 'trc-mainnet-trx-auto', chain: 'trc', network: 'mainnet', asset: 'TRX', min_amount: 10, max_amount: 100000, auto_approve: true, requires_manual_approval: false, risk_level: 'low' },
        { id: 'trc-mainnet-usdt-auto', chain: 'trc', network: 'mainnet', asset: 'USDT', min_amount: 1, max_amount: 10000, auto_approve: true, requires_manual_approval: false, risk_level: 'low' },
        // XRP
        { id: 'xrp-mainnet-xrp-auto', chain: 'xrp', network: 'mainnet', asset: 'XRP', min_amount: 20, max_amount: 100000, auto_approve: true, requires_manual_approval: false, risk_level: 'low' },
        // Cardano
        { id: 'ada-mainnet-ada-auto', chain: 'ada', network: 'mainnet', asset: 'ADA', min_amount: 1, max_amount: 100000, auto_approve: true, requires_manual_approval: false, risk_level: 'low' }
      ];

      for (const rule of approvalRules) {
        const key = `${rule.chain}-${rule.network}-${rule.asset}`;
        if (!this.approvalRules.has(key)) {
          this.approvalRules.set(key, []);
        }
        this.approvalRules.get(key)!.push({
          id: rule.id,
          chain: rule.chain,
          network: rule.network,
          asset: rule.asset,
          minAmount: rule.min_amount,
          maxAmount: rule.max_amount,
          autoApprove: rule.auto_approve,
          requiresManualApproval: rule.requires_manual_approval,
          riskLevel: rule.risk_level,
          conditions: rule.conditions || {}
        });
      }

    } catch (error) {
      console.error('設定読み込みエラー:', error);
    }
  }

  /**
   * 入金確認処理の開始
   */
  async startConfirmationProcess(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // 未確認の入金を処理
      await this.processPendingDeposits();
      
      // 確認済みで未承認の入金を処理
      await this.processConfirmedDeposits();
      
    } catch (error) {
      console.error('入金確認処理エラー:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 未確認入金の処理
   */
  private async processPendingDeposits(): Promise<void> {
    try {
      const { data: pendingDeposits } = await supabase
        .from('deposits')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (!pendingDeposits?.length) {
        return;
      }

      for (const deposit of pendingDeposits) {
        await this.processDepositConfirmation(deposit);
      }

    } catch (error) {
      console.error('未確認入金処理エラー:', error);
    }
  }

  /**
   * 個別入金の確認処理
   */
  private async processDepositConfirmation(deposit: Record<string, unknown>): Promise<void> {
    const depositInfo: DepositInfo = {
      id: deposit.id as string,
      userId: deposit.user_id as string,
      amount: deposit.amount as number,
      currency: deposit.currency as string,
      chain: deposit.chain as string,
      network: deposit.network as string,
      asset: deposit.asset as string,
      status: deposit.status as DepositStatus,
      transactionHash: deposit.transaction_hash as string,
      walletAddress: deposit.wallet_address as string,
      confirmationsRequired: deposit.confirmations_required as number,
      confirmationsObserved: deposit.confirmations_observed as number,
      memoTag: deposit.memo_tag as string,
      createdAt: deposit.created_at as string,
      updatedAt: deposit.updated_at as string
    };

    try {
      // チェーン固有の確認処理
      const isConfirmed = await this.checkDepositConfirmation(depositInfo);

      if (isConfirmed) {
        await this.markDepositAsConfirmed(depositInfo);
      } else {
        // タイムアウトチェック
        await this.checkDepositTimeout(depositInfo);
      }

    } catch (error) {
      console.error(`入金 ${depositInfo.id} の確認処理エラー:`, error);
      
      // エラーログ記録
      await AuditLogger.log(
        AuditAction.DEPOSIT_CONFIRM,
        'deposit_confirmation',
        {
          depositId: depositInfo.id,
          error: error.message
        },
        { userId: depositInfo.userId, riskLevel: 'high' }
      );
    }
  }

  /**
   * チェーン固有の入金確認チェック
   */
  private async checkDepositConfirmation(deposit: DepositInfo): Promise<boolean> {
    const configKey = `${deposit.chain}-${deposit.network}`;
    const _config = this.configs.get(configKey);

    if (!_config) {
      console.warn(`設定が見つかりません: ${configKey}`);
      return false;
    }

    switch (deposit.chain) {
      case 'bitcoin':
        return await this.checkBitcoinConfirmation(deposit, _config);
      case 'xrp':
        return await this.checkXRPConfirmation(deposit, _config);
      case 'evm':
        return await this.checkEVMConfirmation(deposit, _config);
      case 'tron':
        return await this.checkTronConfirmation(deposit, _config);
      case 'cardano':
        return await this.checkCardanoConfirmation(deposit, _config);
      default:
        console.warn(`サポートされていないチェーン: ${deposit.chain}`);
        return false;
    }
  }

  /**
   * Bitcoin確認チェック
   */
  private async checkBitcoinConfirmation(deposit: DepositInfo, config: ConfirmationConfig): Promise<boolean> {
    // Bitcoin Core RPCから確認数を取得
    try {
      // 実際の実装では Bitcoin RPC APIを呼び出し
      const currentConfirmations = deposit.confirmationsObserved;
      
      if (currentConfirmations >= config.minConfirmations) {
        return true;
      }

      // 確認数を更新
      await this.updateDepositConfirmations(deposit.id, currentConfirmations);
      return false;

    } catch (error) {
      console.error(`Bitcoin確認チェックエラー (${deposit.transactionHash}):`, error);
      return false;
    }
  }

  /**
   * XRP確認チェック
   */
  private async checkXRPConfirmation(deposit: DepositInfo, config: ConfirmationConfig): Promise<boolean> {
    // XRPは通常即座に確認済み
    return deposit.confirmationsObserved >= 1;
  }

  /**
   * EVM確認チェック
   */
  private async checkEVMConfirmation(deposit: DepositInfo, config: ConfirmationConfig): Promise<boolean> {
    // Ethereum/EVM チェーンの確認数チェック
    try {
      const currentConfirmations = deposit.confirmationsObserved;
      
      if (currentConfirmations >= config.minConfirmations) {
        return true;
      }

      return false;

    } catch (error) {
      console.error(`EVM確認チェックエラー (${deposit.transactionHash}):`, error);
      return false;
    }
  }

  /**
   * TRON確認チェック
   */
  private async checkTronConfirmation(deposit: DepositInfo, config: ConfirmationConfig): Promise<boolean> {
    // TRON の確認数チェック
    try {
      const currentConfirmations = deposit.confirmationsObserved;
      
      if (currentConfirmations >= config.minConfirmations) {
        return true;
      }

      return false;

    } catch (error) {
      console.error(`TRON確認チェックエラー (${deposit.transactionHash}):`, error);
      return false;
    }
  }

  /**
   * Cardano確認チェック
   */
  private async checkCardanoConfirmation(deposit: DepositInfo, config: ConfirmationConfig): Promise<boolean> {
    // Cardano の確認数チェック
    try {
      const currentConfirmations = deposit.confirmationsObserved;
      
      if (currentConfirmations >= config.minConfirmations) {
        return true;
      }

      return false;

    } catch (error) {
      console.error(`Cardano確認チェックエラー (${deposit.transactionHash}):`, error);
      return false;
    }
  }

  /**
   * 入金を確認済みとしてマーク
   */
  private async markDepositAsConfirmed(deposit: DepositInfo): Promise<void> {
    try {
      const { error } = await supabase
        .from('deposits')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', deposit.id);

      if (error) {
        throw error;
      }

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.DEPOSIT_CONFIRM,
        'deposit_confirmation',
        {
          depositId: deposit.id,
          amount: deposit.amount,
          asset: deposit.asset,
          transactionHash: deposit.transactionHash
        },
        { userId: deposit.userId, riskLevel: 'medium' }
      );

    } catch (error) {
      console.error(`入金確認マークエラー (${deposit.id}):`, error);
      throw error;
    }
  }

  /**
   * 確認数を更新
   */
  private async updateDepositConfirmations(depositId: string, confirmations: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('deposits')
        .update({
          confirmations_observed: confirmations,
          updated_at: new Date().toISOString()
        })
        .eq('id', depositId);

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error(`確認数更新エラー (${depositId}):`, error);
    }
  }

  /**
   * 入金タイムアウトチェック
   */
  private async checkDepositTimeout(deposit: DepositInfo): Promise<void> {
    const configKey = `${deposit.chain}-${deposit.network}`;
    const config = this.configs.get(configKey);

    if (!config) return;

    const createdAt = new Date(deposit.createdAt);
    const timeoutMs = config.timeoutMinutes * 60 * 1000;
    const isTimedOut = Date.now() - createdAt.getTime() > timeoutMs;

    if (isTimedOut) {
      await this.markDepositAsFailed(deposit, 'タイムアウト');
    }
  }

  /**
   * 入金を失敗としてマーク
   */
  private async markDepositAsFailed(deposit: DepositInfo, reason: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('deposits')
        .update({
          status: 'failed',
          memo_tag: deposit.memoTag ? `${deposit.memoTag}:${reason}` : reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', deposit.id);

      if (error) {
        throw error;
      }

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.DEPOSIT_CONFIRM,
        'deposit_confirmation',
        {
          depositId: deposit.id,
          reason,
          transactionHash: deposit.transactionHash
        },
        { userId: deposit.userId, riskLevel: 'high' }
      );

    } catch (error) {
      console.error(`入金失敗マークエラー (${deposit.id}):`, error);
    }
  }

  /**
   * 確認済み入金の承認処理
   */
  private async processConfirmedDeposits(): Promise<void> {
    try {
      const { data: confirmedDeposits } = await supabase
        .from('deposits')
        .select('*')
        .eq('status', 'confirmed')
        .order('created_at', { ascending: true });

      if (!confirmedDeposits?.length) {
        return;
      }

      for (const deposit of confirmedDeposits) {
        await this.processDepositApproval(deposit);
      }

    } catch (error) {
      console.error('確認済み入金処理エラー:', error);
    }
  }

  /**
   * 入金承認処理
   */
  private async processDepositApproval(deposit: Record<string, unknown>): Promise<void> {
    const depositInfo: DepositInfo = {
      id: deposit.id as string,
      userId: deposit.user_id as string,
      amount: deposit.amount as number,
      currency: deposit.currency as string,
      chain: deposit.chain as string,
      network: deposit.network as string,
      asset: deposit.asset as string,
      status: deposit.status as DepositStatus,
      transactionHash: deposit.transaction_hash as string,
      walletAddress: deposit.wallet_address as string,
      confirmationsRequired: deposit.confirmations_required as number,
      confirmationsObserved: deposit.confirmations_observed as number,
      memoTag: deposit.memo_tag as string,
      createdAt: deposit.created_at as string,
      updatedAt: deposit.updated_at as string
    };

    try {
      // 承認ルールを適用
      const approval = await this.evaluateApprovalRules(depositInfo);

      if (approval.autoApprove) {
        await this.approveDeposit(depositInfo);
      } else if (approval.requiresManualApproval) {
        await this.requestManualApproval(depositInfo, approval.riskLevel);
      } else {
        await this.rejectDeposit(depositInfo, approval.reason || '承認基準を満たしていません');
      }

    } catch (error) {
      console.error(`入金承認処理エラー (${depositInfo.id}):`, error);
    }
  }

  /**
   * 承認ルールの評価
   */
  private async evaluateApprovalRules(deposit: DepositInfo): Promise<{
    autoApprove: boolean;
    requiresManualApproval: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    reason?: string;
  }> {
    const ruleKey = `${deposit.chain}-${deposit.network}-${deposit.asset}`;
    const rules = this.approvalRules.get(ruleKey) || [];

    // デフォルト設定
    let result: {
      autoApprove: boolean;
      requiresManualApproval: boolean;
      riskLevel: 'low' | 'medium' | 'high';
      reason?: string;
    } = {
      autoApprove: true,
      requiresManualApproval: false,
      riskLevel: 'low',
      reason: undefined
    };

    for (const rule of rules) {
      // 金額範囲チェック
      if (deposit.amount < rule.minAmount || deposit.amount > rule.maxAmount) {
        continue;
      }

      // カスタム条件チェック
      if (!this.checkCustomConditions(deposit, rule.conditions)) {
        continue;
      }

      // ルールに一致した場合の処理
      if (rule.requiresManualApproval) {
        result = {
          autoApprove: false,
          requiresManualApproval: true,
          riskLevel: rule.riskLevel,
          reason: `手動承認が必要 (金額: ${deposit.amount} ${deposit.asset})`
        };
        break;
      }

      if (!rule.autoApprove) {
        result = {
          autoApprove: false,
          requiresManualApproval: false,
          riskLevel: rule.riskLevel,
          reason: `自動承認不可 (ルール: ${rule.id})`
        };
        break;
      }

      // リスクレベルを更新（より高いリスクレベルを採用）
      if (rule.riskLevel === 'high' || (rule.riskLevel === 'medium' && result.riskLevel === 'low')) {
        result.riskLevel = rule.riskLevel;
      }
    }

    return result;
  }

  /**
   * カスタム条件のチェック
   */
  private checkCustomConditions(_deposit: DepositInfo, conditions: Record<string, unknown>): boolean {
    try {
      // 時間帯制限
      if (conditions.allowedHours) {
        const currentHour = new Date().getHours();
        const allowedHours = conditions.allowedHours as number[];
        if (!allowedHours.includes(currentHour)) {
          return false;
        }
      }

      // 最大日次金額
      if (conditions.maxDailyAmount) {
        // 実装: 当日の同ユーザー入金総額をチェック
        // ここでは簡略化
      }

      // 送信者アドレス制限
      if (conditions.allowedSenders) {
        // 実装: トランザクションの送信者アドレスをチェック
        // ここでは簡略化
      }

      return true;

    } catch (error) {
      console.error('カスタム条件チェックエラー:', error);
      return false;
    }
  }

  /**
   * 入金を承認
   */
  private async approveDeposit(deposit: DepositInfo): Promise<void> {
    try {
      // アトミックな入金承認処理:
      // approve_deposit_and_credit_balance RPC関数を使用して、
      // 残高更新とステータス更新を同一トランザクション内で実行
      // これにより、どちらかが失敗した場合は両方自動的にロールバックされ、
      // 二重計上のリスクを完全に排除する

      const { error } = await supabase.rpc('approve_deposit_and_credit_balance', {
        p_deposit_id: deposit.id,
        p_user_id: deposit.userId,
        p_currency: deposit.asset,
        p_amount: deposit.amount
      });

      if (error) {
        throw error;
      }

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.DEPOSIT_CONFIRM,
        'deposit_confirmation',
        {
          depositId: deposit.id,
          amount: deposit.amount,
          asset: deposit.asset,
          autoApproved: true
        },
        { userId: deposit.userId, riskLevel: 'low' }
      );

    } catch (error) {
      console.error(`入金承認エラー (${deposit.id}):`, error);
      throw error;
    }
  }

  /**
   * 手動承認をリクエスト
   */
  private async requestManualApproval(deposit: DepositInfo, riskLevel: string): Promise<void> {
    try {
      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.DEPOSIT_CONFIRM,
        'deposit_confirmation',
        {
          depositId: deposit.id,
          riskLevel
        },
        { userId: deposit.userId, riskLevel: riskLevel as 'low' | 'medium' | 'high' }
      );

    } catch (error) {
      console.error(`手動承認リクエストエラー (${deposit.id}):`, error);
    }
  }

  /**
   * 入金を拒否
   */
  private async rejectDeposit(deposit: DepositInfo, reason: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('deposits')
        .update({
          status: 'rejected',
          memo_tag: deposit.memoTag ? `${deposit.memoTag}:${reason}` : reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', deposit.id);

      if (error) {
        throw error;
      }

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.DEPOSIT_CONFIRM,
        'deposit_confirmation',
        {
          depositId: deposit.id,
          reason
        },
        { userId: deposit.userId, riskLevel: 'high' }
      );

    } catch (error) {
      console.error(`入金拒否エラー (${deposit.id}):`, error);
    }
  }

  // updateUserBalance関数は削除しました
  // 理由: approve_deposit_and_credit_balance RPC関数に統合され、
  //       残高更新とステータス更新がアトミックに実行されるようになったため

  /**
   * 統計情報取得
   */
  async getStatistics(): Promise<{
    pending: number;
    confirmed: number;
    credited: number;
    rejected: number;
    manualApprovalQueue: number;
  }> {
    try {
      const [pendingCount, confirmedCount, creditedCount, rejectedCount] = await Promise.all([
        supabase.from('deposits').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('deposits').select('id', { count: 'exact' }).eq('status', 'confirmed'),
        supabase.from('deposits').select('id', { count: 'exact' }).eq('status', 'credited'),
        supabase.from('deposits').select('id', { count: 'exact' }).eq('status', 'rejected')
      ]);

      return {
        pending: pendingCount.count || 0,
        confirmed: confirmedCount.count || 0,
        credited: creditedCount.count || 0,
        rejected: rejectedCount.count || 0,
        manualApprovalQueue: 0 // 仮の値
      };

    } catch (error) {
      console.error('統計情報取得エラー:', error);
      return {
        pending: 0,
        confirmed: 0,
        credited: 0,
        rejected: 0,
        manualApprovalQueue: 0
      };
    }
  }
}