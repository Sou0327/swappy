// Tatum Webhook Health Checker - 包括的ヘルスチェックシステム

import type { HealthCheckResult, EnvironmentConfig } from './types.ts';
import type { Logger } from './logger.ts';
import type { MetricsCollector } from './metrics.ts';
import type { DistributedRateLimiter } from './rate-limiter.ts';
import { SERVICE_NAME, SERVICE_VERSION, ENVIRONMENT, MEMORY_CONFIG } from './config.ts';

// @ts-expect-error Supabase JS (esm) for Deno
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * 包括的ヘルスチェックシステム
 * 依存サービス、システムリソース、アプリケーション状態を監視
 */
export class HealthChecker {
  private supabase: SupabaseClient;
  private logger?: Logger;
  private metrics?: MetricsCollector;
  private rateLimiter?: DistributedRateLimiter;
  private startTime: number;

  constructor(config: EnvironmentConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
    this.startTime = Date.now();
  }

  /**
   * 依存オブジェクト設定
   */
  setDependencies(logger: Logger, metrics: MetricsCollector, rateLimiter: DistributedRateLimiter) {
    this.logger = logger;
    this.metrics = metrics;
    this.rateLimiter = rateLimiter;
  }

  /**
   * 包括的ヘルスチェック実行
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // 並列でヘルスチェック実行
      const [
        supabaseHealth,
        memoryHealth,
        rateLimiterHealth,
        metricsHealth,
        performanceHealth
      ] = await Promise.allSettled([
        this.checkSupabase(),
        this.checkMemory(),
        this.checkRateLimiter(),
        this.checkMetrics(),
        this.checkPerformance()
      ]);

      const checks = {
        supabase: this.getHealthStatus(supabaseHealth),
        memory: this.getHealthStatus(memoryHealth),
        rate_limiter: this.getHealthStatus(rateLimiterHealth),
        metrics: this.getHealthStatus(metricsHealth),
        performance: this.getHealthStatus(performanceHealth),
        environment: 'ok' as const,
      };

      // 全体のステータス判定
      const overallStatus = this.determineOverallStatus(checks);

      const result: HealthCheckResult = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        environment: ENVIRONMENT,
        checks,
        metrics: {
          memory: this.getCurrentMemoryUsage(),
          uptime: Date.now() - this.startTime,
        },
      };

      // ヘルスチェック時間を記録
      const duration = Date.now() - startTime;
      this.metrics?.timing('health_check.duration', duration);
      this.metrics?.increment('health_check.completed', { status: overallStatus });

      if (this.logger) {
        const context = {
          correlationId: 'health-check',
          timestamp: new Date().toISOString(),
          service: SERVICE_NAME,
          version: SERVICE_VERSION,
          environment: ENVIRONMENT,
        };

        if (overallStatus === 'healthy') {
          this.logger.debug('ヘルスチェック完了', context, { result });
        } else {
          this.logger.warn(`ヘルスチェック異常: ${overallStatus}`, context, { result });
        }
      }

      return result;

    } catch (error) {
      // ヘルスチェック自体の失敗
      const errorResult: HealthCheckResult = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        environment: ENVIRONMENT,
        checks: {
          health_checker: 'error'
        },
      };

      this.metrics?.increment('health_check.error');

      return errorResult;
    }
  }

  /**
   * Supabaseデータベース接続チェック
   */
  private async checkSupabase(): Promise<void> {
    try {
      // 軽量クエリで接続確認
      const { error } = await this.supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      if (error) {
        throw new Error(`Supabase接続エラー: ${error.message}`);
      }

      // レスポンス時間測定
      const startTime = Date.now();
      await this.supabase.rpc('version'); // PostgreSQL versionを取得
      const responseTime = Date.now() - startTime;

      if (responseTime > 5000) { // 5秒以上
        throw new Error(`Supabaseレスポンス時間過大: ${responseTime}ms`);
      }

      this.metrics?.timing('health_check.supabase.response_time', responseTime);

    } catch (error) {
      this.metrics?.increment('health_check.supabase.failed');
      throw error;
    }
  }

  /**
   * メモリ使用量チェック
   */
  private async checkMemory(): Promise<void> {
    try {
      const memoryUsage = this.getCurrentMemoryUsage();

      // メモリ使用量を記録
      this.metrics?.gauge('health_check.memory.used_mb', memoryUsage.rss / 1024 / 1024);
      this.metrics?.gauge('health_check.memory.heap_used_mb', memoryUsage.heapUsed / 1024 / 1024);

      // メモリ使用量が制限値を超えている場合
      const usedMB = memoryUsage.rss / 1024 / 1024;
      if (usedMB > MEMORY_CONFIG.maxMemoryUsageMB * 0.9) { // 90%以上
        throw new Error(`メモリ使用量過大: ${usedMB.toFixed(1)}MB / ${MEMORY_CONFIG.maxMemoryUsageMB}MB`);
      }

    } catch (error) {
      this.metrics?.increment('health_check.memory.failed');
      throw error;
    }
  }

