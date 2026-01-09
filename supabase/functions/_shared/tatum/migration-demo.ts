/**
 * Tatum API Migration Demo - 既存Edge Function統合ガイド
 *
 * 既存システムから新しいDenoネイティブTatum APIライブラリへの
 * 段階的移行方法とデモンストレーション
 */

// Deno型定義（Supabase Edge Functions環境用）
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { TatumAPIFactory, EdgeFunctionHelper, defaultTatumAPI } from './index.ts';
import type { UndefinedChain, UndefinedNetwork, UndefinedAsset } from './types.ts';

// ====================================
// 既存システム（Before）
// ====================================

/**
 * 既存のtatum-subscription-ensure実装（参考）
 */
function createLegacyTatumHandler() {
  const TATUM_API_KEY = Deno.env.get('TATUM_API_KEY');
  const TATUM_WEBHOOK_URL = Deno.env.get('TATUM_WEBHOOK_URL');

  async function createTatumSubscription(address: string, chain: string, network: string, asset: string) {
    if (!TATUM_API_KEY || !TATUM_WEBHOOK_URL) {
      throw new Error('Tatum API credentials not configured');
    }

    const tatumApiUrl = 'https://api.tatum.io/v3/subscription';
    const requestBody = {
      type: 'ADDRESS_TRANSACTION',
      attr: {
        address: address,
        chain: getChainForTatum(chain, network),
        url: TATUM_WEBHOOK_URL
      }
    };

    const response = await fetch(tatumApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TATUM_API_KEY
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tatum API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return {
      subscriptionId: result.id,
      address: address,
      chain: chain,
      network: network,
      asset: asset,
      status: 'active',
      created: new Date().toISOString(),
      provider: 'tatum'
    };
  }

  function getChainForTatum(chain: string, network: string): string {
    const chainMapping: Record<string, Record<string, string>> = {
      'evm': { 'ethereum': 'ETH', 'sepolia': 'ETH_SEPOLIA' },
      'btc': { 'mainnet': 'BTC', 'testnet': 'BTC_TESTNET' },
      'xrp': { 'mainnet': 'XRP', 'testnet': 'XRP_TESTNET' }
    };
    return chainMapping[chain]?.[network] || 'ETH';
  }

  return { createTatumSubscription };
}

// ====================================
// 新システム（After）
// ====================================

/**
 * 新しいDenoネイティブTatum APIライブラリ使用例
 */
async function createModernTatumHandler() {
  const tatumAPI = TatumAPIFactory.createCompatibilityClient();
  await tatumAPI.initialize();

  return {
    async ensureSubscription(params: {
      address: string;
      chain: string;
      network: string;
      asset: string;
    }) {
      return tatumAPI.subscriptions.ensureSubscription({
        ...params,
        chain: params.chain as UndefinedChain,
        network: params.network as UndefinedNetwork,
        asset: params.asset as UndefinedAsset
      });
    },

    async getHealthStatus() {
      return tatumAPI.healthCheck();
    },

    async getMetrics() {
      return tatumAPI.getMetrics();
    },

    destroy() {
      tatumAPI.destroy();
    }
  };
}

// ====================================
// Migration Strategies
// ====================================

/**
 * 戦略1: 段階的移行（推奨）
 * 既存機能を保持しながら新機能を段階的に導入
 */
export function createPhasegedMigrationHandler() {
  return async (req: Request): Promise<Response> => {
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
      try {
        // 新しいライブラリのヘルスチェック機能を使用
        const modernHandler = await createModernTatumHandler();
        const health = await modernHandler.getHealthStatus();

        return new Response(JSON.stringify({
          status: 'migration-demo',
          library: 'modern-tatum-api',
          health,
          features: ['rate-limiting', 'circuit-breaker', 'metrics', 'structured-logging']
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          status: 'fallback-to-legacy',
          error: error instanceof Error ? error.message : String(error)
        }), {
          status: 200, // Graceful degradation
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        const { address, chain, network, asset } = body;

        // Phase 1: 新しいライブラリを試行
        try {
          const modernHandler = await createModernTatumHandler();
          const result = await modernHandler.ensureSubscription({ address, chain, network, asset });

          return new Response(JSON.stringify({
            success: true,
            data: result,
            implementation: 'modern-tatum-api',
            features_used: ['rate-limiting', 'error-handling', 'circuit-breaker']
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        } catch (modernError) {
          console.warn('Modern Tatum API failed, falling back to legacy:', modernError);

          // Phase 2: レガシー実装にフォールバック
          const legacyHandler = createLegacyTatumHandler();
          const result = await legacyHandler.createTatumSubscription(address, chain, network, asset);

          return new Response(JSON.stringify({
            success: true,
            data: result,
            implementation: 'legacy-fallback',
            warning: 'Modern implementation failed, used legacy fallback'
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

      } catch (error) {
        console.error('Both modern and legacy implementations failed:', error);

        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          implementation: 'none'
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
  };
}

/**
 * 戦略2: 完全切り替え
 * 新しいライブラリに完全移行
 */
export function createFullMigrationHandler() {
  const edgeHelper = EdgeFunctionHelper.createTatumHandler();

  return async (req: Request): Promise<Response> => {
    try {
      return await edgeHelper.handleRequest(req);
    } catch (error) {
      console.error('Modern Tatum API error:', error);

      const corsHeaders = {
        'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || 'http://localhost:8080',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      };

      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        implementation: 'modern-tatum-api'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  };
}

/**
 * 戦略3: A/Bテスト
 * リクエストの一部で新しいライブラリをテスト
 */
export function createABTestHandler() {
  return async (req: Request): Promise<Response> => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || 'http://localhost:8080',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        const { address, chain, network, asset } = body;

        // A/Bテスト: アドレスのハッシュ値で決定
        const useModernAPI = shouldUseModernAPI(address);

        if (useModernAPI) {
          console.log('A/B Test: Using modern Tatum API for', address.slice(0, 10) + '...');

          const modernHandler = await createModernTatumHandler();
          const result = await modernHandler.ensureSubscription({ address, chain, network, asset });

          return new Response(JSON.stringify({
            success: true,
            data: result,
            implementation: 'modern-tatum-api',
            ab_test: 'variant_b'
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        } else {
          console.log('A/B Test: Using legacy Tatum API for', address.slice(0, 10) + '...');

          const legacyHandler = createLegacyTatumHandler();
          const result = await legacyHandler.createTatumSubscription(address, chain, network, asset);

          return new Response(JSON.stringify({
            success: true,
            data: result,
            implementation: 'legacy-tatum-api',
            ab_test: 'variant_a'
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    return new Response(JSON.stringify({
      message: 'Tatum API Migration Demo - A/B Test Handler',
      endpoints: {
        'POST /': 'Create subscription with A/B testing',
        'GET /': 'Get handler status'
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  };
}

// ====================================
// Utility Functions
// ====================================

function shouldUseModernAPI(address: string): boolean {
  // Simple hash-based A/B testing
  // Use modern API for ~50% of addresses
  const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0;
}

// ====================================
// Migration Testing Demo
// ====================================

/**
 * 移行テスト用デモハンドラー
 */
export function createMigrationTestDemo() {
  return async (req: Request): Promise<Response> => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const strategy = url.searchParams.get('strategy') || 'phased';

      let demoInfo;

      switch (strategy) {
        case 'phased':
          demoInfo = {
            strategy: 'Phased Migration',
            description: 'Gradual migration with fallback to legacy system',
            benefits: ['Risk mitigation', 'Smooth transition', 'Zero downtime'],
            implementation: 'Try modern API first, fallback to legacy on failure'
          };
          break;

        case 'full':
          demoInfo = {
            strategy: 'Full Migration',
            description: 'Complete switch to modern Tatum API library',
            benefits: ['All new features', 'Consistent behavior', 'Simplified codebase'],
            implementation: 'Use only modern API with comprehensive error handling'
          };
          break;

        case 'ab':
          demoInfo = {
            strategy: 'A/B Testing',
            description: 'Split traffic between modern and legacy implementations',
            benefits: ['Real-world testing', 'Performance comparison', 'Risk mitigation'],
            implementation: 'Route 50% of requests to modern API based on address hash'
          };
          break;

        default:
          demoInfo = {
            strategy: 'Unknown',
            description: 'Available strategies: phased, full, ab'
          };
      }

      return new Response(JSON.stringify({
        migration_demo: demoInfo,
        endpoints: {
          'GET /?strategy=phased': 'Get phased migration info',
          'GET /?strategy=full': 'Get full migration info',
          'GET /?strategy=ab': 'Get A/B testing info',
          'POST /test': 'Test migration strategy'
        },
        library_info: {
          name: 'Undefined Tatum API Library',
          version: '1.0.0',
          features: [
            'Deno Native Implementation',
            'Enterprise Rate Limiting',
            'Circuit Breaker Pattern',
            'Structured Logging',
            'Health Monitoring',
            'Type Safety',
            'Batch Operations',
            'Undefined Integration'
          ]
        }
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (req.method === 'POST' && new URL(req.url).pathname === '/test') {
      try {
        const body = await req.json();
        const strategy = body.strategy || 'phased';
        const testData = {
          address: '0x1234567890123456789012345678901234567890',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          ...body
        };

        let handler;
        switch (strategy) {
          case 'phased':
            handler = createPhasegedMigrationHandler();
            break;
          case 'full':
            handler = createFullMigrationHandler();
            break;
          case 'ab':
            handler = createABTestHandler();
            break;
          default:
            throw new Error(`Unknown strategy: ${strategy}`);
        }

        // Create a mock request for testing
        const testRequest = new Request('http://localhost/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData)
        });

        const result = await handler(testRequest);
        const resultData = await result.json();

        return new Response(JSON.stringify({
          test_completed: true,
          strategy: strategy,
          test_data: testData,
          result: resultData,
          status_code: result.status
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          test_completed: false,
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
  };
}

// ====================================
// Demo Serve Function
// ====================================

/**
 * デモ用ハンドラー関数
 * Supabase Edge Functions環境では、serve()の代わりにハンドラー関数をエクスポート
 */
export function startMigrationDemo() {
  const handler = createMigrationTestDemo();

  console.log('🚀 Tatum API Migration Demo Handler Ready...');
  console.log('📖 Available endpoints:');
  console.log('  GET  /?strategy=phased - Phased migration info');
  console.log('  GET  /?strategy=full   - Full migration info');
  console.log('  GET  /?strategy=ab     - A/B testing info');
  console.log('  POST /test             - Test migration strategies');
  console.log('');
  console.log('🧪 Example usage in Edge Function:');
  console.log('  const demoHandler = startMigrationDemo();');
  console.log('  return await demoHandler(request);');

  return handler;
}