// Enhanced Error Handling & Robustness - v3.0.0
// 本番運用対応：高度なエラー処理、リトライ機構、監視機能

// @ts-expect-error Supabase JS (esm) for Deno
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * リトライ可能エラーの判定
 */
export class RetryableError extends Error {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

/**
 * 永続的エラー（リトライ不可）の判定
 */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

/**
 * 高度なリトライ機構
 */
export class AdvancedRetryHandler {
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly jitterFactor: number;

  constructor(
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitterFactor = 0.1
  ) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.jitterFactor = jitterFactor;
  }

  /**
   * 指数バックオフ + ジッターでリトライ実行
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: { operationName: string; correlationId: string }
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // 永続的エラーの場合は即座に失敗
        if (error instanceof PermanentError) {
          throw error;
        }

        // 最後の試行の場合は失敗
        if (attempt === this.maxRetries) {
          break;
        }

        // リトライ可能エラーかどうかの判定
        if (!this.isRetryableError(error as Error)) {
          throw error;
        }

        // 指数バックオフ + ジッター計算
        const delay = this.calculateDelay(attempt);

        console.log(JSON.stringify({
          level: 'WARN',
          message: `Retrying operation after error`,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delayMs: delay,
          operationName: context.operationName,
          correlationId: context.correlationId,
          error: lastError.message,
          timestamp: new Date().toISOString(),
        }));

        await this.sleep(delay);
      }
    }

    throw new Error(
      `Operation failed after ${this.maxRetries + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * エラーがリトライ可能かどうかの判定
   */
  private isRetryableError(error: Error): boolean {
    if (error instanceof RetryableError) {
      return true;
    }

    const retryablePatterns = [
      /connection.*refused/i,
      /timeout/i,
      /network.*error/i,
      /502/i,
      /503/i,
      /504/i,
      /rate.*limit/i,
      /temporary.*failure/i,
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * 指数バックオフ + ジッター計算
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, attempt),
      this.maxDelay
    );

    // ジッター追加（±10%のランダム性）
    const jitter = exponentialDelay * this.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, exponentialDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * データベースヘルスチェッカー
 */
export class DatabaseHealthChecker {
  constructor(private supabase: SupabaseClient) {}

  /**
   * データベース接続とテーブルの健全性チェック
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    issues: string[];
    responseTimeMs: number;
  }> {
    const issues: string[] = [];
    const startTime = Date.now();

    try {
      // 基本接続テスト
      const { error: connectionError } = await this.supabase
        .from('deposits')
        .select('id')
        .limit(1);

      if (connectionError) {
        issues.push(`Database connection failed: ${connectionError.message}`);
      }

      // 必須テーブルの存在確認
      const requiredTables = ['deposits', 'deposit_transactions', 'user_assets', 'deposit_addresses'];
      for (const table of requiredTables) {
        const { error } = await this.supabase
          .from(table)
          .select('*')
          .limit(1);

        if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
          issues.push(`Required table missing: ${table}`);
        }
      }

      // upsert_user_asset 関数の存在確認
      const { error: rpcError } = await this.supabase.rpc('upsert_user_asset', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_currency: 'TEST',
        p_amount: 0
      });

      if (rpcError && rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
        issues.push('Required RPC function upsert_user_asset missing');
      }

    } catch (error) {
      issues.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const responseTimeMs = Date.now() - startTime;

    return {
      healthy: issues.length === 0,
      issues,
      responseTimeMs
    };
  }
}

/**
 * 処理統計とメトリクス収集
 */
export class ProcessingMetrics {
  private stats = {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    averageProcessingTime: 0,
    lastError: null as string | null,
    lastErrorTime: null as string | null,
  };

  recordSuccess(processingTimeMs: number): void {
    this.stats.totalProcessed++;
    this.stats.successCount++;
    this.updateAverageProcessingTime(processingTimeMs);
  }

  recordFailure(error: Error): void {
    this.stats.totalProcessed++;
    this.stats.failureCount++;
    this.stats.lastError = error.message;
    this.stats.lastErrorTime = new Date().toISOString();
  }

  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalProcessed > 0
        ? (this.stats.successCount / this.stats.totalProcessed) * 100
        : 0
    };
  }

