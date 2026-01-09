/**
 * Tatum Health Monitor - リファクタリング版
 *
 * ヘルスチェック・監視に特化したクラス
 * 単一責任原則に基づく設計
 */

import type { TatumApiResponse } from './types.ts';
import { TatumHttpClient } from './http-client.ts';
import { TatumRateLimiter } from './rate-limiter.ts';
import { TatumCircuitBreaker } from './circuit-breaker.ts';
import { logger } from './logger.ts';
import { TimeUtils } from './utils.ts';

// ====================================
// ヘルスモニタリング専用クラス
// ====================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  details: {
    api: boolean;
    rateLimiter: boolean;
    circuitBreaker: boolean;
  };
}

export interface HealthCheckOptions {
  includeApiTest?: boolean;
  timeout?: number;
  testEndpoint?: string;
}

export class TatumHealthMonitor {
  private httpClient: TatumHttpClient;
  private rateLimiter: TatumRateLimiter;
  private circuitBreaker: TatumCircuitBreaker;
  private lastHealthCheck: HealthStatus | null = null;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(
    httpClient: TatumHttpClient,
    rateLimiter: TatumRateLimiter,
    circuitBreaker: TatumCircuitBreaker
  ) {
    this.httpClient = httpClient;
    this.rateLimiter = rateLimiter;
    this.circuitBreaker = circuitBreaker;

    logger.info('TatumHealthMonitor initialized');
  }

  /**
   * 包括的ヘルスチェック実行
   */
  async performHealthCheck(options: HealthCheckOptions = {}): Promise<HealthStatus> {
    const {
      includeApiTest = true,
      testEndpoint = '/info',
      timeout = 5000
    } = options;

    const details = {
      api: false,
      rateLimiter: false,
      circuitBreaker: false
    };

    // API接続性テスト
    if (includeApiTest) {
      details.api = await this.checkApiConnectivity(testEndpoint, timeout);
    } else {
      details.api = true; // スキップした場合は健全とみなす
    }

    // レート制限状態チェック
    details.rateLimiter = this.checkRateLimiterHealth();

    // サーキットブレーカー状態チェック
    details.circuitBreaker = this.checkCircuitBreakerHealth();

    // 全体的な健全性評価
    const status = this.evaluateOverallHealth(details);

    const healthStatus: HealthStatus = {
      status,
      timestamp: TimeUtils.nowIso(),
      details
    };

    this.lastHealthCheck = healthStatus;

    logger.info('Health check completed', {
      status,
      details,
      timestamp: healthStatus.timestamp
    });

    return healthStatus;
  }

  /**
   * 簡易ヘルスチェック（API接続なし）
   */
  getQuickHealthStatus(): HealthStatus {
    const details = {
      api: true, // 簡易チェックではAPIテストをスキップ
      rateLimiter: this.checkRateLimiterHealth(),
      circuitBreaker: this.checkCircuitBreakerHealth()
    };

    const status = this.evaluateOverallHealth(details);

    const healthStatus: HealthStatus = {
      status,
      timestamp: TimeUtils.nowIso(),
      details
    };

    logger.debug('Quick health check completed', { healthStatus });

    return healthStatus;
  }

  /**
   * 最後のヘルスチェック結果取得
   */
  getLastHealthCheck(): HealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * 定期ヘルスチェック開始
   */
  startPeriodicHealthCheck(intervalMs: number = 60000): void {
    if (this.healthCheckInterval) {
      this.stopPeriodicHealthCheck();
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Periodic health check failed', error as Error);
      }
    }, intervalMs);

    logger.info('Periodic health check started', { intervalMs });
  }

  /**
   * 定期ヘルスチェック停止
   */
  stopPeriodicHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      logger.info('Periodic health check stopped');
    }
  }

  /**
   * 個別コンポーネントの詳細状態取得
   */
  getDetailedComponentStatus(): {
    rateLimiter: {
      availableTokens: number;
      tokensPerSecond: number;
      isHealthy: boolean;
    };
    circuitBreaker: {
      state: string;
      failures: number;
      isHealthy: boolean;
    };
    api: {
      lastCheckTime: string | null;
      lastCheckSuccess: boolean | null;
    };
  } {
    const rateLimiterStats = this.rateLimiter.getStats();
    const circuitBreakerStats = this.circuitBreaker.getStats();

    return {
      rateLimiter: {
        availableTokens: this.rateLimiter.getAvailableTokens(),
        tokensPerSecond: rateLimiterStats.config.tokensPerSecond,
        isHealthy: this.checkRateLimiterHealth()
      },
      circuitBreaker: {
        state: circuitBreakerStats.state.state,
        failures: circuitBreakerStats.state.failures,
        isHealthy: this.checkCircuitBreakerHealth()
      },
      api: {
        lastCheckTime: this.lastHealthCheck?.timestamp || null,
        lastCheckSuccess: this.lastHealthCheck?.details.api || null
      }
    };
  }

  /**
   * ヘルスステータスのアラート判定
   */
  shouldAlert(currentStatus: HealthStatus): boolean {
    if (!this.lastHealthCheck) {
      return currentStatus.status !== 'healthy';
    }

    // 状態が悪化した場合にアラート
    const statusPriority = { healthy: 3, degraded: 2, unhealthy: 1 };
    const currentPriority = statusPriority[currentStatus.status];
    const lastPriority = statusPriority[this.lastHealthCheck.status];

    return currentPriority < lastPriority;
  }

  /**
   * リソース解放
   */
  destroy(): void {
    this.stopPeriodicHealthCheck();
    this.lastHealthCheck = null;

    logger.info('TatumHealthMonitor destroyed');
  }

  // ====================================
  // Private Implementation
  // ====================================

  private async checkApiConnectivity(endpoint: string, timeout: number): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await this.httpClient.get<Record<string, unknown>>(endpoint, undefined, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.success;

    } catch (error) {
      logger.debug('API connectivity check failed', {
        endpoint,
        error: (error as Error).message
      });
      return false;
    }
  }

  private checkRateLimiterHealth(): boolean {
    const availableTokens = this.rateLimiter.getAvailableTokens();
    const isHealthy = availableTokens > 0;

    logger.debug('Rate limiter health check', {
      availableTokens,
      isHealthy
    });

    return isHealthy;
  }

  private checkCircuitBreakerHealth(): boolean {
    const state = this.circuitBreaker.getState();
    const isHealthy = state.state === 'CLOSED' || state.state === 'HALF_OPEN';

    logger.debug('Circuit breaker health check', {
      state: state.state,
      failures: state.failures,
      isHealthy
    });

    return isHealthy;
  }

  private evaluateOverallHealth(details: HealthStatus['details']): HealthStatus['status'] {
    const healthyComponents = Object.values(details).filter(Boolean).length;
    const totalComponents = Object.keys(details).length;

    if (healthyComponents === totalComponents) {
      return 'healthy';
    } else if (healthyComponents >= Math.ceil(totalComponents / 2)) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }
}