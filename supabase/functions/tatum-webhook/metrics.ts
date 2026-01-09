// Tatum Webhook Metrics - メトリクス収集システム（メモリリーク対策済み）

import type { MetricPoint, LogContext } from './types.ts';
import type { Logger } from './logger.ts';
import { SERVICE_NAME, ENVIRONMENT, MEMORY_CONFIG } from './config.ts';

/**
 * メトリクス収集システム（改良版）
 * メモリリーク対策とバッファ管理を実装
 */
export class MetricsCollector {
  private enabled: boolean;
  private metrics: MetricPoint[] = [];
  private counters: Map<string, number> = new Map();
  private lastFlush: number = Date.now();
  private memoryWarningLogged: boolean = false;
  private memoryCheckIntervalId?: number;
  private autoFlushIntervalId?: number;

  constructor(enabled: boolean) {
    this.enabled = enabled;

    if (this.enabled) {
      // 定期的なメモリチェック
      this.memoryCheckIntervalId = setInterval(() => this.checkMemoryUsage(), MEMORY_CONFIG.memoryCheckInterval);

      // 自動フラッシュ（バッファ満杯防止）
      this.autoFlushIntervalId = setInterval(() => this.autoFlush(), MEMORY_CONFIG.metricsMaxSize * 100); // 適度な間隔
    }
  }

  /**
   * メトリクスを記録
   */
  record(name: string, value: number, tags: Record<string, string> = {}) {
    if (!this.enabled) return;

    // バッファサイズチェック
    if (this.metrics.length >= MEMORY_CONFIG.metricsMaxSize) {
      this.forceFlush();
    }

