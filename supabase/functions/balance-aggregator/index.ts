// Deno環境での型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// @ts-expect-error - Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

// 環境変数
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const ETHEREUM_RPC_URL = Deno.env.get('ETHEREUM_RPC_URL');
const ETHEREUM_SEPOLIA_RPC_URL = Deno.env.get('ETHEREUM_SEPOLIA_RPC_URL');

// 型定義
type ChainType = 'evm' | 'btc' | 'trc' | 'xrp' | 'ada';
type NetworkType = 'ethereum' | 'sepolia' | 'mainnet' | 'testnet' | 'nile' | 'shasta';
type AssetType = 'ETH' | 'BTC' | 'TRX' | 'XRP' | 'ADA' | 'USDT';

interface AggregateRequest {
  chain?: ChainType;
  network?: NetworkType;
  asset?: AssetType;
}

interface DepositAddress {
  id: string;
  chain: ChainType;
  network: NetworkType;
  asset: AssetType;
  address: string;
  user_id: string;
}

interface BalanceInfo {
  address: string;
  balance: string;
  chain: ChainType;
  network: NetworkType;
  asset: AssetType;
  user_id: string;
  error?: string;
}

interface BalanceSummary {
  chain: ChainType;
  network: NetworkType;
  asset: AssetType;
  totalBalance: string;
  addressCount: number;
}

// Supabaseクライアント作成
function createSupabaseClient() {
  console.log('[balance-aggregator] Creating Supabase client...');
  console.log('[balance-aggregator] SUPABASE_URL:', SUPABASE_URL);
  console.log('[balance-aggregator] Has SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_ROLE_KEY);
  console.log('[balance-aggregator] Has ANON_KEY:', !!SUPABASE_ANON_KEY);

  const client = createClient(
    SUPABASE_URL,
    (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY) as string
  );

  console.log('[balance-aggregator] Client created:', typeof client);
  console.log('[balance-aggregator] Client has .from:', typeof client?.from);

  return client;
}

// HEX変換ユーティリティ
function parseHex(hex: string | null | undefined): bigint {
  if (!hex) return 0n;
  return BigInt(hex);
}

// EVM RPC呼び出し
async function evmRpc(network: 'ethereum' | 'sepolia', method: string, params: unknown[] = []) {
  const url = network === 'ethereum' ? ETHEREUM_RPC_URL : ETHEREUM_SEPOLIA_RPC_URL;
  if (!url) throw new Error(`RPC URL not configured for ${network}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return data.result;
}

// EVM残高取得
async function getEvmBalance(address: string, network: 'ethereum' | 'sepolia'): Promise<string> {
  try {
    const balanceHex = await evmRpc(network, 'eth_getBalance', [address, 'latest']);
    const balanceWei = parseHex(balanceHex);
    // Wei to ETH (18 decimals)
    const balanceEth = Number(balanceWei) / 1e18;
    return balanceEth.toFixed(18).replace(/\.?0+$/, ''); // 末尾の0を削除
  } catch (error) {
    throw new Error(`Failed to get balance for ${address}: ${error.message}`);
  }
}

// 残高集計処理
async function aggregateBalances(
  addresses: DepositAddress[]
): Promise<{ balances: BalanceInfo[]; summary: BalanceSummary }> {
  const balances: BalanceInfo[] = [];
  let totalBalance = 0n;

  for (const addr of addresses) {
    try {
      let balance = '0';

      if (addr.chain === 'evm' && (addr.network === 'ethereum' || addr.network === 'sepolia')) {
        balance = await getEvmBalance(addr.address, addr.network);
      }
      // 他のチェーンは将来実装（BTC, TRC, XRP, ADA）

      balances.push({
        address: addr.address,
        balance,
        chain: addr.chain,
        network: addr.network,
        asset: addr.asset,
        user_id: addr.user_id
      });

      // 集計（ETHの場合）
      if (addr.asset === 'ETH') {
        const balanceWei = BigInt(Math.floor(parseFloat(balance) * 1e18));
        totalBalance += balanceWei;
      }

    } catch (error) {
      // エラーがあっても処理を続行し、エラー情報を記録
      balances.push({
        address: addr.address,
        balance: '0',
        chain: addr.chain,
        network: addr.network,
        asset: addr.asset,
        user_id: addr.user_id,
        error: error.message
      });
    }
  }

  const summary: BalanceSummary = {
    chain: addresses[0]?.chain || 'evm',
    network: addresses[0]?.network || 'ethereum',
    asset: addresses[0]?.asset || 'ETH',
    totalBalance: (Number(totalBalance) / 1e18).toFixed(18).replace(/\.?0+$/, ''),
    addressCount: addresses.length
  };

  return { balances, summary };
}

// メインハンドラ
async function handleRequest(req: Request, supabaseClient?: Record<string, unknown>): Promise<Response> {
  const origin = req.headers.get('Origin');
  const corsHeaders = { ...getCorsHeaders(origin), 'Content-Type': 'application/json' };

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(origin);
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        message: 'Balance Aggregator',
        version: '0.1',
        supports: { evm: ['ethereum', 'sepolia'] },
        note: 'Aggregates on-chain balances for all deposit addresses'
      }),
      { headers: corsHeaders }
    );
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const svc = supabaseClient || createSupabaseClient();
    const body: AggregateRequest = await req.json().catch(() => ({}));

    // deposit_addressesからアドレス取得
    let query = svc.from('deposit_addresses').select('*');

    if (body.chain) {
      query = query.eq('chain', body.chain);
    }
    if (body.network) {
      query = query.eq('network', body.network);
    }
    if (body.asset) {
      query = query.eq('asset', body.asset);
    }

    const { data: addresses, error: dbError } = await query;

    if (dbError) throw dbError;
    if (!addresses || addresses.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          addresses: [],
          balances: [],
          summary: null,
          message: 'No deposit addresses found'
        }),
        { headers: corsHeaders }
      );
    }

    // 残高集計
    const { balances, summary } = await aggregateBalances(addresses);

    return new Response(
      JSON.stringify({
        success: true,
        addresses,
        balances,
        summary
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error('[balance-aggregator] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || String(error)
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Deno Serve
Deno.serve(handleRequest);

// テスト用にエクスポート（テストからインポートできるように）
export { handleRequest };
