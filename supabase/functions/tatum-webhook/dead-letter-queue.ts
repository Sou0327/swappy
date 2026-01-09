// Tatum Webhook Dead Letter Queue - 失敗イベント保存・再処理システム

// Deno環境での型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

import type {
  DeadLetterEvent,
  DeadLetterStats,
  ErrorType,
  DeadLetterStatus,
  LogContext
} from './types.ts';
import type { Logger } from './logger.ts';
import type { MetricsCollector } from './metrics.ts';
import { DEAD_LETTER_CONFIG, SERVICE_NAME } from './config.ts';

import {
  createClient,
  SupabaseClient,
  type PostgrestError
// @ts-expect-error - External CDN module import in Deno Edge Functions environment
} from "https://esm.sh/@supabase/supabase-js@2";

/**
 * 構造化エラー分類システム
 * コンテキスト対応・拡張可能なエラー分類機能
 */
class EnhancedErrorClassifier {
  private readonly classificationRules: ErrorClassificationRule[];

  constructor() {
    this.classificationRules = this.initializeClassificationRules();
  }

  /**
   * エラー分類の実行
   */
  classify(error: Error): ErrorType {
    const context = this.extractErrorContext(error);

    // 優先度順でルールを評価
    for (const rule of this.classificationRules) {
      if (rule.matches(context)) {
        // 分類結果のログ記録（デバッグ用）
        this.logClassification(context, rule.type, rule.reason);
        return rule.type;
      }
    }

    // デフォルト分類（最も安全なretryable）
    this.logClassification(context, 'retryable', 'No specific rule matched');
    return 'retryable';
  }

  /**
   * エラーコンテキスト抽出
   */
  private extractErrorContext(error: Error): ErrorContext {
    const message = error.message || '';
    const name = error.name || 'Error';
    const stack = error.stack || '';

    // HTTPエラーの検出
    const httpStatusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
    const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[0]) : null;

    // Supabaseエラーの検出
    const isSupabaseError = stack.includes('supabase') ||
                           message.toLowerCase().includes('postgres') ||
                           name.includes('PostgrestError');

    // ネットワークエラーの検出
    const isNetworkError = message.toLowerCase().includes('network') ||
                          message.toLowerCase().includes('timeout') ||
                          message.toLowerCase().includes('connection') ||
                          name.includes('NetworkError');

    return {
      message: message.toLowerCase(),
      name,
      stack,
      httpStatus,
      isSupabaseError,
      isNetworkError,
      originalError: error
    };
  }

  /**
   * 分類ルールの初期化
   */
  private initializeClassificationRules(): ErrorClassificationRule[] {
    return [
      // 永続的エラー（認証・認可）
      {
        type: 'permanent' as const,
        priority: 10,
        matches: (ctx) => ctx.httpStatus === 401 || ctx.httpStatus === 403,
        reason: 'Authentication/Authorization failure'
      },
      {
        type: 'permanent' as const,
        priority: 9,
        matches: (ctx) => [
          'unauthorized', 'forbidden', 'authentication failed',
          'invalid signature', 'access denied', 'permission denied'
        ].some(pattern => ctx.message.includes(pattern)),
        reason: 'Authentication/Authorization error in message'
      },

      // 永続的エラー（データ形式）
      {
        type: 'permanent' as const,
        priority: 8,
        matches: (ctx) => ctx.httpStatus === 400,
        reason: 'Bad Request - likely data format issue'
      },
      {
        type: 'permanent' as const,
        priority: 7,
        matches: (ctx) => [
          'malformed', 'invalid json', 'schema validation',
          'bad request', 'invalid format', 'parse error'
        ].some(pattern => ctx.message.includes(pattern)),
        reason: 'Data format/schema error'
      },

      // レート制限エラー
      {
        type: 'rate_limited' as const,
        priority: 6,
        matches: (ctx) => ctx.httpStatus === 429,
        reason: 'HTTP 429 Too Many Requests'
      },
      {
        type: 'rate_limited' as const,
        priority: 5,
        matches: (ctx) => [
          'rate limit', 'too many requests', 'quota exceeded',
          'throttle', 'rate exceeded'
        ].some(pattern => ctx.message.includes(pattern)),
        reason: 'Rate limiting detected in message'
      },

      // 一時的エラー（サーバー）
      {
        type: 'retryable' as const,
        priority: 4,
        matches: (ctx) => ctx.httpStatus ? ctx.httpStatus >= 500 : false,
        reason: 'Server error (5xx)'
      },

      // 一時的エラー（ネットワーク）
      {
        type: 'retryable' as const,
        priority: 3,
        matches: (ctx) => ctx.isNetworkError,
        reason: 'Network connectivity issue'
      },

      // 一時的エラー（データベース）
      {
        type: 'retryable' as const,
        priority: 2,
        matches: (ctx) => ctx.isSupabaseError && [
          'connection', 'timeout', 'temporary', 'unavailable'
        ].some(pattern => ctx.message.includes(pattern)),
        reason: 'Temporary database issue'
      },

      // 永続的エラー（存在しないリソース）
      {
        type: 'permanent' as const,
        priority: 1,
        matches: (ctx) => ctx.httpStatus === 404,
        reason: 'Resource not found'
      }
    ].sort((a, b) => b.priority - a.priority); // 優先度の高い順
  }

  /**
   * 分類結果のログ記録
   */
  private logClassification(context: ErrorContext, type: ErrorType, reason: string): void {
    console.log(JSON.stringify({
      level: 'DEBUG',
      message: 'Error classification completed',
      classification: {
        type,
        reason,
        httpStatus: context.httpStatus,
        isSupabaseError: context.isSupabaseError,
        isNetworkError: context.isNetworkError,
        errorName: context.name
      },
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
    }));
  }
}

