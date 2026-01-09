/**
 * Tatum Configuration Manager - リファクタリング版
 *
 * 設定管理・検証に特化したクラス
 * 単一責任原則に基づく設計
 */

// Deno環境での型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import type { TatumClientConfig } from './types.ts';
import { TatumConfigError } from './errors.ts';
import { TatumRateLimiter } from './rate-limiter.ts';
import { TatumCircuitBreaker } from './circuit-breaker.ts';
import { logger } from './logger.ts';
import { TatumKeyManager, TatumSecurityFactory, type SecurityConfig } from './security.ts';

// ====================================
// 設定管理専用クラス
// ====================================

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigUpdateResult {
  success: boolean;
  updatedFields: string[];
  errors: string[];
}

export class TatumConfigManager {
  private config: Required<TatumClientConfig>;
  private rateLimiter?: TatumRateLimiter;
  private circuitBreaker?: TatumCircuitBreaker;
  private keyManager: TatumKeyManager;
  private securityConfig: SecurityConfig;

  constructor(initialConfig: Required<TatumClientConfig>, securityConfig?: Partial<SecurityConfig>) {
    this.config = { ...initialConfig };

    // セキュリティ設定の初期化
    this.securityConfig = {
      enableApiKeyEncryption: true,
      enableInputValidation: true,
      enableDataSanitization: true,
      allowedOrigins: [],
      maxRequestSize: 1024 * 1024,
      rateLimitBypassTokens: [],
      encryptionKey: Deno.env.get('TATUM_ENCRYPTION_KEY'),
      ...securityConfig
    };

    this.keyManager = TatumSecurityFactory.createKeyManager(this.securityConfig);

    const validation = this.validateConfig(); // 初期設定を検証
    if (!validation.isValid) {
      throw new TatumConfigError(
        `Configuration validation failed: ${validation.errors.join(', ')}`
      );
    }

    if (validation.warnings.length > 0) {
      logger.warn('Configuration warnings', {
        warnings: validation.warnings
      });
    }

    logger.info('TatumConfigManager initialized with security features', {
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      securityEnabled: this.securityConfig.enableInputValidation
    });
  }

  /**
   * 現在の設定取得
   */
  getConfig(): Required<TatumClientConfig> {
    return { ...this.config };
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<TatumClientConfig>): ConfigUpdateResult {
    const result: ConfigUpdateResult = {
      success: false,
      updatedFields: [],
      errors: []
    };

    try {
      const oldConfig = { ...this.config };
      const mergedConfig = { ...this.config, ...newConfig };

      // 更新前の検証
      const validation = this.validateConfigObject(mergedConfig);
      if (!validation.isValid) {
        result.errors = validation.errors;
        return result;
      }

      // 更新された項目の追跡
      const updatedFields = this.getUpdatedFields(oldConfig, mergedConfig);

      // 設定更新
      this.config = mergedConfig;
      result.updatedFields = updatedFields;

      // コンポーネント設定の協調更新
      this.updateComponentConfigs(newConfig);

      result.success = true;

      logger.info('Configuration updated successfully', {
        oldConfig,
        newConfig: this.config,
        updatedFields
      });

    } catch (error) {
      const errorMessage = (error as Error).message;
      result.errors.push(errorMessage);

      logger.error('Configuration update failed', error as Error);
    }

    return result;
  }

  /**
   * 設定検証
   */
  validateConfig(): ConfigValidationResult {
    return this.validateConfigObject(this.config);
  }

  /**
   * 設定オブジェクトの検証
   */
  validateConfigObject(config: Required<TatumClientConfig>): ConfigValidationResult {
    const result: ConfigValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // API Key検証
    if (!config.apiKey || config.apiKey.length < 10) {
      result.errors.push('API key must be at least 10 characters long');
    }

    if (config.apiKey && config.apiKey.startsWith('test_')) {
      result.warnings.push('Using test API key in configuration');
    }

    // Timeout検証
    if (config.timeout < 1000 || config.timeout > 300000) {
      result.errors.push('Timeout must be between 1000ms and 300000ms');
    }

    if (config.timeout < 5000) {
      result.warnings.push('Timeout below 5000ms may cause frequent failures');
    }

    // Retry設定検証
    if (config.maxRetries < 0 || config.maxRetries > 10) {
      result.errors.push('Max retries must be between 0 and 10');
    }

    // Rate Limit設定検証
    if (config.rateLimitPerSecond < 1 || config.rateLimitPerSecond > 1000) {
      result.errors.push('Rate limit must be between 1 and 1000 requests per second');
    }

    // Circuit Breaker設定検証
    if (config.circuitBreakerThreshold < 1 || config.circuitBreakerThreshold > 100) {
      result.errors.push('Circuit breaker threshold must be between 1 and 100');
    }

    // Base URL検証
    if (!config.baseUrl || !this.isValidUrl(config.baseUrl)) {
      result.errors.push('Base URL must be a valid HTTP/HTTPS URL');
    }

    result.isValid = result.errors.length === 0;

    return result;
  }

  /**
   * コンポーネント参照の設定
   */
  setComponents(rateLimiter: TatumRateLimiter, circuitBreaker: TatumCircuitBreaker): void {
    this.rateLimiter = rateLimiter;
    this.circuitBreaker = circuitBreaker;

    logger.debug('Components set for configuration management');
  }

