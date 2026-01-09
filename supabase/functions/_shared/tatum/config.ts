/**
 * Tatum API Configuration Management - Deno Native Implementation
 *
 * 環境設定管理とValidationシステム
 * Denoネイティブ環境変数処理
 */

// Deno type definitions for Supabase Edge Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  permissions?: {
    query(desc: { name: string }): Promise<{ state: string }>;
  };
};

import type {
  TatumClientConfig,
  RateLimiterConfig,
  CircuitBreakerConfig,
  LoggerConfig,
  LogLevel,
  ValidationResult,
  SupportedChain,
  UndefinedChain,
  UndefinedNetwork,
  UndefinedAsset
} from './types.ts';

// ====================================
// Default Configuration
// ====================================

export const DEFAULT_CONFIG: Required<TatumClientConfig> = {
  apiKey: '',
  baseUrl: 'https://api.tatum.io/v3',
  timeout: 30000,                    // 30秒
  maxRetries: 3,
  rateLimitPerSecond: 10,           // 1秒あたり10リクエスト
  circuitBreakerThreshold: 5,       // 5回失敗で回路開放
  debug: false
} as const;

export const DEFAULT_RATE_LIMITER: Required<RateLimiterConfig> = {
  tokensPerSecond: 10,
  bucketSize: 20,
  initialTokens: 20
} as const;

export const DEFAULT_CIRCUIT_BREAKER: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  recoveryTime: 60000,              // 1分
  timeout: 30000,                   // 30秒
  monitor: true
} as const;

export const DEFAULT_LOGGER: Required<LoggerConfig> = {
  level: 'info' as LogLevel,
  enableConsole: true,
  enableStructured: true,
  includeStack: false
} as const;

// ====================================
// Environment Configuration
// ====================================

export class TatumConfig {
  private static instance: TatumConfig;
  private config: Required<TatumClientConfig>;
  private rateLimiter: Required<RateLimiterConfig>;
  private circuitBreaker: Required<CircuitBreakerConfig>;
  private logger: Required<LoggerConfig>;

  private constructor() {
    this.config = this.loadClientConfig();
    this.rateLimiter = this.loadRateLimiterConfig();
    this.circuitBreaker = this.loadCircuitBreakerConfig();
    this.logger = this.loadLoggerConfig();

    this.validateConfig();
  }

  static getInstance(): TatumConfig {
    if (!TatumConfig.instance) {
      TatumConfig.instance = new TatumConfig();
    }
    return TatumConfig.instance;
  }

  // ====================================
  // Configuration Loaders
  // ====================================

  private loadClientConfig(): Required<TatumClientConfig> {
    return {
      apiKey: this.getRequiredEnv('TATUM_API_KEY'),
      baseUrl: this.getEnv('TATUM_BASE_URL', DEFAULT_CONFIG.baseUrl),
      timeout: parseInt(this.getEnv('TATUM_TIMEOUT', String(DEFAULT_CONFIG.timeout)), 10),
      maxRetries: parseInt(this.getEnv('TATUM_MAX_RETRIES', String(DEFAULT_CONFIG.maxRetries)), 10),
      rateLimitPerSecond: parseInt(this.getEnv('TATUM_RATE_LIMIT', String(DEFAULT_CONFIG.rateLimitPerSecond)), 10),
      circuitBreakerThreshold: parseInt(this.getEnv('TATUM_CB_THRESHOLD', String(DEFAULT_CONFIG.circuitBreakerThreshold)), 10),
      debug: this.getEnv('TATUM_DEBUG', 'false').toLowerCase() === 'true'
    };
  }

  private loadRateLimiterConfig(): Required<RateLimiterConfig> {
    return {
      tokensPerSecond: parseInt(this.getEnv('TATUM_RL_TOKENS_PER_SEC', String(DEFAULT_RATE_LIMITER.tokensPerSecond)), 10),
      bucketSize: parseInt(this.getEnv('TATUM_RL_BUCKET_SIZE', String(DEFAULT_RATE_LIMITER.bucketSize)), 10),
      initialTokens: parseInt(this.getEnv('TATUM_RL_INITIAL_TOKENS', String(DEFAULT_RATE_LIMITER.initialTokens)), 10)
    };
  }

