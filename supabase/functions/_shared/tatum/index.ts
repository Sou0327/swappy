/**
 * Tatum API Library - Refactored Architecture
 *
 * 完全なDenoネイティブTatum API統合ライブラリ
 * Enterprise-grade features with refactored architecture
 *
 * @version 2.0.0
 * @author Swappy Development Team
 */

// ====================================
// Core Exports
// ====================================

// Types
export * from './types.ts';

// Configuration
export { tatumConfig, TatumConfig } from './config.ts';

// Errors (exclude TatumApiError interface to avoid conflict with class)
export {
  TatumError,
  TatumApiError,
  TatumNetworkError,
  TatumTimeoutError,
  TatumConfigError,
  TatumRateLimitError,
  TatumCircuitBreakerError,
  TatumValidationError,
  TatumResponseError,
  TatumErrorHandler,
  TatumErrorFactory
} from './errors.ts';

// Logging
export { logger, RequestIdGenerator } from './logger.ts';

// HTTP Utilities
export {
  RetryManager,
  UrlUtils,
  JsonUtils,
  ValidationUtils,
  TimeUtils
} from './utils.ts';

// Specialized Components (Refactored Architecture)
export { TatumHttpClient } from './http-client.ts';
export { TatumMetricsCollector } from './metrics-collector.ts';
export { TatumHealthMonitor } from './health-monitor.ts';
export { TatumConfigManager } from './config-manager.ts';

// Security Components
export {
  TatumKeyManager,
  TatumInputValidator,
  TatumSecureRequestHandler,
  TatumSecurityFactory,
  defaultSecurityConfig
} from './security.ts';
export type { SecurityConfig } from './security.ts';

// Performance Components
export {
  TatumConnectionPool,
  TatumCompressionHandler,
  TatumResponseCache,
  TatumRequestBatcher,
  TatumPerformanceManager,
  defaultPerformanceConfig
} from './performance.ts';
export type { PerformanceConfig } from './performance.ts';

// Rate Limiting
export {
  TatumRateLimiter,
  AdaptiveRateLimiter,
  RateLimiterManager,
  rateLimiterManager
} from './rate-limiter.ts';

// Circuit Breaker
export {
  TatumCircuitBreaker,
  CircuitBreakerManager,
  CompositeCircuitBreaker,
  circuitBreakerManager
} from './circuit-breaker.ts';

// Main Client
export { TatumClient, TatumClientFactory, defaultTatumClient } from './client.ts';

// Subscription Management
export { TatumSubscriptionManager, SubscriptionHelpers } from './subscriptions.ts';

// Import TatumClient and TatumSubscriptionManager for internal use
import { TatumClient } from './client.ts';
import { TatumSubscriptionManager } from './subscriptions.ts';

// Deno globals declaration for Edge Functions environment
declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
  };
}

// ====================================
// Convenience Factory
// ====================================

export class TatumAPIFactory {
  /**
   * 完全機能付きTatum APIクライアント作成
   */
  static createClient(config?: {
    apiKey?: string;
    baseUrl?: string;
    timeout?: number;
    rateLimitPerSecond?: number;
    debug?: boolean;
  }) {
    const client = new TatumClient(config);
    const subscriptions = new TatumSubscriptionManager(client);

    return {
      client,
      subscriptions,

      // Convenience methods
      async initialize() {
        await client.initialize();
        return this;
      },

      async healthCheck() {
        return client.healthCheck();
      },

      getMetrics() {
        return client.getMetrics();
      },

      destroy() {
        client.destroy();
      }
    };
  }

  /**
   * 既存Edge Function互換クライアント作成
   */
  static createCompatibilityClient() {
    const apiKey = Deno.env.get('TATUM_API_KEY');
    const webhookUrl = Deno.env.get('TATUM_WEBHOOK_URL');

    if (!apiKey) {
      throw new Error('TATUM_API_KEY environment variable is required');
    }

    const tatumAPI = TatumAPIFactory.createClient({ apiKey });

    return {
      ...tatumAPI,

      /**
       * tatum-subscription-ensure互換インターフェース
       */
      async ensureSubscription(params: {
        address: string;
        chain: string;
        network: string;
        asset: string;
      }) {
        // Undefined形式をサポート
        return tatumAPI.subscriptions.ensureSubscription({
          address: params.address,
          chain: params.chain as import('./types.ts').UndefinedChain,
          network: params.network as import('./types.ts').UndefinedNetwork,
          asset: params.asset as import('./types.ts').UndefinedAsset,
          webhookUrl
        });
      }
    };
  }
}

// ====================================
// Quick Start Examples
// ====================================

/**
 * Quick Start Example 1: 基本的なサブスクリプション作成
 */
export async function quickStartBasicSubscription() {
  const tatumAPI = TatumAPIFactory.createClient();
  await tatumAPI.initialize();

  try {
    const result = await tatumAPI.subscriptions.createUndefinedSubscription(
      '0x1234567890123456789012345678901234567890', // address
      'evm',      // chain
      'ethereum', // network
      'ETH',      // asset
      'https://your-webhook.com/tatum-webhook' // webhook URL
    );

    if ('data' in result) {
      console.log('Subscription created:', result.data);
      return result.data;
    } else {
      throw new Error('Subscription creation failed');
    }

  } finally {
    tatumAPI.destroy();
  }
}

