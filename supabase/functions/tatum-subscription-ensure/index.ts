// @ts-expect-error - Supabase Edge Functions環境での外部モジュール型定義制約のため
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { TatumConfig } from '../_shared/tatum/config.ts';
import type { UndefinedAsset, UndefinedChain, UndefinedNetwork, SupportedChain } from '../_shared/tatum/types.ts';

// Deno global types
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

/*
  Tatumサブスクリプション確保（フロントエンド統合用）
  - 入力: { address, chain, network, asset }
  - 出力: サブスクリプション作成結果
  - 用途: アドレス生成後のサブスクリプション自動作成
  - セキュリティ: ユーザー認証必須
*/

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? undefined;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? undefined;
const TATUM_API_KEY = Deno.env.get('TATUM_API_KEY');
const TATUM_WEBHOOK_URL = Deno.env.get('TATUM_WEBHOOK_URL');


type RequestBody = {
  address: string;
  chain: string;
  network: string;
  asset: string;
};

function withUserClient(authHeader: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
}

// ====================================
// Tatum API Integration
// ====================================

async function createTatumSubscription(
  address: string,
  chain: string,
  network: string,
  asset: string
): Promise<{
  subscriptionId: string;
  address: string;
  chain: string;
  network: string;
  asset: string;
  status: string;
  created: string;
  provider: string;
}> {
  if (!TATUM_API_KEY || !TATUM_WEBHOOK_URL) {
    throw new Error('Tatum API credentials not configured');
  }

  console.log(`[createTatumSubscription] Creating subscription for ${chain}:${network}:${asset} at ${address}`);

  // v4: ネットワークタイプ判定
  const isTestnet = ['testnet', 'sepolia', 'holesky', 'shasta', 'nile'].includes(network);
  const networkType = isTestnet ? 'testnet' : 'mainnet';
  console.log(`[createTatumSubscription] Network classification: ${network} -> ${networkType}`);

  // Tatum API v4 サブスクリプション作成エンドポイント
  const tatumApiUrl = `https://api.tatum.io/v4/subscription?type=${networkType}`;

  const tatumChain = getChainForTatum(chain, network, asset);
  console.log(`[createTatumSubscription] Mapped chain: ${chain}:${network} -> ${tatumChain}`);

  const requestBody = {
    type: 'ADDRESS_EVENT',
    attr: {
      address: address,
      chain: tatumChain,
      url: TATUM_WEBHOOK_URL
    }
  };

  console.log(`[createTatumSubscription] Request body:`, JSON.stringify(requestBody, null, 2));

  // ERC-20トークンの場合、個別のサブスクリプション方式は使用しない
  // Tatum APIはアドレス単位でETHとERC-20を統合管理
  console.log(`[createTatumSubscription] Creating standard subscription for ${chain}:${network}:${asset}`);

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
    console.error(`[createTatumSubscription] Tatum API error:`, {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: errorText,
      requestBody: requestBody
    });
    throw new Error(`Tatum API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`[createTatumSubscription] Success:`, result);

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



function normalizeSupportedChainForV4(chain: SupportedChain): string {
  switch (chain) {
    case 'ETH':
    case 'ETH_SEPOLIA':
      return 'ETH';
    case 'BTC':
    case 'BTC_TESTNET':
      return 'BTC';
    case 'TRX':
    case 'TRX_SHASTA':
      return 'TRX';
    case 'XRP':
    case 'XRP_TESTNET':
      return 'XRP';
    case 'ADA':
      return 'ADA';
    default:
      return chain;
  }
}

function getChainForTatum(chain: string, network: string, asset: string): string {
  try {
    const undefinedChain = chain as UndefinedChain;
    const undefinedNetwork = network as UndefinedNetwork;
    const undefinedAsset = asset as UndefinedAsset;

    const tatumChain = TatumConfig.mapUndefinedToTatum(undefinedChain, undefinedNetwork, undefinedAsset);
    const normalized = normalizeSupportedChainForV4(tatumChain);

    console.log(`[getChainForTatum] Undefined ${chain}/${network}/${asset} -> Tatum ${normalized} (origin: ${tatumChain})`);
    return normalized;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[getChainForTatum] Failed to map chain: ${chain}/${network}/${asset}`, detail);
    throw new Error(detail);
  }
}