/**
 * エラーコンテキスト型定義
 */
interface ErrorContext {
  message: string;
  name: string;
  stack: string;
  httpStatus: number | null;
  isSupabaseError: boolean;
  isNetworkError: boolean;
  originalError: Error;
}

/**
 * エラー分類ルール型定義
 */
interface ErrorClassificationRule {
  type: ErrorType;
  priority: number;
  matches: (context: ErrorContext) => boolean;
  reason: string;
}

/**
 * デッドレターキューシステム
 * Webhookイベント処理失敗時の保存・再処理を管理
 */
export class DeadLetterQueue {
  private supabase: SupabaseClient;
  private logger?: Logger;
  private metrics?: MetricsCollector;
  private isProcessing: boolean = false;
  private processingIntervalId?: number;
  private cleanupIntervalId?: number;

  constructor(supabaseUrl: string, supabaseServiceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // NOTE: Supabase Edge Functionsではリクエスト終了時にワーカーが破棄されるため、
    // setIntervalベースのバックグラウンド処理は機能しません。
    // 代わりにリクエスト毎の確率的自動処理とScheduled Functionsで定期実行します。
  }

  /**
   * 依存オブジェクト設定
   */
  setDependencies(logger: Logger, metrics: MetricsCollector) {
    this.logger = logger;
    this.metrics = metrics;
  }

