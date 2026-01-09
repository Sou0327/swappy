/**
 * Tatum API Client - Refactored Version
 *
 * オーケストレーション層として機能する統合APIクライアント
 * 単一責任原則に基づくコンポーネント協調
 */

import type {
  TatumClientConfig,
  TatumRequestConfig,
  TatumApiResponse,
  SupportedChain,
  UndefinedChain,
  UndefinedNetwork,
  UndefinedAsset,
  MetricsData
} from './types.ts';

import { tatumConfig, TatumConfig } from './config.ts';
import { TatumConfigError } from './errors.ts';
import { logger } from './logger.ts';
import { TatumHttpClient } from './http-client.ts';
import { TatumMetricsCollector } from './metrics-collector.ts';
import { TatumHealthMonitor } from './health-monitor.ts';
import { TatumConfigManager } from './config-manager.ts';
import { TatumSecureRequestHandler, TatumSecurityFactory, type SecurityConfig } from './security.ts';
import { type PerformanceConfig } from './performance.ts';
import { TatumRateLimiter, rateLimiterManager } from './rate-limiter.ts';
import { TatumCircuitBreaker, circuitBreakerManager } from './circuit-breaker.ts';

// ====================================
// Refactored Tatum Client - Orchestration Layer
// ====================================

export class TatumClient {
  private httpClient: TatumHttpClient;
  private rateLimiter: TatumRateLimiter;
  private circuitBreaker: TatumCircuitBreaker;
  private metricsCollector: TatumMetricsCollector;
  private healthMonitor: TatumHealthMonitor;
  private configManager: TatumConfigManager;
  private secureHandler: TatumSecureRequestHandler;
  private performanceConfig?: Partial<PerformanceConfig>;
  private isInitialized = false;

  constructor(
    config?: Partial<TatumClientConfig>,
    securityConfig?: Partial<SecurityConfig>,
    performanceConfig?: Partial<PerformanceConfig>
  ) {
    // Merge with default configuration
    const mergedConfig: Required<TatumClientConfig> = {
      ...tatumConfig.getClientConfig(),
      ...config
    };

    // Initialize configuration manager with security
    this.configManager = new TatumConfigManager(mergedConfig, securityConfig);

    // Initialize security handler
    this.secureHandler = TatumSecurityFactory.createSecureHandler(securityConfig);

    // Store performance config for HTTP client initialization
    this.performanceConfig = performanceConfig;

    // Initialize core components
    this.initializeComponents();

    // Initialize specialized components
    this.metricsCollector = new TatumMetricsCollector();
    this.healthMonitor = new TatumHealthMonitor(
      this.httpClient,
      this.rateLimiter,
      this.circuitBreaker
    );

    // Set component references for configuration management
    this.configManager.setComponents(this.rateLimiter, this.circuitBreaker);

    logger.info('Refactored Tatum client created with security features', {
      baseUrl: mergedConfig.baseUrl,
      timeout: mergedConfig.timeout,
      maxRetries: mergedConfig.maxRetries,
      debug: mergedConfig.debug,
      securityEnabled: this.configManager.getSecurityConfig().enableInputValidation
    });
  }

  /**
   * クライアント初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const config = this.configManager.getConfig();

      // Runtime validation
      const runtimeValidation = await TatumConfig.validateRuntime();
      if (!runtimeValidation.valid) {
        throw new TatumConfigError(
          `Runtime validation failed: ${runtimeValidation.errors.join(', ')}`
        );
      }

      // Security settings validation
      const securityValidation = this.configManager.validateSecuritySettings();
      if (!securityValidation.isValid) {
        logger.warn('Security validation warnings', { warnings: securityValidation.warnings });
      }

      // Test connectivity (optional health check)
      if (config.debug) {
        await this.healthMonitor.performHealthCheck();
      }

      this.isInitialized = true;
      logger.info('Refactored Tatum client initialized successfully');

    } catch (error) {
      logger.error('Tatum client initialization failed', error as Error);
      throw error;
    }
  }

  /**
   * 基本的なHTTPリクエスト実行 - オーケストレーション層
   */
  async request<T = unknown>(config: TatumRequestConfig): Promise<TatumApiResponse<T>> {
    await this.ensureInitialized();

    const timer = logger.startTimer(`${config.method} ${config.endpoint}`);

    try {
      // Delegate to HTTP client with integrated protection
      const result = await this.httpClient.request<T>(config);

      // Record success metrics
      const duration = timer.end();
      this.metricsCollector.recordSuccess(duration);

      return result;

    } catch (error) {
      const duration = timer.elapsed();
      this.metricsCollector.recordError(error as Error, duration);

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
    return this.httpClient.get<T>(endpoint, params, config);
  }

  /**
   * POSTリクエスト
   */
  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.httpClient.post<T>(endpoint, body, config);
  }