  private loadCircuitBreakerConfig(): Required<CircuitBreakerConfig> {
    return {
      failureThreshold: parseInt(this.getEnv('TATUM_CB_FAILURE_THRESHOLD', String(DEFAULT_CIRCUIT_BREAKER.failureThreshold)), 10),
      recoveryTime: parseInt(this.getEnv('TATUM_CB_RECOVERY_TIME', String(DEFAULT_CIRCUIT_BREAKER.recoveryTime)), 10),
      timeout: parseInt(this.getEnv('TATUM_CB_TIMEOUT', String(DEFAULT_CIRCUIT_BREAKER.timeout)), 10),
      monitor: this.getEnv('TATUM_CB_MONITOR', 'true').toLowerCase() === 'true'
    };
  }

  private loadLoggerConfig(): Required<LoggerConfig> {
    const level = this.getEnv('TATUM_LOG_LEVEL', DEFAULT_LOGGER.level);
    return {
      level: this.isValidLogLevel(level) ? level : DEFAULT_LOGGER.level,
      enableConsole: this.getEnv('TATUM_LOG_CONSOLE', 'true').toLowerCase() === 'true',
      enableStructured: this.getEnv('TATUM_LOG_STRUCTURED', 'true').toLowerCase() === 'true',
      includeStack: this.getEnv('TATUM_LOG_STACK', 'false').toLowerCase() === 'true'
    };
  }

  // ====================================
  // Environment Utilities
  // ====================================

  private getEnv(key: string, defaultValue?: string): string {
    const value = Deno.env.get(key);
    if (value === undefined) {
      if (defaultValue === undefined) {
        throw new Error(`Required environment variable ${key} is not set`);
      }
      return defaultValue;
    }
    return value;
  }