/**
 * Quick Start Example 2: 既存システム互換性
 */
export async function quickStartCompatibility() {
  const tatumAPI = TatumAPIFactory.createCompatibilityClient();
  await tatumAPI.initialize();

  try {
    // 既存のtatum-subscription-ensureと同じインターフェース
    const result = await tatumAPI.ensureSubscription({
      address: '0x1234567890123456789012345678901234567890',
      chain: 'evm',
      network: 'ethereum',
      asset: 'ETH'
    });

    console.log('Subscription ensured:', result);
    return result;

  } finally {
    tatumAPI.destroy();
  }
}

/**
 * Quick Start Example 3: 高度な機能使用
 */
export async function quickStartAdvanced() {
  const tatumAPI = TatumAPIFactory.createClient({
    debug: true,
    rateLimitPerSecond: 20,
    timeout: 15000
  });

  await tatumAPI.initialize();

  try {
    // ヘルスチェック
    const health = await tatumAPI.healthCheck();
    console.log('Health status:', health.status);

    // バッチサブスクリプション作成
    const requests = [
      {
        type: 'ADDRESS_TRANSACTION' as const,
        attr: {
          address: '0x1111111111111111111111111111111111111111',
          chain: 'ETH' as const,
          url: 'https://webhook.com/eth'
        }
      },
      {
        type: 'ADDRESS_TRANSACTION' as const,
        attr: {
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          chain: 'BTC' as const,
          url: 'https://webhook.com/btc'
        }
      }
    ];

    const batchResult = await tatumAPI.subscriptions.createBatchSubscriptions(requests);
    console.log('Batch created:', batchResult.successful.length, 'successful');

    // メトリクス確認
    const metrics = tatumAPI.getMetrics();
    console.log('API Metrics:', metrics);

    return batchResult;

  } finally {
    tatumAPI.destroy();
  }
}

// ====================================
// Edge Function Integration Helper
// ====================================

/**
 * Supabase Edge Function統合ヘルパー
 */
export class EdgeFunctionHelper {
  static createTatumHandler() {
    const tatumAPI = TatumAPIFactory.createCompatibilityClient();

    return {
      /**
       * Edge Function handlersでの使用例
       */
      async handleRequest(req: Request): Promise<Response> {
        const corsHeaders = {
          'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || 'http://localhost:8080',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Max-Age': '86400',
        };

        if (req.method === 'OPTIONS') {
          return new Response(null, { status: 200, headers: corsHeaders });
        }

        if (req.method === 'GET') {
          const health = await tatumAPI.healthCheck();
          return new Response(JSON.stringify(health), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        if (req.method === 'POST') {
          try {
            await tatumAPI.initialize();
            const body = await req.json();

            const result = await tatumAPI.ensureSubscription(body);

            return new Response(JSON.stringify({
              success: true,
              data: result
            }), {
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });

          } catch (error) {
            console.error('Tatum API error:', error);

            return new Response(JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
        }

        return new Response('Method not allowed', {
          status: 405,
          headers: corsHeaders
        });
      }
    };
  }

  /**
   * 既存Edge Functionマイグレーションヘルパー
   */
  static async migrateExistingFunction(existingHandler: (req: Request) => Promise<Response>) {
    const newHandler = EdgeFunctionHelper.createTatumHandler();

    return async (req: Request): Promise<Response> => {
      try {
        // 新しいTatum APIライブラリを試行
        return await newHandler.handleRequest(req);
      } catch (error) {
        console.warn('New Tatum API failed, falling back to existing implementation:', error);
        // フォールバック
        return await existingHandler(req);
      }
    };
  }
}

// ====================================
// Default Instance
// ====================================

/**
 * デフォルトTatum APIインスタンス（シングルトン）
 */
export const defaultTatumAPI = TatumAPIFactory.createCompatibilityClient();

// ====================================
// Library Information
// ====================================

export const LIBRARY_INFO = {
  name: 'Undefined Tatum API Library',
  version: '2.0.0',
  description: 'Complete Deno native Tatum API integration with refactored enterprise architecture',
  features: [
    'Type-safe TypeScript implementation',
    'Single Responsibility Principle architecture',
    'Dependency injection pattern',
    'Rate limiting with token bucket algorithm',
    'Circuit breaker pattern for resilience',
    'Structured logging with performance metrics',
    'Comprehensive error handling',
    'Undefined chain mapping support',
    'Batch operations',
    'Health monitoring with alerting',
    'Configuration management with validation',
    'Specialized component architecture',
    'Supabase Edge Runtime optimized'
  ],
  architecture: {
    pattern: 'Orchestration Layer with Specialized Components',
    components: [
      'TatumClient (Orchestration)',
      'TatumHttpClient (HTTP Operations)',
      'TatumMetricsCollector (Performance Analytics)',
      'TatumHealthMonitor (System Health)',
      'TatumConfigManager (Configuration Management)'
    ]
  },
  compatibility: {
    deno: '>=1.30.0',
    supabase: 'Edge Runtime',
    runtimes: ['Deno', 'Supabase Edge Functions']
  }
} as const;