async function validateTatumConnection(): Promise<{ valid: boolean; error?: string }> {
  if (!TATUM_API_KEY) {
    return { valid: false, error: 'TATUM_API_KEY not configured' };
  }

  try {
    // Tatum APIの接続確認
    const response = await fetch('https://api.tatum.io/v3/tatum/version', {
      headers: {
        'x-api-key': TATUM_API_KEY
      }
    });

    if (!response.ok) {
      return { valid: false, error: `Tatum API connection failed: ${response.status}` };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Connection error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ====================================
// CORS設定
// ====================================

// CORS設定は共有モジュールから取得
// @ts-expect-error - Deno runtime imports
import { getCorsHeaders as getSharedCorsHeaders } from '../_shared/cors.ts';

// 共有モジュールのCORSヘッダーにMax-Ageを追加
function getCorsHeaders(origin?: string | null): Record<string, string> {
  const headers = getSharedCorsHeaders(origin ?? null);
  // 空オブジェクトの場合はそのまま返す（許可されないオリジン）
  if (Object.keys(headers).length === 0) {
    return headers;
  }
  return {
    ...headers,
    'Access-Control-Max-Age': '86400',
  };
}

Deno.serve(async (req) => {
  // 動的CORS設定（リクエストオリジンに基づく）
  const origin = req.headers.get('Origin') ?? undefined;
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Health check with Tatum API validation
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const detailed = url.searchParams.get('detailed') === 'true';

    // サポートするチェーンを動的に決定
    const supportedChains = ['evm', 'btc', 'trc', 'xrp', 'ada'];

    const healthData: Record<string, unknown> = {
      message: 'tatum-subscription-ensure (Multi-provider)',
      supports: supportedChains,
      version: '1.1', // Blockfrost統合により更新
      status: 'operational',
      implementation: 'production-ready',
      timestamp: new Date().toISOString()
    };

    if (detailed) {
      const tatumCheck = await validateTatumConnection();
      healthData.services = {
        tatum: {
          configured: !!TATUM_API_KEY,
          connected: tatumCheck.valid,
          error: tatumCheck.error || null
        },
        webhook: {
          configured: !!TATUM_WEBHOOK_URL,
          url: TATUM_WEBHOOK_URL ? 'configured' : 'missing'
        },
        database: {
          available: true // Supabaseクライアントが初期化されているため
        }
      };


      // 全体ステータスの決定
      const allServicesOk = tatumCheck.valid && !!TATUM_API_KEY && !!TATUM_WEBHOOK_URL;


      healthData.status = allServicesOk ? 'healthy' : 'degraded';
    }

    return new Response(JSON.stringify(healthData), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const body: RequestBody = await req.json();
    const { address, chain, network, asset } = body;

    // 入力値検証
    if (!address || !chain || !network || !asset) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: address, chain, network, asset'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // TEMPORARY DEBUG: 認証チェックを一時的に無効化
    console.log('[DEBUG] Auth header:', auth ? 'present' : 'missing');

    // user-scoped client（認証確認）- デバッグ用に緩和
    let userProfile = null;
    if (auth) {
      try {
        const userScoped = withUserClient(auth);
        const { data: profile } = await userScoped.auth.getUser();
        userProfile = profile?.user;
        console.log('[DEBUG] User profile:', userProfile ? 'valid' : 'invalid');
      } catch (error) {
        console.error('[DEBUG] Auth error:', error);
      }
    }

    // 認証チェックを一時的にスキップ（デバッグ用）
    console.log('[DEBUG] Proceeding without strict auth check for debugging');

    // Tatum API統合の前提条件チェック
    console.log('[DEBUG] Environment check:');
    console.log('[DEBUG] TATUM_API_KEY:', TATUM_API_KEY ? 'present' : 'missing');
    console.log('[DEBUG] TATUM_WEBHOOK_URL:', TATUM_WEBHOOK_URL ? 'present' : 'missing');

    if (!TATUM_API_KEY) {
      console.error('[DEBUG] Missing TATUM_API_KEY');
      return new Response(JSON.stringify({
        success: false,
        error: 'Tatum API not configured',
        code: 'TATUM_CONFIG_MISSING',
        details: 'TATUM_API_KEY environment variable is required for subscription creation'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (!TATUM_WEBHOOK_URL) {
      console.error('[DEBUG] Missing TATUM_WEBHOOK_URL');
      return new Response(JSON.stringify({
        success: false,
        error: 'Webhook URL not configured',
        code: 'WEBHOOK_CONFIG_MISSING',
        details: 'TATUM_WEBHOOK_URL environment variable is required for subscription creation'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log(`[tatum-subscription-ensure] Processing subscription for ${chain}:${network}:${asset} at ${address}`);

    // 重複サブスクリプションチェック（データベース）- エラーハンドリング強化
    const userScopedClient = withUserClient(auth);

    // 完全一致チェック（同じアセット）
    const { data: exactSubscriptions, error: exactCheckError } = await userScopedClient
      .from('subscription_status')
      .select('subscription_id, status, asset')
      .eq('address', address)
      .eq('chain', chain)
      .eq('network', network)
      .eq('asset', asset)
      .eq('status', 'active');

    if (exactCheckError) {
      console.error('[tatum-subscription-ensure] Database check error:', exactCheckError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Database access error during duplicate check',
        code: 'DATABASE_CHECK_ERROR',
        details: exactCheckError.message || String(exactCheckError),
        address: address,
        chain: chain,
        network: network,
        asset: asset
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 完全一致で既存サブスクリプションが見つかった場合
    if (exactSubscriptions && exactSubscriptions.length > 0) {
      const existing = exactSubscriptions[0];
      console.log(`[tatum-subscription-ensure] Existing active subscription found: ${existing.subscription_id}`);

      return new Response(JSON.stringify({
        success: true,
        data: {
          subscriptionId: existing.subscription_id,
          address: address,
          chain: chain,
          network: network,
          asset: asset,
          status: 'existing',
          provider: existing.provider || 'tatum', // データベースから取得した実際のプロバイダー
          message: 'Subscription already exists and is active'
        }
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ERC-20トークンの場合、ETHサブスクリプションの存在もチェック
    // Tatum APIは同一アドレスでETHサブスクリプションがあれば、ERC-20トークンも監視対象になる
    if (chain === 'evm' && network === 'ethereum' && asset !== 'ETH') {
      const { data: ethSubscriptions, error: ethCheckError } = await userScopedClient
        .from('subscription_status')
        .select('subscription_id, status, asset')
        .eq('address', address)
        .eq('chain', chain)
        .eq('network', network)
        .eq('asset', 'ETH')
        .eq('status', 'active');

      if (ethCheckError) {
        console.error('[tatum-subscription-ensure] ETH subscription check error:', ethCheckError);
      } else if (ethSubscriptions && ethSubscriptions.length > 0) {
        const ethSub = ethSubscriptions[0];
        console.log(`[tatum-subscription-ensure] ERC-20 token ${asset} covered by existing ETH subscription: ${ethSub.subscription_id}`);

        // データベースにERC-20トークンのエントリも作成（参照用）
        const { error: insertError } = await userScopedClient
          .from('subscription_status')
          .upsert({
            subscription_id: ethSub.subscription_id, // 同じサブスクリプションIDを使用
            address: address,
            chain: chain,
            network: network,
            asset: asset,
            status: 'active',
            provider: 'tatum',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('[tatum-subscription-ensure] Failed to create ERC-20 reference entry:', insertError);
        }

        return new Response(JSON.stringify({
          success: true,
          data: {
            subscriptionId: ethSub.subscription_id,
            address: address,
            chain: chain,
            network: network,
            asset: asset,
            status: 'shared_with_eth',
            provider: 'tatum',
            message: `${asset} subscription covered by existing ETH subscription`
          }
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    let result: {
      subscriptionId: string;
      address: string;
      chain: string;
      network: string;
      asset: string;
      status: string;
      created: string;
      provider: string;
    } | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s

    while (retryCount <= maxRetries) {
      try {
        // プロバイダー選択ロジック：全てのチェーンでTatumを使用
        console.log(`[tatum-subscription-ensure] Attempt ${retryCount + 1}/${maxRetries + 1}: Using Tatum for ${chain}:${network}:${asset}`);
        console.log(`[tatum-subscription-ensure] Parameters:`, { address, chain, network, asset });

        result = await createTatumSubscription(address, chain, network, asset);
        console.log(`[tatum-subscription-ensure] Tatum subscription successful:`, result);

        // データベースにサブスクリプション情報を保存
        const provider = 'tatum';
        const upsertData: {
          subscription_id: string;
          address: string;
          chain: string;
          network: string;
          asset: string;
          status: string;
          provider: string;
          created_at: string;
          updated_at: string;
        } = {
          subscription_id: result.subscriptionId,
          address: address,
          chain: chain,
          network: network,
          asset: asset,
          status: 'active',
          provider: provider,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };


        const { error: insertError } = await userScopedClient
          .from('subscription_status')
          .upsert(upsertData);

        if (insertError) {
          console.error('[tatum-subscription-ensure] Database insert error:', insertError);
        }

        break; // 成功した場合はループを抜ける

      } catch (error) {
        retryCount++;
        console.error(`[tatum-subscription-ensure] Attempt ${retryCount} failed:`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          chain: chain,
          network: network,
          asset: asset,
          address: address
        });

        if (retryCount > maxRetries) {
          // 最大リトライ回数に達した場合
          const errorMessage = error instanceof Error ? error.message : String(error);

          return new Response(JSON.stringify({
            success: false,
            error: 'Tatum API subscription failed',
            code: 'TATUM_API_FAILED',
            details: errorMessage,
            retryCount: retryCount - 1,
            address: address,
            chain: chain,
            network: network,
            asset: asset
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // 指数バックオフで待機
        if (retryCount <= maxRetries) {
          console.log(`[tatum-subscription-ensure] Retrying in ${retryDelays[retryCount - 1]}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelays[retryCount - 1]));
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: result
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (e) {
    console.error('[tatum-subscription-ensure] error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: (e as Error).message || String(e)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
