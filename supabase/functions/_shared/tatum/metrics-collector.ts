/**
 * Tatum Metrics Collector - リファクタリング版
 *
 * メトリクス収集・分析に特化したクラス
 * 単一責任原則に基づく設計
 */

import type { MetricsData, CircuitState } from './types.ts';
import { TimeUtils } from './utils.ts';
import { logger } from './logger.ts';

// ====================================
// メトリクス専用コレクター
// ====================================

export interface ClientMetricsData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  circuitBreakerTrips: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export class TatumMetricsCollector {
  private responseTimes: number[] = [];
  private requestCounts = {
    total: 0,
    successful: 0,
    failed: 0,
    rateLimited: 0
  };
  private circuitBreakerTrips = 0;
  private maxResponseTimes = 1000; // 最新1000リクエストの応答時間を保持

  constructor(maxResponseTimes = 1000) {
    this.maxResponseTimes = maxResponseTimes;

    logger.info('TatumMetricsCollector initialized', {
      maxResponseTimes: this.maxResponseTimes
    });
  }

  /**
   * 成功リクエストの記録
   */
  recordSuccess(responseTime: number): void {
    this.requestCounts.total++;
    this.requestCounts.successful++;
    this.addResponseTime(responseTime);

    logger.debug('Success recorded', {
      responseTime,
      totalRequests: this.requestCounts.total
    });
  }

  /**
   * エラーリクエストの記録
   */
  recordError(error: Error, responseTime: number): void {
    this.requestCounts.total++;
    this.requestCounts.failed++;
    this.addResponseTime(responseTime);

    // 特定エラータイプの判定
    if (error.name === 'TatumRateLimitError') {
      this.requestCounts.rateLimited++;
    }

    if (error.name === 'TatumCircuitBreakerError') {
      this.circuitBreakerTrips++;
    }

    logger.debug('Error recorded', {
      errorName: error.name,
      responseTime,
      failedRequests: this.requestCounts.failed
    });
  }

  /**
   * レート制限リクエストの記録
   */
  recordRateLimit(responseTime: number): void {
    this.requestCounts.total++;
    this.requestCounts.failed++;
    this.requestCounts.rateLimited++;
    this.addResponseTime(responseTime);

    logger.debug('Rate limit recorded', {
      responseTime,
      rateLimitedRequests: this.requestCounts.rateLimited
    });
  }

  /**
   * サーキットブレーカー作動の記録
   */
  recordCircuitBreakerTrip(): void {
    this.circuitBreakerTrips++;

    logger.debug('Circuit breaker trip recorded', {
      trips: this.circuitBreakerTrips
    });
  }

  /**
   * クライアントメトリクス取得
   */
  getClientMetrics(): ClientMetricsData {
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);

    return {
      totalRequests: this.requestCounts.total,
      successfulRequests: this.requestCounts.successful,
      failedRequests: this.requestCounts.failed,
      rateLimitedRequests: this.requestCounts.rateLimited,
      circuitBreakerTrips: this.circuitBreakerTrips,
      averageResponseTime: this.calculateAverage(this.responseTimes),
      p95ResponseTime: this.calculatePercentile(sortedTimes, 95),
      p99ResponseTime: this.calculatePercentile(sortedTimes, 99)
    };
  }

  /**
   * 統合メトリクス生成（外部統計と組み合わせ）
   */
  generateMetrics(
    rateLimiterStats: { tokens: number; requests: number },
    circuitBreakerStats: { state: CircuitState; failures: number }
  ): MetricsData {
    const clientMetrics = this.getClientMetrics();

    return {
      requests: {
        total: clientMetrics.totalRequests,
        successful: clientMetrics.successfulRequests,
        failed: clientMetrics.failedRequests,
        rateLimited: clientMetrics.rateLimitedRequests
      },
      performance: {
        averageResponseTime: clientMetrics.averageResponseTime,
        p95ResponseTime: clientMetrics.p95ResponseTime,
        p99ResponseTime: clientMetrics.p99ResponseTime
      },
      circuitBreaker: {
        state: circuitBreakerStats.state,
        failures: circuitBreakerStats.failures,
        trips: clientMetrics.circuitBreakerTrips
      },
      rateLimiter: {
        tokens: rateLimiterStats.tokens,
        blocked: clientMetrics.rateLimitedRequests,
        requests: clientMetrics.totalRequests
      },
      timestamp: TimeUtils.nowIso()
    };
  }

  /**
   * メトリクス概要の取得
   */
  getSummary(): {
    totalRequests: number;
    errorRate: number;
    averageResponseTime: number;
    uptime: string;
  } {
    const metrics = this.getClientMetrics();
    const errorRate = metrics.totalRequests > 0
      ? (metrics.failedRequests / metrics.totalRequests) * 100
      : 0;

    return {
      totalRequests: metrics.totalRequests,
      errorRate: Math.round(errorRate * 100) / 100,
      averageResponseTime: metrics.averageResponseTime,
      uptime: TimeUtils.nowIso()
    };
  }

  /**
   * メトリクスリセット
   */
  reset(): void {
    this.responseTimes = [];
    this.requestCounts = {
      total: 0,
      successful: 0,
      failed: 0,
      rateLimited: 0
    };
    this.circuitBreakerTrips = 0;

    logger.info('Metrics reset');
  }

  /**
   * 統計情報取得
   */
  getStats(): {
    responseTimeCount: number;
    maxResponseTimes: number;
    lastResetTime: string;
  } {
    return {
      responseTimeCount: this.responseTimes.length,
      maxResponseTimes: this.maxResponseTimes,
      lastResetTime: TimeUtils.nowIso()
    };
  }

  // ====================================
  // Private Implementation
  // ====================================

  private addResponseTime(time: number): void {
    this.responseTimes.push(time);

    // 古い応答時間データを削除（メモリ効率化）
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes.shift();
    }
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sum = numbers.reduce((a, b) => a + b, 0);
    return Math.round(sum / numbers.length);
  }

  private calculatePercentile(sortedNumbers: number[], percentile: number): number {
    if (sortedNumbers.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedNumbers.length) - 1;
    return sortedNumbers[Math.max(0, index)] || 0;
  }
}