  private updateAverageProcessingTime(newTime: number): void {
    if (this.stats.successCount === 1) {
      this.stats.averageProcessingTime = newTime;
    } else {
      this.stats.averageProcessingTime =
        (this.stats.averageProcessingTime * (this.stats.successCount - 1) + newTime) / this.stats.successCount;
    }
  }
}

/**
 * トランザクション整合性マネージャー
 */
export class TransactionIntegrityManager {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 3段階処理の整合性検証
   */
  async verifyDepositIntegrity(
    transactionHash: string,
    userId: string
  ): Promise<{
    consistent: boolean;
    issues: string[];
    details: Record<string, unknown>;
  }> {
    const issues: string[] = [];
    const details: Record<string, unknown> = {};

    try {
      // deposit_transactions の存在確認
      const { data: depositTx } = await this.supabase
        .from('deposit_transactions')
        .select('*')
        .eq('transaction_hash', transactionHash)
        .eq('user_id', userId)
        .maybeSingle();

      details.depositTransaction = depositTx;

      // deposits の存在確認
      const { data: deposit } = await this.supabase
        .from('deposits')
        .select('*')
        .eq('transaction_hash', transactionHash)
        .eq('user_id', userId)
        .maybeSingle();

      details.deposit = deposit;

      // 整合性チェック
      if (!depositTx && !deposit) {
        issues.push('Neither deposit_transactions nor deposits record found');
      }

      if (depositTx && deposit) {
        // 金額の整合性
        if (Number(depositTx.amount) !== Number(deposit.amount)) {
          issues.push(`Amount mismatch: deposit_transactions=${depositTx.amount}, deposits=${deposit.amount}`);
        }

        // ステータスの整合性
        if (depositTx.status !== deposit.status) {
          issues.push(`Status mismatch: deposit_transactions=${depositTx.status}, deposits=${deposit.status}`);
        }
      }

      // user_assets との整合性（確認済みの場合のみ）
      if (depositTx?.status === 'confirmed' || deposit?.status === 'confirmed') {
        const currency = depositTx?.asset || deposit?.currency;
        const { data: userAsset } = await this.supabase
          .from('user_assets')
          .select('*')
          .eq('user_id', userId)
          .eq('currency', currency)
          .maybeSingle();

        details.userAsset = userAsset;

        if (!userAsset) {
          issues.push(`user_assets record missing for confirmed deposit: user=${userId}, currency=${currency}`);
        }
      }

    } catch (error) {
      issues.push(`Integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      consistent: issues.length === 0,
      issues,
      details
    };
  }

  /**
   * 孤立したレコードの検出
   */
  async findOrphanedRecords(timeoutMinutes = 60): Promise<{
    orphanedDeposits: Record<string, unknown>[];
    orphanedTransactions: Record<string, unknown>[];
  }> {
    const timeoutDate = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    // deposits テーブルにあるが deposit_transactions にないレコード
    const { data: orphanedDeposits } = await this.supabase.rpc(
      'find_orphaned_deposits',
      { timeout_date: timeoutDate }
    );

    // deposit_transactions テーブルにあるが deposits にないレコード
    const { data: orphanedTransactions } = await this.supabase.rpc(
      'find_orphaned_deposit_transactions',
      { timeout_date: timeoutDate }
    );

    return {
      orphanedDeposits: orphanedDeposits || [],
      orphanedTransactions: orphanedTransactions || []
    };
  }
}

/**
 * アラート・通知システム
 */
export class AlertSystem {
  private alertThresholds = {
    errorRatePercent: 10,
    processingTimeMs: 30000,
    consecutiveFailures: 5
  };

  private consecutiveFailureCount = 0;
  private processingMetrics: ProcessingMetrics;

  constructor(processingMetrics: ProcessingMetrics) {
    this.processingMetrics = processingMetrics;
  }

  /**
   * 処理結果の評価とアラート判定
   */
  evaluateAndAlert(
    success: boolean,
    processingTimeMs: number,
    context: { correlationId: string; transactionHash?: string }
  ): void {
    if (success) {
      this.consecutiveFailureCount = 0;

      // 処理時間アラート
      if (processingTimeMs > this.alertThresholds.processingTimeMs) {
        this.sendAlert('high_processing_time', {
          processingTimeMs,
          threshold: this.alertThresholds.processingTimeMs,
          context
        });
      }
    } else {
      this.consecutiveFailureCount++;

      // 連続失敗アラート
      if (this.consecutiveFailureCount >= this.alertThresholds.consecutiveFailures) {
        this.sendAlert('consecutive_failures', {
          failureCount: this.consecutiveFailureCount,
          threshold: this.alertThresholds.consecutiveFailures,
          context
        });
      }
    }

    // エラー率アラート
    const stats = this.processingMetrics.getStats();
    if (stats.totalProcessed >= 10 && (100 - stats.successRate) > this.alertThresholds.errorRatePercent) {
      this.sendAlert('high_error_rate', {
        errorRate: 100 - stats.successRate,
        threshold: this.alertThresholds.errorRatePercent,
        stats,
        context
      });
    }
  }

  private sendAlert(type: string, data: Record<string, unknown>): void {
    console.log(JSON.stringify({
      level: 'ERROR',
      message: `🚨 ALERT: ${type}`,
      alertType: type,
      alertData: data,
      timestamp: new Date().toISOString(),
      service: 'tatum-webhook',
    }));

    // 本番環境では外部通知システム（Slack, Discord, PagerDuty等）に送信
    // this.sendToExternalAlertSystem(type, data);
  }
}

/**
 * システム診断ユーティリティ
 */
export class SystemDiagnostics {
  constructor(
    private supabase: SupabaseClient,
    private metrics: ProcessingMetrics,
    private healthChecker: DatabaseHealthChecker
  ) {}

  /**
   * 包括的システム診断
   */
  async runDiagnostics(): Promise<{
    overallHealth: 'healthy' | 'warning' | 'critical';
    checks: Record<string, unknown>;
    recommendations: string[];
  }> {
    const checks: Record<string, unknown> = {};
    const recommendations: string[] = [];

    // データベースヘルス
    const dbHealth = await this.healthChecker.checkHealth();
    checks.database = dbHealth;
    if (!dbHealth.healthy) {
      recommendations.push('データベース接続またはスキーマに問題があります');
    }

    // 処理統計
    const processingStats = this.metrics.getStats();
    checks.processing = processingStats;
    if (processingStats.successRate < 95) {
      recommendations.push('成功率が低下しています。ログを確認してください');
    }

    // メモリ使用量
    checks.memory = {
      used: (performance as { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } })?.memory?.usedJSHeapSize || 0,
      total: (performance as { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } })?.memory?.totalJSHeapSize || 0,
      limit: (performance as { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } })?.memory?.jsHeapSizeLimit || 0
    };

    // 全体健康度の判定
    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (!dbHealth.healthy || processingStats.successRate < 90) {
      overallHealth = 'critical';
      recommendations.push('即座の対応が必要です');
    } else if (processingStats.successRate < 95 || dbHealth.responseTimeMs > 5000) {
      overallHealth = 'warning';
      recommendations.push('監視を強化してください');
    }

    return {
      overallHealth,
      checks,
      recommendations
    };
  }
}

/**
 * エラー分類器
 */
export class ErrorClassifier {
  /**
   * エラーの分類と適切な対応の判定
   */
  static classify(error: Error): {
    category: 'network' | 'database' | 'validation' | 'business' | 'system';
    severity: 'low' | 'medium' | 'high' | 'critical';
    retryable: boolean;
    action: string;
  } {
    const message = error.message.toLowerCase();

    // ネットワークエラー
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return {
        category: 'network',
        severity: 'medium',
        retryable: true,
        action: 'retry_with_backoff'
      };
    }

    // データベースエラー
    if (message.includes('database') || message.includes('sql') || message.includes('relation')) {
      return {
        category: 'database',
        severity: 'high',
        retryable: false,
        action: 'check_database_schema'
      };
    }

    // バリデーションエラー
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return {
        category: 'validation',
        severity: 'low',
        retryable: false,
        action: 'log_and_skip'
      };
    }

    // ビジネスロジックエラー
    if (message.includes('duplicate') || message.includes('insufficient') || message.includes('not found')) {
      return {
        category: 'business',
        severity: 'low',
        retryable: false,
        action: 'log_and_continue'
      };
    }

    // システムエラー（デフォルト）
    return {
      category: 'system',
      severity: 'critical',
      retryable: true,
      action: 'retry_and_alert'
    };
  }
}