  private getRequiredEnv(key: string): string {
    const value = Deno.env.get(key);
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  // ====================================
  // Validation
  // ====================================

  private validateConfig(): void {
    const errors: string[] = [];

    // API Key validation
    if (!this.config.apiKey || this.config.apiKey.length < 10) {
      errors.push('TATUM_API_KEY must be a valid API key (at least 10 characters)');
    }

    // Timeout validation
    if (this.config.timeout < 1000 || this.config.timeout > 300000) {
      errors.push('TATUM_TIMEOUT must be between 1000ms and 300000ms (5 minutes)');
    }

    // Rate limiter validation
    if (this.rateLimiter.tokensPerSecond < 1 || this.rateLimiter.tokensPerSecond > 1000) {
      errors.push('TATUM_RL_TOKENS_PER_SEC must be between 1 and 1000');
    }

    if (this.rateLimiter.bucketSize < this.rateLimiter.tokensPerSecond) {
      errors.push('TATUM_RL_BUCKET_SIZE must be at least equal to tokensPerSecond');
    }

    // Circuit breaker validation
    if (this.circuitBreaker.failureThreshold < 1 || this.circuitBreaker.failureThreshold > 100) {
      errors.push('TATUM_CB_FAILURE_THRESHOLD must be between 1 and 100');
    }

    if (this.circuitBreaker.recoveryTime < 5000 || this.circuitBreaker.recoveryTime > 3600000) {
      errors.push('TATUM_CB_RECOVERY_TIME must be between 5000ms and 3600000ms (1 hour)');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  private isValidLogLevel(level: string): level is LogLevel {
    return ['debug', 'info', 'warn', 'error'].includes(level);
  }

  // ====================================
  // Public Getters
  // ====================================

  getClientConfig(): Required<TatumClientConfig> {
    return { ...this.config };
  }

  getRateLimiterConfig(): Required<RateLimiterConfig> {
    return { ...this.rateLimiter };
  }

  getCircuitBreakerConfig(): Required<CircuitBreakerConfig> {
    return { ...this.circuitBreaker };
  }

  getLoggerConfig(): Required<LoggerConfig> {
    return { ...this.logger };
  }

  // ====================================
  // Chain Mapping
  // ====================================

  static mapUndefinedToTatum(
    chain: UndefinedChain,
    network: UndefinedNetwork,
    asset: UndefinedAsset
  ): SupportedChain {
    const mapping: Record<string, SupportedChain> = {
      // Ethereum
      'evm:ethereum:ETH': 'ETH',
      'evm:ethereum:USDT': 'ETH',
      'evm:sepolia:ETH': 'ETH_SEPOLIA',
      'evm:sepolia:USDT': 'ETH_SEPOLIA',

      // Bitcoin
      'btc:mainnet:BTC': 'BTC',
      'btc:testnet:BTC': 'BTC_TESTNET',

      // Tron
      'trc:mainnet:TRX': 'TRX',
      'trc:mainnet:USDT': 'TRX',
      'trc:nile:TRX': 'TRX_SHASTA',
      'trc:nile:USDT': 'TRX_SHASTA',

      // XRP
      'xrp:mainnet:XRP': 'XRP',
      'xrp:testnet:XRP': 'XRP_TESTNET',

      // Cardano
      'ada:mainnet:ADA': 'ADA'
    };

    const key = `${chain}:${network}:${asset}`;
    const tatumChain = mapping[key];

    if (!tatumChain) {
      throw new Error(`Unsupported chain combination: ${key}`);
    }

    return tatumChain;
  }

  static mapTatumToUndefined(tatumChain: SupportedChain): {
    chain: UndefinedChain;
    network: UndefinedNetwork;
    asset: UndefinedAsset;
  } {
    const mapping: Record<SupportedChain, { chain: UndefinedChain; network: UndefinedNetwork; asset: UndefinedAsset }> = {
      'ETH': { chain: 'evm', network: 'ethereum', asset: 'ETH' },
      'ETH_SEPOLIA': { chain: 'evm', network: 'sepolia', asset: 'ETH' },
      'BTC': { chain: 'btc', network: 'mainnet', asset: 'BTC' },
      'BTC_TESTNET': { chain: 'btc', network: 'testnet', asset: 'BTC' },
      'TRX': { chain: 'trc', network: 'mainnet', asset: 'TRX' },
      'TRX_SHASTA': { chain: 'trc', network: 'nile', asset: 'TRX' },
      'XRP': { chain: 'xrp', network: 'mainnet', asset: 'XRP' },
      'XRP_TESTNET': { chain: 'xrp', network: 'testnet', asset: 'XRP' },
      'ADA': { chain: 'ada', network: 'mainnet', asset: 'ADA' }
    };

    const undefinedMapping = mapping[tatumChain];
    if (!undefinedMapping) {
      throw new Error(`Unsupported Tatum chain: ${tatumChain}`);
    }

    return undefinedMapping;
  }

  // ====================================
  // Runtime Configuration Validation
  // ====================================

  static async validateRuntime(): Promise<ValidationResult> {
    const errors: string[] = [];

    try {
      // Check required environment variables
      if (!Deno.env.get('TATUM_API_KEY')) {
        errors.push('TATUM_API_KEY environment variable is required');
      }

      // Check Deno permissions
      const permissions = [
        { name: 'net', desc: 'network access for API calls' },
        { name: 'env', desc: 'environment variable access' }
      ];

      for (const perm of permissions) {
        try {
          // Skip runtime validation in environments without Deno.permissions
          if (!Deno.permissions) {
            continue;
          }
          const status = await Deno.permissions.query({ name: perm.name as 'net' | 'env' });
          if (status.state !== 'granted') {
            errors.push(`Missing required permission: ${perm.name} (${perm.desc})`);
          }
        } catch {
          errors.push(`Cannot check permission: ${perm.name}`);
        }
      }

      // Check Web APIs availability
      if (typeof fetch === 'undefined') {
        errors.push('fetch API is not available');
      }

      if (typeof AbortController === 'undefined') {
        errors.push('AbortController is not available');
      }

      if (typeof URL === 'undefined') {
        errors.push('URL API is not available');
      }

    } catch (error) {
      errors.push(`Runtime validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// ====================================
// Singleton Export
// ====================================

export const tatumConfig = TatumConfig.getInstance();