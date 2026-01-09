/**
 * 強化されたロガー - 構造化ログとメトリクス収集機能
 */

export interface LogMetrics {
  timestamp: string;
  operation: string;
  chain?: string;
  network?: string;
  duration?: number;
  status: 'success' | 'error' | 'warning' | 'info';
  errorType?: string;
  retryCount?: number;
  details?: Record<string, unknown>;
}

export interface SystemMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  errorsByType: { [key: string]: number };
  operationsByChain: { [key: string]: number };
  lastHealthCheck: string;
}

export class EnhancedLogger {
  private metrics: LogMetrics[] = [];
  private readonly maxMetricsHistory = 1000; // 最大1000件の履歴を保持

  /**
   * 構造化ログ出力
   */
  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      context: context || {}
    };

    // コンソール出力（色付き）
    const colorCode = {
      info: '\x1b[36m',   // シアン
      warn: '\x1b[33m',   // 黄色
      error: '\x1b[31m'   // 赤
    };
    const resetCode = '\x1b[0m';

    // ⚠️ 軽微修正: エラーレベルはstderrに出力して監視ツールでの検知を改善
    const outputFunction = level === 'error' ? console.error : console.log;
    outputFunction(`${colorCode[level]}[${timestamp}] ${level.toUpperCase()}: ${message}${resetCode}`);

    if (context && Object.keys(context).length > 0) {
      outputFunction(`${colorCode[level]}Context:${resetCode}`, this.safeJsonStringify(context));
    }
  }

  /**
   * 操作開始ログ
   */
  startOperation(operation: string, chain?: string, network?: string, details?: Record<string, unknown>): string {
    const operationId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.log('info', `🚀 操作開始: ${operation}`, {
      operationId,
      chain,
      network,
      details
    });

    return operationId;
  }

  /**
   * 操作成功ログとメトリクス記録
   */
  success(operation: string, operationId?: string, duration?: number, chain?: string, network?: string, details?: Record<string, unknown>): void {
    this.log('info', `✅ 操作成功: ${operation}`, {
      operationId,
      duration: duration ? `${duration}ms` : undefined,
      chain,
      network,
      details
    });

    this.recordMetrics({
      timestamp: new Date().toISOString(),
      operation,
      chain,
      network,
      duration,
      status: 'success',
      details
    });
  }

  /**
   * 操作失敗ログとメトリクス記録
   */
  error(operation: string, error: unknown, operationId?: string, chain?: string, network?: string, retryCount?: number): void {
    const errorType = this.classifyError(error);
    const sanitizedError = this.sanitizeError(error);

    this.log('error', `❌ 操作失敗: ${operation}`, {
      operationId,
      chain,
      network,
      errorType,
      retryCount,
      error: sanitizedError
    });

    this.recordMetrics({
      timestamp: new Date().toISOString(),
      operation,
      chain,
      network,
      status: 'error',
      errorType,
      retryCount,
      details: { error: sanitizedError }
    });
  }

  /**
   * 警告ログ
   */
  warn(operation: string, message: string, chain?: string, network?: string, details?: Record<string, unknown>): void {
    this.log('warn', `⚠️ ${operation}: ${message}`, {
      chain,
      network,
      details
    });

    this.recordMetrics({
      timestamp: new Date().toISOString(),
      operation,
      chain,
      network,
      status: 'warning',
      details
    });
  }

  /**
   * リトライ試行ログ
   */
  retry(operation: string, attempt: number, maxRetries: number, delay: number, reason: string): void {
    this.log('warn', `🔄 リトライ実行: ${operation}`, {
      attempt: `${attempt}/${maxRetries}`,
      delay: `${delay}ms`,
      reason
    });
  }

  /**
   * ヘルスチェック結果ログ
   */
  health(status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, unknown>): void {
    const emoji = {
      healthy: '💚',
      degraded: '💛',
      unhealthy: '❤️'
    };

    this.log(status === 'healthy' ? 'info' : status === 'degraded' ? 'warn' : 'error',
      `${emoji[status]} システム状態: ${status}`, details);
  }

  /**
   * メトリクス記録
   */
  private recordMetrics(metric: LogMetrics): void {
    this.metrics.push(metric);

    // 履歴サイズの制限
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * システムメトリクス取得
   */
  getSystemMetrics(): SystemMetrics {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 過去24時間のメトリクスのみを対象
    const recentMetrics = this.metrics.filter(m => new Date(m.timestamp) >= last24Hours);

    const totalOperations = recentMetrics.length;
    const successfulOperations = recentMetrics.filter(m => m.status === 'success').length;
    const failedOperations = recentMetrics.filter(m => m.status === 'error').length;

    // 平均レスポンス時間計算
    const durationsWithValues = recentMetrics.filter(m => m.duration && m.duration > 0);
    const averageResponseTime = durationsWithValues.length > 0
      ? durationsWithValues.reduce((sum, m) => sum + (m.duration || 0), 0) / durationsWithValues.length
      : 0;

    // エラータイプ別集計
    const errorsByType: { [key: string]: number } = {};
    recentMetrics.filter(m => m.status === 'error' && m.errorType).forEach(m => {
      errorsByType[m.errorType!] = (errorsByType[m.errorType!] || 0) + 1;
    });

    // チェーン別操作数集計
    const operationsByChain: { [key: string]: number } = {};
    recentMetrics.filter(m => m.chain).forEach(m => {
      const key = `${m.chain}/${m.network}`;
      operationsByChain[key] = (operationsByChain[key] || 0) + 1;
    });

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageResponseTime: Math.round(averageResponseTime),
      errorsByType,
      operationsByChain,
      lastHealthCheck: now.toISOString()
    };
  }

  /**
   * メトリクス履歴取得
   */
  getMetricsHistory(operation?: string, chain?: string, network?: string, hours?: number): LogMetrics[] {
    let filtered = this.metrics;

    // 時間範囲フィルタ
    if (hours) {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      filtered = filtered.filter(m => new Date(m.timestamp) >= cutoff);
    }

    // 操作名フィルタ
    if (operation) {
      filtered = filtered.filter(m => m.operation.includes(operation));
    }

    // チェーンフィルタ
    if (chain) {
      filtered = filtered.filter(m => m.chain === chain);
    }

    // ネットワークフィルタ
    if (network) {
      filtered = filtered.filter(m => m.network === network);
    }

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * エラー分類（詳細化）
   */
  private classifyError(error: unknown): string {
    if (!error) return 'UNKNOWN';

    const message = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as Record<string, unknown>).message) : String(error));
    const errorObj = error as Record<string, unknown>;
    const status = errorObj?.status || errorObj?.code;

    // ネットワーク関連
    if (/network|connection|timeout|ECONNRESET|ENOTFOUND|socket/i.test(message)) {
      return 'NETWORK_ERROR';
    }

    // Tatum API関連
    if (/tatum|api/i.test(message)) {
      const numStatus = typeof status === 'string' ? parseInt(status, 10) : Number(status);
      if (numStatus === 400) return 'TATUM_VALIDATION_ERROR';
      if (numStatus === 401) return 'TATUM_AUTH_ERROR';
      if (numStatus === 403) return 'TATUM_PERMISSION_ERROR';
      if (numStatus === 429) return 'TATUM_RATE_LIMIT';
      if (!isNaN(numStatus) && numStatus >= 500) return 'TATUM_SERVER_ERROR';
      return 'TATUM_API_ERROR';
    }

    // 認証関連
    if (status === 401 || status === 403 || /unauthorized|forbidden|invalid.*key/i.test(message)) {
      return 'AUTHENTICATION_ERROR';
    }

    // レート制限
    if (status === 429 || /rate.limit|too.many.requests/i.test(message)) {
      return 'RATE_LIMIT_ERROR';
    }

    // バリデーション関連
    if (status === 400 || /invalid.*parameter|validation|bad.request/i.test(message)) {
      return 'VALIDATION_ERROR';
    }

    // サーバーエラー
    if (status >= 500 && status < 600) {
      return 'SERVER_ERROR';
    }

    // 設定関連
    if (/config|environment|missing.*env/i.test(message)) {
      return 'CONFIGURATION_ERROR';
    }

    // その他
    return 'APPLICATION_ERROR';
  }

  /**
   * エラー情報のサニタイゼーション
   */
  private sanitizeError(error: unknown): Record<string, unknown> {
    if (!error) return { message: 'Unknown error' };

    const sanitized: Record<string, unknown> = {};
    const errorObj = error as Record<string, unknown>;

    if (error instanceof Error || (typeof error === 'object' && error !== null && 'message' in error)) {
      sanitized.message = this.sanitizeMessage(String(errorObj.message));
    }

    if (errorObj?.code || errorObj?.status) {
      sanitized.code = errorObj.code || errorObj.status;
    }

    if (error instanceof Error && error.stack) {
      // スタックトレースから機密情報を除去
      sanitized.stack = this.sanitizeMessage(error.stack);
    }

    return sanitized;
  }

  /**
   * メッセージのサニタイゼーション
   */
  private sanitizeMessage(message: string): string {
    if (!message) return '';

    // APIキーの除去
    message = message.replace(/([?&])(api[kK]ey|token|secret|password)=[^&\s]*/g, '$1$2=[REDACTED]');

    // パスの除去
    message = message.replace(/\/Users\/[^\s]*/g, '[PATH_REDACTED]');

    // データベース接続文字列の除去
    message = message.replace(/postgres:\/\/[^\s]*/g, 'postgres://[REDACTED]');

    // その他の機密情報パターン
    message = message.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'bearer [REDACTED]');

    return message;
  }

  /**
   * ヘルスチェック実行
   */
  async performHealthCheck(tatumClient?: { getAllSubscriptions: () => Promise<unknown> }, supabaseClient?: { getDepositAddressStats: () => Promise<unknown> }): Promise<{status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, unknown>}> {
    const checks = {
      environment: this.checkEnvironment(),
      metrics: this.checkMetrics(),
      tatum: tatumClient ? await this.checkTatumHealth(tatumClient) : { status: 'skipped', message: 'TatumClient not provided' },
      supabase: supabaseClient ? await this.checkSupabaseHealth(supabaseClient) : { status: 'skipped', message: 'SupabaseClient not provided' }
    };

    const failedChecks = Object.values(checks).filter(check => check.status === 'unhealthy').length;
    const degradedChecks = Object.values(checks).filter(check => check.status === 'degraded').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (failedChecks > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedChecks > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const details = {
      timestamp: new Date().toISOString(),
      overallStatus,
      checks,
      summary: {
        total: Object.keys(checks).length,
        healthy: Object.values(checks).filter(check => check.status === 'healthy').length,
        degraded: degradedChecks,
        unhealthy: failedChecks
      }
    };

    this.health(overallStatus, details);
    return { status: overallStatus, details };
  }

  /**
   * 環境変数チェック
   */
  private checkEnvironment(): { status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, unknown> } {
    const requiredEnvs = ['TATUM_API_KEY', 'TATUM_WEBHOOK_URL'];
    const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

    if (missingEnvs.length > 0) {
      return {
        status: 'unhealthy',
        details: { message: `Missing environment variables: ${missingEnvs.join(', ')}` }
      };
    }

    return {
      status: 'healthy',
      details: { message: 'All required environment variables are set' }
    };
  }

  /**
   * メトリクスベースのヘルスチェック
   */
  private checkMetrics(): { status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, unknown> } {
    const metrics = this.getSystemMetrics();
    const errorRate = metrics.totalOperations > 0 ? metrics.failedOperations / metrics.totalOperations : 0;

    if (errorRate > 0.5) {
      return {
        status: 'unhealthy',
        details: { message: `High error rate: ${(errorRate * 100).toFixed(1)}%`, metrics }
      };
    } else if (errorRate > 0.2) {
      return {
        status: 'degraded',
        details: { message: `Elevated error rate: ${(errorRate * 100).toFixed(1)}%`, metrics }
      };
    }

    return {
      status: 'healthy',
      details: { message: `Error rate: ${(errorRate * 100).toFixed(1)}%`, metrics }
    };
  }

  /**
   * TatumClient ヘルスチェック
   */
  private async checkTatumHealth(tatumClient: { getAllSubscriptions: () => Promise<unknown> }): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, unknown> }> {
    try {
      // 簡単なAPI呼び出しでTatum接続をテスト
      const startTime = Date.now();
      await tatumClient.getAllSubscriptions();
      const duration = Date.now() - startTime;

      if (duration > 10000) { // 10秒以上
        return {
          status: 'degraded',
          details: { message: `Slow Tatum API response: ${duration}ms` }
        };
      }

      return {
        status: 'healthy',
        details: { message: `Tatum API responsive: ${duration}ms` }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { message: `Tatum API error: ${this.sanitizeMessage(error instanceof Error ? error.message : String(error))}` }
      };
    }
  }

  /**
   * SupabaseClient ヘルスチェック
   */
  private async checkSupabaseHealth(supabaseClient: { getDepositAddressStats: () => Promise<unknown> }): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, unknown> }> {
    try {
      // 簡単なクエリでSupabase接続をテスト
      const startTime = Date.now();
      await supabaseClient.getDepositAddressStats();
      const duration = Date.now() - startTime;

      if (duration > 5000) { // 5秒以上
        return {
          status: 'degraded',
          details: { message: `Slow Supabase response: ${duration}ms` }
        };
      }

      return {
        status: 'healthy',
        details: { message: `Supabase responsive: ${duration}ms` }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { message: `Supabase error: ${this.sanitizeMessage(error instanceof Error ? error.message : String(error))}` }
      };
    }
  }

  /**
   * BigIntと循環参照に安全なJSON.stringify
   */
  private safeJsonStringify(obj: unknown, indent: number = 2): string {
    try {
      const seen = new WeakSet();

      const replacer = (key: string, value: unknown): unknown => {
        // BigIntを文字列化
        if (typeof value === 'bigint') {
          return `${value.toString()}n`;
        }

        // 循環参照チェック
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }

        // 関数を文字列化
        if (typeof value === 'function') {
          return `[Function: ${value.name || 'anonymous'}]`;
        }

        // undefined を明示的に文字列化
        if (value === undefined) {
          return '[undefined]';
        }

        return value;
      };

      return JSON.stringify(obj, replacer, indent);
    } catch (error) {
      // JSON.stringify失敗時のフォールバック
      try {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const objStr = obj && typeof obj === 'object' && 'toString' in obj ? String(obj) : 'undefined';
        return `[Serialization Error: ${errorMsg}] Raw: ${objStr}`;
      } catch (fallbackError) {
        return `[Object with serialization issues: ${typeof obj}]`;
      }
    }
  }
}

// シングルトンインスタンス
export const logger = new EnhancedLogger();