    this.metrics.push({
      name,
      value,
      tags: {
        service: SERVICE_NAME,
        environment: ENVIRONMENT,
        ...tags,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * カウンターメトリクス（累積カウント方式）
   * Prometheus標準に準拠した累積カウンターを維持
   */
  increment(name: string, tags: Record<string, string> = {}) {
    if (!this.enabled) return;

    // タグを含む一意キーを生成
    const sortedTags = Object.keys(tags).sort().map(key => `${key}=${tags[key]}`).join(',');
    const counterKey = `${name}|${sortedTags}`;

    // 累積カウンターを更新
    const currentCount = this.counters.get(counterKey) || 0;
    const newCount = currentCount + 1;
    this.counters.set(counterKey, newCount);

    // 累積値を記録
    this.record(name, newCount, { ...tags, type: 'counter' });
  }

  /**
   * 実行時間メトリクス
   */
  timing(name: string, durationMs: number, tags: Record<string, string> = {}) {
    this.record(name, durationMs, { ...tags, unit: 'ms' });
  }

  /**
   * ゲージメトリクス（現在値）
   */
  gauge(name: string, value: number, tags: Record<string, string> = {}) {
    this.record(name, value, { ...tags, type: 'gauge' });
  }

  /**
   * ヒストグラムメトリクス（分布）
   * Prometheus標準に準拠した累積カウント方式
   */
  histogram(name: string, value: number, buckets: number[] = [1, 5, 10, 25, 50, 100, 250, 500, 1000], tags: Record<string, string> = {}) {
    // バケット別に累積カウント記録（Prometheus標準）
    for (const bucket of buckets) {
      if (value <= bucket) {
        const bucketTags = { ...tags, le: bucket.toString() };
        this.increment(`${name}_bucket`, bucketTags);
      }
    }

    // +Inf バケットは全てのサンプルが含まれる
    this.increment(`${name}_bucket`, { ...tags, le: '+Inf' });

    // 総計と総数を記録
    this.record(`${name}_sum`, value, tags);
    this.increment(`${name}_count`, tags);
  }

  /**
   * システムメトリクスを記録
   */
  recordSystemMetrics() {
    if (!this.enabled) return;

    try {
      // メモリ使用量
      const memoryUsage = this.getMemoryUsage();
      this.gauge('system.memory.used_mb', memoryUsage.used);
      this.gauge('system.memory.available_mb', memoryUsage.available);
      this.gauge('system.memory.usage_percent', memoryUsage.usage);

      // メトリクスバッファサイズ
      this.gauge('system.metrics.buffer_size', this.metrics.length);

      // アップタイム（利用可能な場合）
      // @ts-expect-error Deno.metrics is not included in the type definitions for Supabase Edge Functions
      if (typeof Deno.metrics === 'function') {
        // @ts-expect-error Deno.metrics is not included in the type definitions for Supabase Edge Functions
        const denoMetrics = Deno.metrics();
        this.gauge('system.deno.ops_dispatched', denoMetrics.opsDispatched);
        this.gauge('system.deno.ops_completed', denoMetrics.opsCompleted);
      }

    } catch (error) {
      console.warn('システムメトリクス収集エラー:', error);
    }
  }

  /**
   * メトリクスの定期送信
   */
  async flush(logger?: Logger, context?: LogContext) {
    if (!this.enabled || this.metrics.length === 0) return;

    const metricsToFlush = [...this.metrics];
    this.metrics = []; // バッファクリア
    this.lastFlush = Date.now();

    if (logger && context) {
      logger.debug(`メトリクス送信: ${metricsToFlush.length}件`, context, {
        metrics: metricsToFlush,
        bufferCleared: true
      });
    }

    // 実際の実装では外部メトリクスサービスに送信
    // 例: Prometheus, DataDog, CloudWatch等
    return metricsToFlush;
  }

  /**
   * 強制フラッシュ（バッファ満杯時）
   */
  private forceFlush() {
    const flushedCount = this.metrics.length;
    this.metrics = [];
    this.lastFlush = Date.now();

    console.warn(JSON.stringify({
      level: 'WARN',
      message: `メトリクスバッファが満杯のため強制フラッシュ実行`,
      flushedCount,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * 自動フラッシュ（定期実行）
   */
  private autoFlush() {
    const timeSinceLastFlush = Date.now() - this.lastFlush;
    const shouldFlush = this.metrics.length > 0 && timeSinceLastFlush > 60000; // 1分経過

    if (shouldFlush) {
      this.flush();
    }
  }

  /**
   * メモリ使用量チェック
   */
  private checkMemoryUsage() {
    const memoryUsage = this.getMemoryUsage();

    if (memoryUsage.usage > 80) { // 80%超過
      if (!this.memoryWarningLogged) {
        console.warn(JSON.stringify({
          level: 'WARN',
          message: 'メモリ使用量が高い状態',
          memoryUsageMB: memoryUsage.used,
          usagePercent: memoryUsage.usage,
          metricsBufferSize: this.metrics.length,
          timestamp: new Date().toISOString(),
        }));
        this.memoryWarningLogged = true;
      }

      // 緊急時のメトリクスクリア
      if (memoryUsage.usage > 90) {
        this.forceFlush();
      }
    } else {
      this.memoryWarningLogged = false;
    }
  }

  /**
   * メモリ使用量を取得
   */
  private getMemoryUsage(): { used: number; available: number; usage: number } {
    // Deno環境でのメモリ取得（可能な限り）
    const maxMemory = MEMORY_CONFIG.maxMemoryUsageMB;

    try {
      // Deno.memoryUsage()が利用可能な場合
      if ('memoryUsage' in Deno) {
        const usage = (Deno as { memoryUsage(): { rss?: number; heapUsed?: number } }).memoryUsage();
        const usedMB = Math.round((usage.rss || usage.heapUsed || 0) / 1024 / 1024);
        return {
          used: usedMB,
          available: maxMemory - usedMB,
          usage: (usedMB / maxMemory) * 100,
        };
      }
    } catch {
      // フォールバック
    }

    // 推定値を返す
    const estimatedUsed = Math.max(50, this.metrics.length * 0.001); // 大まかな推定
    return {
      used: estimatedUsed,
      available: maxMemory - estimatedUsed,
      usage: (estimatedUsed / maxMemory) * 100,
    };
  }

  /**
   * メトリクス統計を取得
   */
  getStats(): {
    enabled: boolean;
    bufferSize: number;
    lastFlush: number;
    memoryUsage: ReturnType<typeof this.getMemoryUsage>;
  } {
    return {
      enabled: this.enabled,
      bufferSize: this.metrics.length,
      lastFlush: this.lastFlush,
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * クリーンアップ（終了時）
   */
  async cleanup(): Promise<void> {
    // setInterval タイマーのクリア
    if (this.memoryCheckIntervalId) {
      clearInterval(this.memoryCheckIntervalId);
      this.memoryCheckIntervalId = undefined;
    }

    if (this.autoFlushIntervalId) {
      clearInterval(this.autoFlushIntervalId);
      this.autoFlushIntervalId = undefined;
    }

    if (this.metrics.length > 0) {
      await this.flush();
    }
  }
}