  /**
   * PUTリクエスト
   */
  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.httpClient.put<T>(endpoint, body, config);
  }

  /**
   * DELETEリクエスト
   */
  async delete<T = unknown>(
    endpoint: string,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.httpClient.delete<T>(endpoint, config);
  }

  /**
   * ヘルスチェック - ヘルスモニターに委譲
   */
  async healthCheck(options?: { includeApiTest?: boolean; timeout?: number }): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    details: {
      api: boolean;
      rateLimiter: boolean;
      circuitBreaker: boolean;
    };
  }> {
    return this.healthMonitor.performHealthCheck(options);
  }

  /**
   * 簡易ヘルスチェック
   */
  getQuickHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    details: {
      api: boolean;
      rateLimiter: boolean;
      circuitBreaker: boolean;
    };
  } {
    return this.healthMonitor.getQuickHealthStatus();
  }

  /**
   * メトリクス取得 - メトリクスコレクターに委譲
   */
  getMetrics(): MetricsData {
    const rateLimiterStats = this.rateLimiter.getStats();
    const circuitBreakerStats = this.circuitBreaker.getStats();

    return this.metricsCollector.generateMetrics(
      {
        tokens: rateLimiterStats.state.tokens,
        requests: rateLimiterStats.state.tokens
      },
      {
        state: circuitBreakerStats.state.state,
        failures: circuitBreakerStats.state.failures
      }
    );
  }

  /**
   * メトリクス概要取得
   */
  getMetricsSummary(): {
    totalRequests: number;
    errorRate: number;
    averageResponseTime: number;
    uptime: string;
  } {
    return this.metricsCollector.getSummary();
  }

  /**
   * 設定更新 - 設定マネージャーに委譲
   */
  updateConfig(newConfig: Partial<TatumClientConfig>): {
    success: boolean;
    updatedFields: string[];
    errors: string[];
  } {
    return this.configManager.updateConfig(newConfig);
  }

  /**
   * セキュリティ設定更新
   */
  updateSecurityConfig(newSecurityConfig: Partial<SecurityConfig>): void {
    this.configManager.updateSecurityConfig(newSecurityConfig);
    // セキュリティハンドラーも更新
    this.secureHandler = TatumSecurityFactory.createSecureHandler(newSecurityConfig);
  }

  /**
   * セキュアなリクエスト処理
   */
  async processSecureRequest(request: {
    address: string;
    chain: string;
    network: string;
    asset: string;
    webhookUrl?: string;
  }): Promise<{
    address: string;
    chain: string;
    network: string;
    asset: string;
    webhookUrl?: string;
    apiKey: string;
  }> {
    const apiKey = await this.configManager.getSecureApiKey();

    return await this.secureHandler.processSecureRequest({
      ...request,
      apiKey
    });
  }

  /**
   * 現在の設定取得
   */
  getConfig(): Required<TatumClientConfig> {
    return this.configManager.getConfig();
  }

  /**
   * パフォーマンス推奨設定取得
   */
  getPerformanceRecommendations(): {
    category: string;
    recommendation: string;
    currentValue: unknown;
    recommendedValue: unknown;
  }[] {
    return this.configManager.getPerformanceRecommendations();
  }

  /**
   * セキュリティ状態取得
   */
  getSecurityStatus(): {
    apiKeyEncrypted: boolean;
    inputValidationEnabled: boolean;
    dataSanitizationEnabled: boolean;
    securityValidation: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
  } {
    const securityConfig = this.configManager.getSecurityConfig();
    const securityValidation = this.configManager.validateSecuritySettings();

    return {
      apiKeyEncrypted: securityConfig.enableApiKeyEncryption,
      inputValidationEnabled: securityConfig.enableInputValidation,
      dataSanitizationEnabled: securityConfig.enableDataSanitization,
      securityValidation
    };
  }

  /**
   * セキュリティ監査ログ
   */
  auditSecurityAction(action: string, details: Record<string, unknown>): void {
    this.secureHandler.auditLog(action, details);
  }

  /**
   * パフォーマンス統計取得
   */
  getPerformanceStats(): {
    http: Record<string, unknown>;
    rateLimiter: ReturnType<TatumRateLimiter['getStats']>;
    circuitBreaker: ReturnType<TatumCircuitBreaker['getStats']>;
    metrics: ReturnType<typeof this.getMetricsSummary>;
  } {
    return {
      http: this.httpClient.getPerformanceStats(),
      rateLimiter: this.rateLimiter.getStats(),
      circuitBreaker: this.circuitBreaker.getStats(),
      metrics: this.getMetricsSummary()
    };
  }

  /**
   * パフォーマンス最適化設定更新
   */
  updatePerformanceConfig(newPerformanceConfig: Partial<PerformanceConfig>): void {
    this.performanceConfig = {
      ...this.performanceConfig,
      ...newPerformanceConfig
    };

    this.httpClient.updatePerformanceConfig(this.performanceConfig);

    logger.info('Performance configuration updated', {
      connectionPool: newPerformanceConfig.enableConnectionPool,
      compression: newPerformanceConfig.enableCompression,
      caching: newPerformanceConfig.enableResponseCache
    });
  }

  /**
   * キャッシュクリア
   */
  clearPerformanceCache(): void {
    this.httpClient.clearCache();
    logger.info('Performance cache cleared');
  }

  /**
   * Chain mapping utilities
   */
  static mapUndefinedToTatum(
    chain: UndefinedChain,
    network: UndefinedNetwork,
    asset: UndefinedAsset
  ): SupportedChain {
    return TatumConfig.mapUndefinedToTatum(chain, network, asset);
  }

  static mapTatumToUndefined(tatumChain: SupportedChain): {
    chain: UndefinedChain;
    network: UndefinedNetwork;
    asset: UndefinedAsset;
  } {
    return TatumConfig.mapTatumToUndefined(tatumChain);
  }

  /**
   * リソース解放
   */
  destroy(): void {
    this.httpClient.destroy();
    this.healthMonitor.destroy();
    this.metricsCollector.reset();
    this.configManager.destroy();
    this.rateLimiter.destroy();
    this.isInitialized = false;

    logger.info('Refactored Tatum client with optimizations destroyed');
  }

  // ====================================
  // Private Implementation
  // ====================================

  private initializeComponents(): void {
    const config = this.configManager.getConfig();

    // Rate Limiter
    this.rateLimiter = rateLimiterManager.getLimiter('default', {
      tokensPerSecond: config.rateLimitPerSecond,
      bucketSize: config.rateLimitPerSecond * 2,
      initialTokens: config.rateLimitPerSecond
    });

    // Circuit Breaker
    this.circuitBreaker = circuitBreakerManager.getBreaker('default', {
      failureThreshold: config.circuitBreakerThreshold,
      recoveryTime: 60000, // 1 minute
      timeout: config.timeout,
      monitor: config.debug
    });

    // HTTP Client with protection layers and performance optimization
    this.httpClient = new TatumHttpClient(
      config,
      this.rateLimiter,
      this.circuitBreaker,
      this.performanceConfig
    );
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }
}

