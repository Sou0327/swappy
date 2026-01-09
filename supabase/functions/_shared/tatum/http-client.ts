/**
 * Tatum HTTP Client - リファクタリング版
 *
 * HTTP処理に特化したクライアント
 * 単一責任原則に基づく設計
 */

import type {
  TatumClientConfig,
  TatumRequestConfig,
  TatumApiResponse
} from './types.ts';

import { TatumErrorHandler } from './errors.ts';
import { logger, RequestIdGenerator } from './logger.ts';
import { TatumHttpClient as BaseHttpClient, TimeUtils } from './utils.ts';
import { TatumRateLimiter } from './rate-limiter.ts';
import { TatumCircuitBreaker } from './circuit-breaker.ts';
import { TatumPerformanceManager, type PerformanceConfig } from './performance.ts';

// ====================================
// HTTP専用クライアント
// ====================================

export class TatumHttpClient {
  private baseHttpClient: BaseHttpClient;
  private rateLimiter: TatumRateLimiter;
  private circuitBreaker: TatumCircuitBreaker;
  private performanceManager: TatumPerformanceManager;
  private config: Required<TatumClientConfig>;

  constructor(
    config: Required<TatumClientConfig>,
    rateLimiter: TatumRateLimiter,
    circuitBreaker: TatumCircuitBreaker,
    performanceConfig?: Partial<PerformanceConfig>
  ) {
    this.config = config;
    this.rateLimiter = rateLimiter;
    this.circuitBreaker = circuitBreaker;

    // パフォーマンス最適化マネージャーの初期化
    this.performanceManager = new TatumPerformanceManager(performanceConfig);

    this.baseHttpClient = new BaseHttpClient(
      config.baseUrl,
      config.apiKey,
      config.timeout
    );

    logger.info('TatumHttpClient initialized with performance optimizations', {
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      connectionPool: this.performanceManager.pool !== undefined,
      caching: this.performanceManager.cache !== undefined,
      compression: this.performanceManager.compression !== undefined
    });
  }

  /**
   * 基本的なHTTPリクエスト実行 - パフォーマンス最適化版
   */
  async request<T = unknown>(config: TatumRequestConfig): Promise<TatumApiResponse<T>> {
    const requestId = RequestIdGenerator.generate();
    const timer = logger.startTimer(`${config.method} ${config.endpoint}`);

    // キャッシュキーの生成
    const cacheKey = this.performanceManager.cache.generateKey(
      config.method,
      config.endpoint,
      config.params
    );

    // キャッシュからの取得試行
    const cachedResponse = this.performanceManager.cache.get(cacheKey);
    if (cachedResponse && config.method === 'GET') {
      logger.debug('Cache hit for request', {
        requestId,
        endpoint: config.endpoint,
        method: config.method
      });
      return cachedResponse;
    }

    try {
      // コネクションプールから接続取得
      const connection = await this.performanceManager.pool.acquireConnection();

      try {
        // Execute with protection layers
        const result = await this.executeWithProtection(async () => {
          // Rate limiting
          await this.rateLimiter.acquireToken();

          // Execute HTTP request with connection
          const requestConfig = {
            ...config,
            signal: connection.signal
          };

          return await this.baseHttpClient.request<T>(requestConfig);
        }, `${config.method} ${config.endpoint}`);

        // キャッシュに保存（GETリクエストのみ）
        if (config.method === 'GET' && result.success) {
          this.performanceManager.cache.set(cacheKey, result);
        }

        // Log successful request
        const duration = timer.end();
        logger.info('HTTP request completed with optimization', {
          requestId,
          method: config.method,
          endpoint: config.endpoint,
          duration,
          success: true,
          fromCache: false,
          connectionId: connection.id
        });

        return result;

      } finally {
        // 接続の解放
        connection.release();
      }

    } catch (error) {
      const duration = timer.elapsed();

      // Log failed request
      logger.error('HTTP request failed', error as Error, {
        requestId,
        method: config.method,
        endpoint: config.endpoint,
        duration
      });

      // Determine if retry is needed
      if (TatumErrorHandler.isRetryable(error as Error) &&
          (config.retries ?? this.config.maxRetries) > 0) {

        const retryConfig = {
          ...config,
          retries: (config.retries ?? this.config.maxRetries) - 1
        };

        const retryDelay = TatumErrorHandler.getRetryDelay(
          error as Error,
          this.config.maxRetries - retryConfig.retries!
        );

        logger.info(`Retrying request after ${retryDelay}ms`, {
          requestId,
          endpoint: config.endpoint,
          remainingRetries: retryConfig.retries
        });

        await this.sleep(retryDelay);
        return this.request<T>(retryConfig);
      }

      throw error;
    }
  }

  /**
   * GETリクエスト
   */
  async get<T = unknown>(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.request<T>({
      method: 'GET',
      endpoint,
      params,
      ...config
    });
  }

  /**
   * POSTリクエスト
   */
  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      endpoint,
      body,
      ...config
    });
  }

  /**
   * PUTリクエスト
   */
  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      endpoint,
      body,
      ...config
    });
  }

  /**
   * DELETEリクエスト
   */
  async delete<T = unknown>(
    endpoint: string,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      endpoint,
      ...config
    });
  }

  // ====================================
  // Private Implementation
  // ====================================

  private async executeWithProtection<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    return this.circuitBreaker.execute(operation, operationName);
  }

  /**
   * パフォーマンス統計取得
   */
  getPerformanceStats(): Record<string, unknown> {
    return this.performanceManager.getPerformanceStats();
  }

  /**
   * キャッシュクリア
   */
  clearCache(): void {
    this.performanceManager.cache.clear();
  }

  /**
   * パフォーマンス最適化設定の更新
   */
  updatePerformanceConfig(config: Partial<PerformanceConfig>): void {
    // 新しい設定でパフォーマンスマネージャーを再初期化
    this.performanceManager.destroy();
    this.performanceManager = new TatumPerformanceManager(config);

    logger.info('Performance configuration updated', config);
  }

  /**
   * リソース解放
   */
  destroy(): void {
    this.performanceManager.destroy();
    logger.info('TatumHttpClient destroyed');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}