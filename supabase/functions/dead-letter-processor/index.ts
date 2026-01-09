// Dead Letter Queue Scheduled Processor - 自動復旧システム
// 金融システムの失敗イベント自動復旧を定期実行

// @ts-expect-error Deno runtime import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// DeadLetterQueueクラスをインポート（相対パス）
import { DeadLetterQueue } from '../tatum-webhook/dead-letter-queue.ts';
import { Logger } from '../tatum-webhook/logger.ts';
import { MetricsCollector } from '../tatum-webhook/metrics.ts';
import { validateEnvironment, SERVICE_NAME } from '../tatum-webhook/config.ts';

/**
 * Dead Letter Queue Scheduled Processor
 * 定期的にDead Letter Queueの処理を実行し、失敗したイベントを自動復旧
 */
class DeadLetterProcessor {
  private deadLetterQueue: DeadLetterQueue;
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: {
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    logLevel: string;
    enableAuditLogging: boolean;
    enableMetrics: boolean;
    environment?: string;
  };

  constructor() {
    // 環境設定の初期化
    this.config = validateEnvironment();

    // モジュール初期化
    this.logger = new Logger(this.config.logLevel, this.config.enableAuditLogging);
    this.metrics = new MetricsCollector(this.config.enableMetrics);
    this.deadLetterQueue = new DeadLetterQueue(
      this.config.supabaseUrl,
      this.config.supabaseServiceRoleKey
    );

    // 依存関係設定
    this.deadLetterQueue.setDependencies(this.logger, this.metrics);

    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Dead Letter Processor初期化完了',
      service: `${SERVICE_NAME}-dlq-processor`,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * メイン処理：Dead Letter Queueの定期処理を実行
   */
  async process(): Promise<{ success: boolean; processed: number; errors: string[] }> {
    const startTime = Date.now();
    const correlationId = `dlq-processor-${Date.now()}`;

    try {
      this.logger.info('Dead Letter Queue自動処理開始', {
        correlationId,
        timestamp: new Date().toISOString(),
        service: `${SERVICE_NAME}-dlq-processor`,
        version: '1.0.0',
        environment: this.config.environment || 'production',
      });

      // 統計情報を取得して現在の状況をログ
      const statsBefore = await this.deadLetterQueue.getStats();
      this.logger.info('処理前統計', {
        correlationId,
        timestamp: new Date().toISOString(),
        service: `${SERVICE_NAME}-dlq-processor`,
        version: '1.0.0',
        environment: this.config.environment || 'production',
      }, null, statsBefore);

      // メイン処理：processRetries実行
      await this.deadLetterQueue.processRetries();

      // クリーンアップ処理：期限切れイベントの削除
      await this.deadLetterQueue.cleanupExpiredEvents();

      // 処理後の統計情報を取得
      const statsAfter = await this.deadLetterQueue.getStats();

      const processed = statsBefore.pendingEvents + statsBefore.retryingEvents -
                       statsAfter.pendingEvents - statsAfter.retryingEvents;

      // メトリクス記録
      this.metrics.increment('dead_letter_queue.scheduled_processing_success', {
        processed_count: String(processed),
        duration_ms: String(Date.now() - startTime)
      });

      this.metrics.timing('dead_letter_queue.scheduled_processing_duration', Date.now() - startTime);

      // 監査ログ
      await this.logger.auditLog({
        event: 'dead_letter_scheduled_processing',
        correlationId,
        timestamp: new Date().toISOString(),
        service: `${SERVICE_NAME}-dlq-processor`,
        version: '1.0.0',
        environment: this.config.environment || 'production',
        resource: 'dead_letter_queue',
        details: {
          processed,
          duration_ms: Date.now() - startTime,
          stats_before: statsBefore,
          stats_after: statsAfter
        },
      });

      this.logger.info('Dead Letter Queue自動処理完了', {
        correlationId,
        timestamp: new Date().toISOString(),
        service: `${SERVICE_NAME}-dlq-processor`,
        version: '1.0.0',
        environment: this.config.environment || 'production',
      }, null, {
        processed,
        duration_ms: Date.now() - startTime,
        success: true
      });

      return {
        success: true,
        processed,
        errors: []
      };

    } catch (error) {
      // エラー処理
      this.metrics.increment('dead_letter_queue.scheduled_processing_failed');

      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Dead Letter Queue自動処理エラー', {
        correlationId,
        timestamp: new Date().toISOString(),
        service: `${SERVICE_NAME}-dlq-processor`,
        version: '1.0.0',
        environment: this.config.environment || 'production',
      }, error as Error, {
        duration_ms: Date.now() - startTime
      });

      return {
        success: false,
        processed: 0,
        errors: [errorMessage]
      };
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<{
    status: string;
    service: string;
    version: string;
    timestamp: string;
    dead_letter_stats?: Record<string, unknown>;
    error?: string;
    checks: {
      dead_letter_queue: { healthy: boolean; error?: string };
      database: { healthy: boolean };
    };
  }> {
    try {
      const stats = await this.deadLetterQueue.getStats();
      return {
        status: 'healthy',
        service: `${SERVICE_NAME}-dlq-processor`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        dead_letter_stats: stats,
        checks: {
          dead_letter_queue: { healthy: true },
          database: { healthy: true }
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: `${SERVICE_NAME}-dlq-processor`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        checks: {
          dead_letter_queue: { healthy: false, error: error instanceof Error ? error.message : String(error) },
          database: { healthy: false }
        }
      };
    }
  }
}

// グローバルプロセッサーインスタンス
let processor: DeadLetterProcessor;

/**
 * Supabase Scheduled Function エントリーポイント
 */
serve(async (request: Request) => {
  // 初回リクエスト時にプロセッサー初期化
  if (!processor) {
    try {
      processor = new DeadLetterProcessor();
    } catch (initError) {
      console.error('Dead Letter Processor初期化エラー:', initError);
      return new Response(JSON.stringify({
        error: 'Processor initialization failed',
        message: initError instanceof Error ? initError.message : String(initError)
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  try {
    const url = new URL(request.url);

    // ヘルスチェックエンドポイント
    if (request.method === 'GET' && url.pathname.endsWith('/health')) {
      const health = await processor.healthCheck();
      return new Response(JSON.stringify(health), {
        status: health.status === 'healthy' ? 200 : 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // メイン処理（POSTまたはScheduled実行）
    if (request.method === 'POST' || request.method === 'GET') {
      const result = await processor.process();

      return new Response(JSON.stringify({
        success: result.success,
        processed: result.processed,
        errors: result.errors,
        message: result.success
          ? `${result.processed}件のイベントを処理しました`
          : `処理中にエラーが発生: ${result.errors.join(', ')}`,
        timestamp: new Date().toISOString()
      }), {
        status: result.success ? 200 : 207,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405 });

  } catch (error) {
    console.error('Dead Letter Processor実行エラー:', error);

    return new Response(JSON.stringify({
      error: 'Processing failed',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});