// ====================================
// Specialized Components
// ====================================
// ClientMetrics, HealthMonitor, ConfigManager are now in separate files

// ====================================
// Singleton Factory
// ====================================

export class TatumClientFactory {
  private static instances: Map<string, TatumClient> = new Map();

  /**
   * シングルトンクライアント取得
   */
  static getInstance(key = 'default', config?: Partial<TatumClientConfig>): TatumClient {
    if (!this.instances.has(key)) {
      const client = new TatumClient(config);
      this.instances.set(key, client);

      logger.info(`New Tatum client instance created: ${key}`);
    }

    return this.instances.get(key)!;
  }

  /**
   * クライアント削除
   */
  static destroyInstance(key = 'default'): boolean {
    const client = this.instances.get(key);
    if (client) {
      client.destroy();
      this.instances.delete(key);

      logger.info(`Tatum client instance destroyed: ${key}`);
      return true;
    }
    return false;
  }

  /**
   * 全クライアント削除
   */
  static destroyAll(): void {
    this.instances.forEach((client, key) => {
      client.destroy();
      logger.info(`Tatum client instance destroyed: ${key}`);
    });
    this.instances.clear();
  }

  /**
   * インスタンス一覧取得
   */
  static getInstanceKeys(): string[] {
    return Array.from(this.instances.keys());
  }
}

// ====================================
// Default Export
// ====================================

export const defaultTatumClient = TatumClientFactory.getInstance();