  /**
   * セキュリティ強化検証
   */
  validateSecuritySettings(): ConfigValidationResult {
    const result: ConfigValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // API Key検証（セキュリティモジュール使用）
    if (!this.keyManager.validateApiKey(this.config.apiKey)) {
      result.errors.push('API key format is invalid or insecure');
    }

    // API Key強度検証
    if (this.config.apiKey.length < 32) {
      result.warnings.push('API key should be at least 32 characters for better security');
    }

    // HTTPS使用確認
    if (!this.config.baseUrl.startsWith('https://')) {
      result.errors.push('Base URL should use HTTPS for secure communication');
    }

    // Debug設定確認
    if (this.config.debug) {
      result.warnings.push('Debug mode is enabled - disable in production');
    }

    // 暗号化設定確認
    if (this.securityConfig.enableApiKeyEncryption && !this.securityConfig.encryptionKey) {
      result.errors.push('Encryption key is required when API key encryption is enabled');
    }

    // セキュリティ機能の有効性確認
    if (!this.securityConfig.enableInputValidation) {
      result.warnings.push('Input validation is disabled - consider enabling for security');
    }

    result.isValid = result.errors.length === 0;

    return result;
  }

  /**
   * セキュアなAPI Key取得（復号化）
   */
  async getSecureApiKey(): Promise<string> {
    return await this.keyManager.decryptApiKey(this.config.apiKey);
  }

  /**
   * API Keyの暗号化保存
   */
  async setSecureApiKey(apiKey: string): Promise<void> {
    const encryptedKey = await this.keyManager.encryptApiKey(apiKey);
    this.config.apiKey = encryptedKey;

    logger.info('API key encrypted and stored securely');
  }

  /**
   * セキュリティ設定取得
   */
  getSecurityConfig(): SecurityConfig {
    return { ...this.securityConfig };
  }

  /**
   * セキュリティ設定更新
   */
  updateSecurityConfig(newSecurityConfig: Partial<SecurityConfig>): void {
    this.securityConfig = {
      ...this.securityConfig,
      ...newSecurityConfig
    };

    // 新しい設定でキーマネージャーを再初期化
    this.keyManager = TatumSecurityFactory.createKeyManager(this.securityConfig);

    logger.info('Security configuration updated', {
      enableApiKeyEncryption: this.securityConfig.enableApiKeyEncryption,
      enableInputValidation: this.securityConfig.enableInputValidation,
      enableDataSanitization: this.securityConfig.enableDataSanitization
    });
  }

  /**
   * パフォーマンス設定の最適化推奨
   */
  getPerformanceRecommendations(): {
    category: string;
    recommendation: string;
    currentValue: unknown;
    recommendedValue: unknown;
  }[] {
    const recommendations: {
      category: string;
      recommendation: string;
      currentValue: unknown;
      recommendedValue: unknown;
    }[] = [];

    // Timeout最適化
    if (this.config.timeout > 30000) {
      recommendations.push({
        category: 'timeout',
        recommendation: 'Consider reducing timeout for better responsiveness',
        currentValue: this.config.timeout,
        recommendedValue: 15000
      });
    }

    // Rate Limit最適化
    if (this.config.rateLimitPerSecond < 10) {
      recommendations.push({
        category: 'rateLimit',
        recommendation: 'Consider increasing rate limit for better throughput',
        currentValue: this.config.rateLimitPerSecond,
        recommendedValue: 25
      });
    }

    // Retry設定最適化
    if (this.config.maxRetries > 5) {
      recommendations.push({
        category: 'retries',
        recommendation: 'Consider reducing max retries to fail faster',
        currentValue: this.config.maxRetries,
        recommendedValue: 3
      });
    }

    return recommendations;
  }

  /**
   * 設定エクスポート（セキュアAPI Key除外）
   */
  exportConfig(includeSensitive = false): {
    config: Required<TatumClientConfig>;
    securityConfig?: SecurityConfig;
    exportTime: string;
    version: string;
  } {
    const config = this.getConfig();

    // センシティブ情報の除外
    if (!includeSensitive) {
      config.apiKey = this.maskSensitiveData(config.apiKey);
    }

    const result: {
      config: Required<TatumClientConfig>;
      securityConfig?: SecurityConfig;
      exportTime: string;
      version: string;
    } = {
      config,
      exportTime: new Date().toISOString(),
      version: '2.0.0'
    };

    if (includeSensitive) {
      result.securityConfig = this.getSecurityConfig();
    }

    return result;
  }

  private maskSensitiveData(data: string): string {
    if (data.length <= 8) {
      return '*'.repeat(data.length);
    }
    return data.substring(0, 4) + '*'.repeat(data.length - 8) + data.substring(data.length - 4);
  }

  /**
   * リソース解放
   */
  destroy(): void {
    this.rateLimiter = undefined;
    this.circuitBreaker = undefined;

    logger.info('TatumConfigManager destroyed');
  }

  // ====================================
  // Private Implementation
  // ====================================

  private updateComponentConfigs(newConfig: Partial<TatumClientConfig>): void {
    // Rate Limiter設定更新
    if (newConfig.rateLimitPerSecond && this.rateLimiter) {
      this.rateLimiter.updateConfig({
        tokensPerSecond: newConfig.rateLimitPerSecond
      });
    }

    // Circuit Breaker設定更新
    if (newConfig.circuitBreakerThreshold && this.circuitBreaker) {
      this.circuitBreaker.updateConfig({
        failureThreshold: newConfig.circuitBreakerThreshold
      });
    }
  }

  private getUpdatedFields(
    oldConfig: Required<TatumClientConfig>,
    newConfig: Required<TatumClientConfig>
  ): string[] {
    const updatedFields: string[] = [];

    for (const key of Object.keys(newConfig) as Array<keyof TatumClientConfig>) {
      if (oldConfig[key] !== newConfig[key]) {
        updatedFields.push(key);
      }
    }

    return updatedFields;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }
}