  /**
   * レート制限システムチェック
   */
  private async checkRateLimiter(): Promise<void> {
    if (!this.rateLimiter) return;

    try {
      const stats = await this.rateLimiter.getStats();

      // 統計を記録
      this.metrics?.gauge('health_check.rate_limiter.active_clients', stats.activeClients);
      this.metrics?.increment('health_check.rate_limiter.check', { mode: stats.mode });

      // アクティブクライアント数が異常に多い場合
      if (stats.activeClients > 50000) {
        throw new Error(`レート制限クライアント数過大: ${stats.activeClients}`);
      }

      // 分散モードでKV接続に問題がある場合
      if (stats.mode === 'distributed' && !stats.kvConnected) {
        throw new Error('分散レート制限でKV接続失敗');
      }

    } catch (error) {
      this.metrics?.increment('health_check.rate_limiter.failed');
      throw error;
    }
  }

  /**
   * メトリクスシステムチェック
   */
  private async checkMetrics(): Promise<void> {
    if (!this.metrics) return;

    try {
      const stats = this.metrics.getStats();

      // メトリクスバッファサイズを記録
      this.metrics.gauge('health_check.metrics.buffer_size', stats.bufferSize);

      // バッファが満杯に近い場合
      if (stats.bufferSize > MEMORY_CONFIG.metricsMaxSize * 0.9) {
        throw new Error(`メトリクスバッファ満杯: ${stats.bufferSize}/${MEMORY_CONFIG.metricsMaxSize}`);
      }

      // メモリ使用量異常
      if (stats.memoryUsage.usage > 85) {
        throw new Error(`メモリ使用率異常: ${stats.memoryUsage.usage.toFixed(1)}%`);
      }

    } catch (error) {
      this.metrics?.increment('health_check.metrics.failed');
      throw error;
    }
  }

  /**
   * パフォーマンスチェック
   */
  private async checkPerformance(): Promise<void> {
    try {
      // 簡単なパフォーマンステスト
      const iterations = 10000;
      const startTime = Date.now();

      // CPU集約的なタスク
      let result = 0;
      for (let i = 0; i < iterations; i++) {
        result += Math.random() * Math.random();
      }
      // 結果を無視（最適化防止）
      void result;

      const cpuTime = Date.now() - startTime;

      // I/O集約的なタスク
      const ioStartTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 10));
      const ioTime = Date.now() - ioStartTime;

      this.metrics?.timing('health_check.performance.cpu_time', cpuTime);
      this.metrics?.timing('health_check.performance.io_time', ioTime);

      // CPU時間が異常に長い場合
      if (cpuTime > 1000) { // 1秒以上
        throw new Error(`CPU応答時間異常: ${cpuTime}ms`);
      }

      // I/O時間が異常に長い場合
      if (ioTime > 100) { // 100ms以上
        throw new Error(`I/O応答時間異常: ${ioTime}ms`);
      }

    } catch (error) {
      this.metrics?.increment('health_check.performance.failed');
      throw error;
    }
  }

  /**
   * Promise結果からヘルス状態を取得
   */
  private getHealthStatus(result: PromiseSettledResult<void>): 'ok' | 'warn' | 'error' {
    if (result.status === 'fulfilled') {
      return 'ok';
    } else {
      // エラーの深刻度判定
      const error = result.reason;
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('warn') || message.includes('過大')) {
          return 'warn';
        }
      }
      return 'error';
    }
  }

  /**
   * 全体のステータス判定
   */
  private determineOverallStatus(checks: Record<string, string>): 'healthy' | 'degraded' | 'unhealthy' {
    const checkValues = Object.values(checks);

    if (checkValues.includes('error')) {
      return 'unhealthy';
    } else if (checkValues.includes('warn')) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * 現在のメモリ使用量取得
   */
  private getCurrentMemoryUsage(): NodeJS.MemoryUsage {
    // Deno環境でのメモリ取得（安全なアクセス）
    try {
      const denoGlobal = globalThis as unknown as { Deno?: { memoryUsage?: () => NodeJS.MemoryUsage } };
      if (denoGlobal.Deno && 'memoryUsage' in denoGlobal.Deno) {
        return denoGlobal.Deno.memoryUsage!();
      }
    } catch {
      // フォールバック
    }

    // デフォルト値
    return {
      rss: 50 * 1024 * 1024, // 50MB
      heapTotal: 40 * 1024 * 1024,
      heapUsed: 30 * 1024 * 1024,
      external: 5 * 1024 * 1024,
      arrayBuffers: 1 * 1024 * 1024,
    };
  }

  /**
   * ヘルスチェックレスポンス生成
   */
  async handleHealthCheck(): Promise<Response> {
    const health = await this.performHealthCheck();

    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 200 : 503;

    return new Response(JSON.stringify(health, null, 2), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}