  /**
   * 失敗イベントをデッドレターキューに保存
   */
  async saveFailedEvent(
    webhookId: string,
    payload: Record<string, unknown>,
    error: Error,
    context?: LogContext
  ): Promise<void> {
    try {
      const errorType = this.classifyError(error);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + DEAD_LETTER_CONFIG.maxAge).toISOString();

      const deadLetterEvent: Omit<DeadLetterEvent, 'id'> = {
        webhook_id: webhookId,
        payload,
        error_message: error.message,
        error_type: errorType,
        retry_count: 0,
        max_retries: DEAD_LETTER_CONFIG.maxRetries,
        next_retry_at: this.calculateNextRetry(0),
        status: errorType === 'permanent' ? 'failed' : 'pending',
        created_at: now,
        updated_at: now,
        expires_at: expiresAt,
      };

      const { error: dbError } = await this.supabase
        .from('dead_letter_events')
        .insert(deadLetterEvent);

      if (dbError) {
        throw new Error(`デッドレターイベント保存失敗: ${dbError.message}`);
      }

      // メトリクス記録
      this.metrics?.increment('dead_letter_queue.event_saved', {
        error_type: errorType,
        permanent: String(errorType === 'permanent'),
      });

      // 監査ログ
      if (this.logger && context) {
        await this.logger.auditLog({
          event: 'dead_letter_event_created',
          ...context,
          resource: `webhook:${webhookId}`,
          details: {
            error_type: errorType,
            error_message: error.message,
            will_retry: errorType !== 'permanent',
          },
        });
      }

      // 保存成功後に確率的自動処理をトリガー（5%の確率）
      const shouldTriggerAutoProcessing = Math.random() < 0.05;

      if (shouldTriggerAutoProcessing) {
        // 非同期で自動処理を実行（リクエストをブロックしない）
        this.triggerAutoProcessing().catch(autoProcessError => {
          console.error('自動処理エラー:', autoProcessError);
        });
      }

    } catch (saveError) {
      this.metrics?.increment('dead_letter_queue.save_failed');

      // 最後の手段として、ログにのみ記録
      console.error(JSON.stringify({
        level: 'ERROR',
        message: 'デッドレターイベント保存に失敗しました',
        webhookId,
        originalError: error.message,
        saveError: saveError instanceof Error ? saveError.message : String(saveError),
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
      }));
    }
  }

  /**
   * 高度なエラー分類システム
   */
  private classifyError(error: Error): ErrorType {
    const errorClassifier = new EnhancedErrorClassifier();
    return errorClassifier.classify(error);
  }

  /**
   * 次回再試行時間を計算（指数バックオフ + ジッタ）
   */
  private calculateNextRetry(retryCount: number): string {
    const baseDelay = DEAD_LETTER_CONFIG.retryDelayBase;
    const maxDelay = DEAD_LETTER_CONFIG.maxRetryDelay;

    // 指数バックオフ
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);

    // 最大遅延時間を制限
    const cappedDelay = Math.min(exponentialDelay, maxDelay);

    // ジッタ追加（±20%の範囲でランダム化）
    const jitter = cappedDelay * 0.2 * (Math.random() - 0.5);
    const finalDelay = Math.max(1000, cappedDelay + jitter); // 最小1秒

    return new Date(Date.now() + finalDelay).toISOString();
  }

  /**
   * バックグラウンド処理開始
   * 注意: Supabase Edge Functions環境ではsetIntervalは動作しません
   * 定期処理はScheduled Functionsや外部スケジューラーで実装してください
   */
  private startBackgroundProcessing() {
    // Edge Functions環境では非機能
    console.warn('バックグラウンド処理はEdge Functions環境ではサポートされていません');
    // 継続処理は無効化し、手動実行またはScheduled Functionsを使用してください
  }

  /**
   * 再試行処理のメインループ
   */
  async processRetries(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      const now = new Date().toISOString();

      // 再試行対象イベントを取得
      const { data: events, error } = await this.supabase
        .from('dead_letter_events')
        .select('*')
        .in('status', ['pending', 'retrying'])
        .lte('next_retry_at', now)
        .order('created_at', { ascending: true })
        .limit(50); // バッチサイズ制限

      if (error) {
        throw new Error(`再試行イベント取得失敗: ${error.message}`);
      }

      if (!events || events.length === 0) {
        return;
      }

      this.metrics?.gauge('dead_letter_queue.events_to_retry', events.length);

      // 並行処理制限（セマフォ）実装
      const maxConcurrency = 3; // Edge Functions環境に適したリソース制限
      await this.processEventsWithConcurrencyLimit(events as DeadLetterEvent[], maxConcurrency);

    } catch (error) {
      this.metrics?.increment('dead_letter_queue.retry_loop_failed');
      console.error('再試行処理ループでエラー:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 並行処理制限付きイベント処理（セマフォ実装）
   */
  private async processEventsWithConcurrencyLimit(
    events: DeadLetterEvent[],
    maxConcurrency: number
  ): Promise<void> {
    const results: { success: number; failed: number; errors: string[] } = {
      success: 0,
      failed: 0,
      errors: []
    };

    // セマフォ実装：並行実行数を制御
    const semaphore = new Array(maxConcurrency).fill(null);
    const eventQueue = [...events];
    const activePromises: Promise<void>[] = [];

    const processNextEvent = async (): Promise<void> => {
      while (eventQueue.length > 0) {
        const event = eventQueue.shift();
        if (!event) break;

        try {
          await this.retryEvent(event);
          results.success++;
          this.metrics?.increment('dead_letter_queue.concurrent_retry_success');
        } catch (error) {
          results.failed++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.errors.push(`Event ${event.id}: ${errorMsg}`);
          this.metrics?.increment('dead_letter_queue.concurrent_retry_failed');
        }
      }
    };

    // 並行ワーカーを開始
    for (let i = 0; i < Math.min(maxConcurrency, events.length); i++) {
      activePromises.push(processNextEvent());
    }

    // すべてのワーカーの完了を待機
    await Promise.allSettled(activePromises);

    // 処理結果のログ記録
    const totalProcessed = results.success + results.failed;
    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Dead Letter Queue並行処理完了',
      totalEvents: events.length,
      processed: totalProcessed,
      successful: results.success,
      failed: results.failed,
      maxConcurrency,
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
    }));

    // エラーがある場合は詳細をログ出力
    if (results.errors.length > 0) {
      console.warn(JSON.stringify({
        level: 'WARN',
        message: 'Dead Letter Queue処理で一部エラー',
        errorCount: results.errors.length,
        errors: results.errors.slice(0, 5), // 最大5件のエラー詳細
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
      }));
    }

    // メトリクス記録
    this.metrics?.gauge('dead_letter_queue.concurrent_processing.success_rate',
      totalProcessed > 0 ? (results.success / totalProcessed) * 100 : 0);
    this.metrics?.gauge('dead_letter_queue.concurrent_processing.concurrency_used',
      Math.min(maxConcurrency, events.length));
  }

  /**
   * 個別イベント再試行
   */
  private async retryEvent(event: DeadLetterEvent): Promise<void> {
    const startTime = Date.now();

    try {
      // ステータス更新（再試行中）
      await this.updateEventStatus(event.id, 'retrying');

      // 実際のWebhook処理再実行
      await this.reprocessWebhookEvent(event.payload);

      // 成功時の処理
      await this.updateEventStatus(event.id, 'success');

      this.metrics?.increment('dead_letter_queue.retry_success', {
        retry_count: String(event.retry_count + 1),
        error_type: event.error_type,
      });

      this.metrics?.timing('dead_letter_queue.retry_duration', Date.now() - startTime);

      if (this.logger) {
        await this.logger.auditLog({
          event: 'dead_letter_retry_success',
          correlationId: event.webhook_id,
          timestamp: new Date().toISOString(),
          service: SERVICE_NAME,
          version: '2.1.0',
          environment: 'production',
          resource: `dead_letter:${event.id}`,
          details: {
            retry_count: event.retry_count + 1,
            error_type: event.error_type,
          },
        });
      }

    } catch (retryError) {
      await this.handleRetryFailure(event, retryError as Error);
      this.metrics?.timing('dead_letter_queue.retry_duration', Date.now() - startTime);
    }
  }

  /**
   * Webhookイベント再処理
   * TatumWebhookHandlerの処理ロジックを再現した最小限実装
   */
  private async reprocessWebhookEvent(payload: Record<string, unknown>): Promise<void> {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload format');
    }

    // ペイロードの正規化
    const normalized = this.normalizeEventForReprocessing(payload);
    if (!normalized) {
      throw new Error('Failed to normalize webhook event payload');
    }

    // 入金処理のみを対象とする（出金やその他のイベントは対象外）
    const eventType = payload.type || payload.subscriptionType;
    if (!this.isDepositEvent(eventType as string)) {
      throw new Error(`Unsupported event type for reprocessing: ${eventType}`);
    }

    // 入金アドレス検索
    const depositAddress = await this.findDepositAddressForReprocessing(normalized);
    if (!depositAddress) {
      throw new Error(`No matching deposit address found for: ${normalized.address}`);
    }

    // 重複チェック
    const { data: existingDeposit } = await this.supabase
      .from('deposits')
      .select('id')
      .eq('transaction_hash', normalized.transactionHash)
      .single();

    if (existingDeposit) {
      // 重複の場合は成功扱い（既に処理済み）
      return;
    }

    // 3段階の入金処理実行
    await this.executeDepositProcessingFlow(normalized, depositAddress);
  }

  /**
   * 再試行失敗の処理
   */
  private async handleRetryFailure(event: DeadLetterEvent, error: Error): Promise<void> {
    const newRetryCount = event.retry_count + 1;
    const errorType = this.classifyError(error);

    this.metrics?.increment('dead_letter_queue.retry_failed', {
      retry_count: String(newRetryCount),
      error_type: errorType,
    });

    // 最大再試行回数チェック
    if (newRetryCount >= event.max_retries || errorType === 'permanent') {
      await this.markEventAsFailed(event.id, error.message);
      return;
    }

    // 次回再試行スケジュール
    const nextRetryAt = this.calculateNextRetry(newRetryCount);

    const { error: updateError } = await this.supabase
      .from('dead_letter_events')
      .update({
        retry_count: newRetryCount,
        next_retry_at: nextRetryAt,
        error_message: error.message,
        error_type: errorType,
        status: 'pending' as DeadLetterStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', event.id);

    if (updateError) {
      console.error(`再試行情報更新失敗 (${event.id}):`, updateError);
    }
  }

  /**
   * イベントステータス更新
   */
  private async updateEventStatus(eventId: string, status: DeadLetterStatus): Promise<void> {
    const { error } = await this.supabase
      .from('dead_letter_events')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) {
      throw new Error(`ステータス更新失敗: ${error.message}`);
    }
  }

  /**
   * イベントを失敗として確定
   */
  private async markEventAsFailed(eventId: string, errorMessage: string): Promise<void> {
    const { error } = await this.supabase
      .from('dead_letter_events')
      .update({
        status: 'failed' as DeadLetterStatus,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) {
      console.error(`失敗ステータス更新失敗 (${eventId}):`, error);
    }

    this.metrics?.increment('dead_letter_queue.event_permanently_failed');
  }

  /**
   * 期限切れイベントのクリーンアップ
   */
  async cleanupExpiredEvents(): Promise<void> {
    try {
      const now = new Date().toISOString();

      const { data: expiredEvents, error: selectError } = await this.supabase
        .from('dead_letter_events')
        .select('id')
        .lt('expires_at', now);

      if (selectError) {
        throw new Error(`期限切れイベント検索失敗: ${selectError.message}`);
      }

      if (!expiredEvents || expiredEvents.length === 0) {
        return;
      }

      const { error: deleteError } = await this.supabase
        .from('dead_letter_events')
        .delete()
        .lt('expires_at', now);

      if (deleteError) {
        throw new Error(`期限切れイベント削除失敗: ${deleteError.message}`);
      }

      this.metrics?.increment('dead_letter_queue.expired_events_cleaned', {
        count: String(expiredEvents.length),
      });

      console.log(JSON.stringify({
        level: 'INFO',
        message: '期限切れデッドレターイベントをクリーンアップしました',
        cleanedCount: expiredEvents.length,
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
      }));

    } catch (error) {
      this.metrics?.increment('dead_letter_queue.cleanup_failed');
      console.error('期限切れイベントクリーンアップでエラー:', error);
    }
  }

  /**
   * 統計情報を取得
   */
  async getStats(): Promise<DeadLetterStats> {
    try {
      const { data: statusCounts, error: statusError } = await this.supabase
        .from('dead_letter_events')
        .select('status')
        .not('status', 'eq', 'expired');

      if (statusError) {
        throw new Error(`統計情報取得失敗: ${statusError.message}`);
      }

      const { data: retryStats, error: retryError } = await this.supabase
        .from('dead_letter_events')
        .select('retry_count')
        .not('status', 'eq', 'expired');

      if (retryError) {
        throw new Error(`再試行統計取得失敗: ${retryError.message}`);
      }

      const { data: oldestEvent, error: oldestError } = await this.supabase
        .from('dead_letter_events')
        .select('created_at')
        .not('status', 'eq', 'expired')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      const statusMap = (statusCounts || []).reduce((acc, event) => {
        acc[event.status] = (acc[event.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalRetries = (retryStats || []).reduce((sum, event) => sum + event.retry_count, 0);
      const averageRetries = retryStats?.length ? totalRetries / retryStats.length : 0;

      return {
        totalEvents: (statusCounts || []).length,
        pendingEvents: statusMap['pending'] || 0,
        retryingEvents: statusMap['retrying'] || 0,
        failedEvents: statusMap['failed'] || 0,
        successEvents: statusMap['success'] || 0,
        expiredEvents: statusMap['expired'] || 0,
        averageRetries: Math.round(averageRetries * 100) / 100,
        oldestEvent: (!oldestError && oldestEvent) ? oldestEvent.created_at : null,
      };

    } catch (error) {
      console.error('統計情報取得でエラー:', error);

      // エラー時のデフォルト統計
      return {
        totalEvents: 0,
        pendingEvents: 0,
        retryingEvents: 0,
        failedEvents: 0,
        successEvents: 0,
        expiredEvents: 0,
        averageRetries: 0,
        oldestEvent: null,
      };
    }
  }

  /**
   * 手動再試行（管理者機能）
   */
  async manualRetry(eventId: string): Promise<boolean> {
    try {
      const { data: event, error: fetchError } = await this.supabase
        .from('dead_letter_events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (fetchError || !event) {
        throw new Error(`イベント取得失敗: ${fetchError?.message || 'イベントが見つかりません'}`);
      }

      await this.retryEvent(event as DeadLetterEvent);

      this.metrics?.increment('dead_letter_queue.manual_retry');

      return true;

    } catch (error) {
      this.metrics?.increment('dead_letter_queue.manual_retry_failed');
      console.error(`手動再試行失敗 (${eventId}):`, error);
      return false;
    }
  }

  /**
   * イベント正規化（再処理用）
   */
  private normalizeEventForReprocessing(payload: Record<string, unknown>): {
    address: string;
    chain?: string;
    network?: string;
    asset?: string;
    amount: number;
    transactionHash: string;
    fromAddress?: string;
    memo?: string;
    confirmations: number;
    blockNumber?: number;
    tokenAddress?: string;
  } | null {
    try {
      const data = payload.data as Record<string, unknown>;
      if (!data) {
        throw new Error('No data field in payload');
      }

      // 安全な型変換（金融システム向け厳格検証）
      const safeAmount = this.parsePositiveNumber(data.amount, 'amount');
      const safeConfirmations = this.parseNonNegativeInteger(data.confirmations, 'confirmations');
      const safeAddress = this.validateRequiredString(data.address || data.to, 'address');
      const safeTransactionHash = this.validateRequiredString(
        data.txId || data.hash || data.transactionHash,
        'transactionHash'
      );

      return {
        address: safeAddress,
        chain: this.validateOptionalString(data.chain) || this.inferChainFromEventType(payload.type as string),
        network: this.validateOptionalString(data.network),
        asset: this.validateOptionalString(data.asset || data.currency),
        amount: safeAmount,
        transactionHash: safeTransactionHash,
        fromAddress: this.validateOptionalString(data.from),
        memo: this.validateOptionalString(data.memo || data.tag),
        confirmations: safeConfirmations,
        blockNumber: this.parseOptionalInteger(data.blockNumber),
        tokenAddress: this.validateOptionalString(data.tokenAddress),
      };
    } catch (error) {
      console.error('Event normalization failed:', error);
      return null;
    }
  }

  /**
   * 金融システム向け安全な型変換ヘルパーメソッド
   */

  /**
   * 正の数値の安全なパース（金額用）
   */
  private parsePositiveNumber(value: unknown, fieldName: string): number {
    if (value === null || value === undefined || value === '') {
      throw new Error(`Required field '${fieldName}' is missing or empty`);
    }

    const strValue = String(value).trim();
    const numValue = parseFloat(strValue);

    if (isNaN(numValue)) {
      throw new Error(`Invalid number format for '${fieldName}': ${strValue}`);
    }

    if (numValue <= 0) {
      throw new Error(`Field '${fieldName}' must be positive: ${numValue}`);
    }

    if (!isFinite(numValue)) {
      throw new Error(`Field '${fieldName}' must be finite: ${numValue}`);
    }

    // 金額の妥当性チェック（極端に大きな値を拒否）
    const MAX_AMOUNT = 1e15; // 1,000兆
    if (numValue > MAX_AMOUNT) {
      throw new Error(`Field '${fieldName}' exceeds maximum allowed value: ${numValue}`);
    }

    return numValue;
  }

  /**
   * 非負整数の安全なパース（確認数用）
   */
  private parseNonNegativeInteger(value: unknown, fieldName: string): number {
    const strValue = String(value || '0').trim();
    const intValue = parseInt(strValue, 10);

    if (isNaN(intValue)) {
      throw new Error(`Invalid integer format for '${fieldName}': ${strValue}`);
    }

    if (intValue < 0) {
      throw new Error(`Field '${fieldName}' must be non-negative: ${intValue}`);
    }

    const MAX_CONFIRMATIONS = 10000; // 合理的な最大確認数
    if (intValue > MAX_CONFIRMATIONS) {
      throw new Error(`Field '${fieldName}' exceeds maximum confirmations: ${intValue}`);
    }

    return intValue;
  }

  /**
   * オプション整数の安全なパース
   */
  private parseOptionalInteger(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const strValue = String(value).trim();
    const intValue = parseInt(strValue, 10);

    if (isNaN(intValue)) {
      return undefined; // オプションフィールドはエラーにしない
    }

    return intValue >= 0 ? intValue : undefined;
  }

  /**
   * 必須文字列の検証
   */
  private validateRequiredString(value: unknown, fieldName: string): string {
    if (value === null || value === undefined) {
      throw new Error(`Required field '${fieldName}' is missing`);
    }

    const strValue = String(value).trim();
    if (strValue === '') {
      throw new Error(`Required field '${fieldName}' is empty`);
    }

    // 最大長チェック（DoS攻撃防止）
    const MAX_STRING_LENGTH = 500;
    if (strValue.length > MAX_STRING_LENGTH) {
      throw new Error(`Field '${fieldName}' exceeds maximum length: ${strValue.length}`);
    }

    // 基本的な文字種チェック（制御文字の排除）
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(strValue)) {
      throw new Error(`Field '${fieldName}' contains invalid control characters`);
    }

    return strValue;
  }

  /**
   * オプション文字列の検証
   */
  private validateOptionalString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    const strValue = String(value).trim();
    if (strValue === '') {
      return undefined;
    }

    // 最大長チェック
    const MAX_STRING_LENGTH = 500;
    if (strValue.length > MAX_STRING_LENGTH) {
      return undefined; // オプションフィールドは切り捨て
    }

    // 制御文字チェック
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(strValue)) {
      return undefined; // オプションフィールドは無効値を除外
    }

    return strValue;
  }

  /**
   * 入金イベント判定
   */
  private isDepositEvent(eventType: string): boolean {
    const depositEventTypes = [
      'ADDRESS_TRANSACTION',
      'INCOMING_NATIVE_TX',
      'INCOMING_FUNGIBLE_TX'
    ];
    return depositEventTypes.includes(eventType);
  }

  /**
   * チェーン推定
   */
  private inferChainFromEventType(eventType: string): string | undefined {
    if (!eventType) return undefined;

    const type = eventType.toLowerCase();
    if (type.includes('btc') || type.includes('bitcoin')) return 'bitcoin';
    if (type.includes('eth') || type.includes('ethereum')) return 'ethereum';
    if (type.includes('tron') || type.includes('trx')) return 'tron';
    if (type.includes('xrp') || type.includes('ripple')) return 'xrp';

    return undefined;
  }

  /**
   * 入金アドレス検索（再処理用）
   */
  private async findDepositAddressForReprocessing(normalized: {
    address: string;
    memo?: string;
  }): Promise<{
    id: string;
    user_id: string;
    asset: string;
    chain: string;
    network?: string;
    destination_tag?: string;
  } | null> {
    try {
      const query = this.supabase
        .from('deposit_addresses')
        .select('id, user_id, asset, chain, network, destination_tag')
        .eq('address', normalized.address)
        .eq('active', true);

      let addresses: {
        id: string;
        user_id: string;
        asset: string;
        chain: string;
        network?: string;
        destination_tag?: string;
      }[] = [];
      let error: PostgrestError | null = null;

      // memo/destination_tagがある場合の安全な検索（SQL injection完全防止）
      if (normalized.memo) {
        // 1. 完全一致検索
        const { data: exactMatches, error: exactError } = await query
          .eq('destination_tag', normalized.memo);

        if (exactError) {
          error = exactError;
        } else {
          addresses = exactMatches || [];
        }

        // 2. 完全一致がない場合、null destination_tag検索
        if (!error && addresses.length === 0) {
          const { data: nullMatches, error: nullError } = await query
            .is('destination_tag', null);

          if (nullError) {
            error = nullError;
          } else {
            addresses = nullMatches || [];
          }
        }
      } else {
        // memo がない場合は通常の検索
        const { data: allAddresses, error: queryError } = await query;
        addresses = allAddresses || [];
        error = queryError;
      }

      if (error) {
        throw new Error(`Deposit address search failed: ${error.message}`);
      }

      if (!addresses || addresses.length === 0) {
        return null;
      }

      // memo完全マッチを優先
      if (normalized.memo) {
        const exactMatch = addresses.find((addr: { destination_tag?: string }) => addr.destination_tag === normalized.memo);
        if (exactMatch) return exactMatch;

        const nullTagMatch = addresses.find((addr: { destination_tag?: string }) => !addr.destination_tag);
        if (nullTagMatch) return nullTagMatch;
      }

      // 単一レコードの場合
      if (addresses.length === 1) {
        return addresses[0];
      }

      return null;

    } catch (error) {
      console.error('Deposit address search error:', error);
      return null;
    }
  }

  /**
   * 入金処理フロー実行（再処理用）
   */
  private async executeDepositProcessingFlow(
    normalized: {
      address: string;
      chain?: string;
      network?: string;
      asset?: string;
      amount: number;
      transactionHash: string;
      fromAddress?: string;
      memo?: string;
      confirmations: number;
      blockNumber?: number;
    },
    depositAddress: {
      id: string;
      user_id: string;
      asset: string;
      chain: string;
      network?: string;
    }
  ): Promise<void> {
    const requiredConfirmations = this.getRequiredConfirmationsForChain(normalized.chain);
    const isConfirmed = normalized.confirmations >= requiredConfirmations;
    const status = isConfirmed ? 'confirmed' : 'pending';
    const currency = normalized.asset || depositAddress.asset;

    try {
      // 1. deposit_transactions テーブルに詳細記録
      const { error: depositTransactionError } = await this.supabase
        .from('deposit_transactions')
        .insert({
          user_id: depositAddress.user_id,
          deposit_address_id: depositAddress.id,
          chain: normalized.chain || depositAddress.chain,
          network: normalized.network || depositAddress.network,
          asset: currency,
          transaction_hash: normalized.transactionHash,
          block_number: normalized.blockNumber || null,
          from_address: normalized.fromAddress || '',
          to_address: normalized.address,
          amount: normalized.amount.toString(),
          confirmations: normalized.confirmations,
          required_confirmations: requiredConfirmations,
          status: status,
          destination_tag: normalized.memo || null,
          raw_transaction: { reprocessed: true, original_payload: normalized },
          confirmed_at: isConfirmed ? new Date().toISOString() : null
        });

      if (depositTransactionError) {
        throw new Error(`deposit_transactions insert failed: ${depositTransactionError.message}`);
      }

      // 2. deposits テーブルに基本記録
      const { error: depositError } = await this.supabase
        .from('deposits')
        .insert({
          user_id: depositAddress.user_id,
          amount: normalized.amount,
          currency: currency,
          chain: normalized.chain || depositAddress.chain,
          network: normalized.network || depositAddress.network,
          status: status,
          transaction_hash: normalized.transactionHash,
          wallet_address: normalized.address,
          confirmations_required: requiredConfirmations,
          confirmations_observed: normalized.confirmations,
        });

      if (depositError) {
        throw new Error(`deposits insert failed: ${depositError.message}`);
      }

      // 3. user_assets 残高更新（確認済みの場合のみ）
      if (isConfirmed) {
        await this.updateUserAssetBalance(depositAddress.user_id, currency, normalized.amount);
      }

    } catch (error) {
      console.error('Deposit processing flow failed:', error);
      throw error;
    }
  }

  /**
   * 必要確認数取得
   */
  private getRequiredConfirmationsForChain(chain?: string): number {
    const confirmations: Record<string, number> = {
      bitcoin: 3,
      btc: 3,
      ethereum: 12,
      eth: 12,
      tron: 19,
      trx: 19,
      xrp: 1,
    };

    return confirmations[chain?.toLowerCase() || ''] || 12;
  }

  /**
   * ユーザー残高更新（競合状態完全防止版）
   */
  private async updateUserAssetBalance(userId: string, currency: string, amount: number): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 安全な残高加算処理（RPC関数使用）- 原子的操作
        const { error: rpcError } = await this.supabase
          .rpc('upsert_user_asset', {
            p_user_id: userId,
            p_currency: currency,
            p_balance_change: amount,
            p_locked_change: 0
          });

        if (!rpcError) {
          // RPC成功 - 処理完了
          return;
        }

        // RPC失敗時の安全なフォールバック（原子的操作のみ使用）
        console.warn(`RPC upsert_user_asset failed on attempt ${attempt}, using atomic fallback:`, rpcError);

        // PostgreSQL関数での原子的残高更新を試行
        const { error: atomicUpdateError } = await this.supabase
          .rpc('increment_user_balance', {
            p_user_id: userId,
            p_currency: currency,
            p_amount: amount
          });

        if (!atomicUpdateError) {
          // 原子的更新成功
          return;
        }

        // 両方のRPC関数が失敗した場合、最後の手段として楽観的ロック付き更新
        console.warn(`All RPC functions failed on attempt ${attempt}, using optimistic locking:`, atomicUpdateError);

        const { data: currentAsset, error: selectError } = await this.supabase
          .from('user_assets')
          .select('balance, locked_balance, updated_at')
          .eq('user_id', userId)
          .eq('currency', currency)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          throw new Error(`Failed to read current balance: ${selectError.message}`);
        }

        const currentBalance = currentAsset ? parseFloat(currentAsset.balance) || 0 : 0;
        const currentLocked = currentAsset ? parseFloat(currentAsset.locked_balance) || 0 : 0;
        const currentTimestamp = currentAsset ? currentAsset.updated_at : null;
        const newBalance = currentBalance + amount;
        const newTimestamp = new Date().toISOString();

        if (currentAsset) {
          // 既存レコードの楽観的ロック付き更新
          const { error: updateError } = await this.supabase
            .from('user_assets')
            .update({
              balance: newBalance.toString(),
              updated_at: newTimestamp
            })
            .eq('user_id', userId)
            .eq('currency', currency)
            .eq('updated_at', currentTimestamp); // 楽観的ロック

          if (!updateError) {
            return; // 成功
          }

          if (attempt < maxRetries) {
            // 楽観的ロック失敗 - リトライ
            console.warn(`Optimistic lock failed on attempt ${attempt}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50)); // ジッター付き待機
            continue;
          }

          throw new Error(`Optimistic lock update failed: ${updateError.message}`);
        } else {
          // 新規レコード作成（競合時は一意制約違反で失敗）
          const { error: insertError } = await this.supabase
            .from('user_assets')
            .insert({
              user_id: userId,
              currency: currency,
              balance: newBalance.toString(),
              locked_balance: '0',
              updated_at: newTimestamp
            });

          if (!insertError) {
            return; // 成功
          }

          if (insertError.code === '23505' && attempt < maxRetries) {
            // 一意制約違反（別プロセスが先に作成） - リトライ
            console.warn(`Unique constraint violation on attempt ${attempt}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
            continue;
          }

          throw new Error(`New record insert failed: ${insertError.message}`);
        }

      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          console.warn(`Balance update attempt ${attempt} failed, retrying:`, error);
          await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100)); // より長い待機
          continue;
        }
        break;
      }
    }

    // 全ての試行が失敗
    throw new Error(`Balance update failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * 手動リトライ処理（外部API用）
   */
  async manualRetryAll(): Promise<{ success: boolean; processed: number; errors: string[] }> {
    const result = {
      success: true,
      processed: 0,
      errors: [] as string[]
    };

    try {
      // 再試行対象イベントを取得
      const { data: events, error } = await this.supabase
        .from('dead_letter_events')
        .select('*')
        .in('status', ['pending', 'failed'])
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        throw new Error(`Failed to fetch retry events: ${error.message}`);
      }

      if (!events || events.length === 0) {
        return result;
      }

      // 各イベントを順次処理
      for (const event of events) {
        try {
          await this.retryEvent(event as DeadLetterEvent);
          result.processed++;
        } catch (retryError) {
          const errorMsg = retryError instanceof Error ? retryError.message : String(retryError);
          result.errors.push(`Event ${event.id}: ${errorMsg}`);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * 自動処理トリガー（Edge Functions環境対応）
   */
  private async triggerAutoProcessing(): Promise<void> {
    try {
      // 処理中フラグで重複実行を防止
      if (this.isProcessing) {
        return;
      }

      console.log(JSON.stringify({
        level: 'INFO',
        message: 'Dead Letter Queue自動処理トリガー',
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
        trigger: 'probabilistic_auto_processing'
      }));

      // 再試行処理の実行
      await this.processRetries();

      // 10%の確率でクリーンアップも実行
      if (Math.random() < 0.1) {
        await this.cleanupExpiredEvents();
      }

      this.metrics?.increment('dead_letter_queue.auto_processing_triggered');

    } catch (error) {
      this.metrics?.increment('dead_letter_queue.auto_processing_failed');
      console.error(JSON.stringify({
        level: 'ERROR',
        message: 'Dead Letter Queue自動処理エラー',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
      }));
    }
  }

  /**
   * リクエスト処理時のメンテナンスチェック（公開メソッド）
   */
  async performMaintenanceCheck(): Promise<void> {
    // 2%の確率でメンテナンス処理を実行
    const shouldPerformMaintenance = Math.random() < 0.02;

    if (shouldPerformMaintenance) {
      await this.triggerAutoProcessing();
    }
  }

  /**
   * クリーンアップ（終了時）
   */
  async cleanup(): Promise<void> {
    if (this.processingIntervalId) {
      clearInterval(this.processingIntervalId);
      this.processingIntervalId = undefined;
    }

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
    }

    // 最終クリーンアップ実行
    await this.cleanupExpiredEvents();

    console.log('デッドレターキューがクリーンアップされました');
  }
}