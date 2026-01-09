// Deno環境での型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// @ts-expect-error - Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 環境変数
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const ETHEREUM_RPC_URL = Deno.env.get('ETHEREUM_RPC_URL');
const ETHEREUM_SEPOLIA_RPC_URL = Deno.env.get('ETHEREUM_SEPOLIA_RPC_URL');

// Supabaseクライアント（サービスロールがあれば優先）
const supabase = createClient(
  SUPABASE_URL,
  (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY) as string
);

function toHex(value: number | bigint): string {
  const v = typeof value === 'bigint' ? value : BigInt(Math.floor(value));
  return '0x' + v.toString(16);
}

function parseHex(hex: string | null | undefined): bigint {
  if (!hex) return 0n;
  return BigInt(hex);
}

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

type PlanRequest = {
  chain?: 'evm';
  network?: 'ethereum' | 'sepolia';
  asset?: 'ETH';
  depositIds?: string[];
};

type UnsignedEvmTx = {
  from: string;
  to: string;
  value: string; // hex wei
  gas: string; // hex
  gasPrice: string; // hex (legacy)
  nonce: string; // hex
  chainId: number;
};

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        message: 'Sweep Planner',
        version: '0.1',
        supports: { evm: ['ethereum', 'sepolia'] },
        note: 'Generates unsigned sweep tx for confirmed deposits (ETH only)'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body: PlanRequest = await req.json().catch(() => ({}));
    const chain = body.chain || 'evm';
    const network = body.network || 'ethereum';
    const asset = body.asset || 'ETH';

    if (chain !== 'evm' || (network !== 'ethereum' && network !== 'sepolia') || asset !== 'ETH') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only EVM ETH (ethereum/sepolia) is supported for now.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 集約先ウォレットの取得
    const { data: adminWallet } = await supabase
      .from('admin_wallets')
      .select('*')
      .eq('chain', 'evm')
      .eq('network', network)
      .eq('asset', 'ETH')
      .eq('active', true)
      .maybeSingle();

    if (!adminWallet?.address) {
      return new Response(
        JSON.stringify({ success: false, error: 'admin_wallets に EVM/ETH の集約先アドレスが未設定です。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 対象入金を取得（confirmedで、未スイープ）
    let depositQuery = supabase
      .from('deposits')
      .select('*')
      .eq('status', 'confirmed')
      .eq('chain', 'evm')
      .eq('network', network)
      .eq('asset', 'ETH')
      .order('created_at', { ascending: true });

    if (body.depositIds && body.depositIds.length > 0) {
      depositQuery = depositQuery.in('id', body.depositIds);
    }

    const { data: deposits, error: depErr } = await depositQuery;
    if (depErr) throw depErr;

    const planned: Array<{ deposit_id: string; job_id: string; unsigned_tx?: UnsignedEvmTx; reason?: string }>
      = [];

    for (const d of deposits || []) {
      // 既にスイープ済みかを確認
      const { data: existingJob } = await supabase
        .from('sweep_jobs')
        .select('id,status')
        .eq('deposit_id', d.id)
        .maybeSingle();
      if (existingJob && existingJob.status !== 'failed') {
        planned.push({ deposit_id: d.id, job_id: existingJob.id, reason: 'already_planned' });
        continue;
      }

      const from = d.wallet_address as string;
      const to = adminWallet.address as string;

      // RPCから残高・nonce・gasPriceを取得
      const [balanceHex, nonceHex, gasPriceHex] = await Promise.all([
        evmRpc(network, 'eth_getBalance', [from, 'latest']),
        evmRpc(network, 'eth_getTransactionCount', [from, 'pending']),
        evmRpc(network, 'eth_gasPrice', [])
      ]);

      const balance = parseHex(balanceHex);
      const gasPrice = parseHex(gasPriceHex);
      const gasLimit = 21000n;
      const gasCost = gasLimit * gasPrice;

      if (balance <= gasCost) {
        // ガス不足
        const { data: job } = await supabase
          .from('sweep_jobs')
          .insert({
            deposit_id: d.id,
            chain: 'evm',
            network,
            asset: 'ETH',
            from_address: from,
            to_address: to,
            planned_amount: 0,
            currency: 'ETH',
            status: 'planned',
            unsigned_tx: { reason: 'insufficient_gas', balance: balanceHex, gasPrice: gasPriceHex }
          })
          .select('id')
          .maybeSingle();

        planned.push({ deposit_id: d.id, job_id: job?.id || '', reason: 'insufficient_gas' });
        continue;
      }

      // 送金額（全残高-手数料）
      const value = balance - gasCost;
      // chainId推定
      const chainId = network === 'ethereum' ? 1 : 11155111;
      const unsignedTx: UnsignedEvmTx = {
        from,
        to,
        value: toHex(value),
        gas: toHex(gasLimit),
        gasPrice: gasPriceHex,
        nonce: nonceHex,
        chainId
      };

      const { data: job2, error: jobErr } = await supabase
        .from('sweep_jobs')
        .insert({
          deposit_id: d.id,
          chain: 'evm',
          network,
          asset: 'ETH',
          from_address: from,
          to_address: to,
          planned_amount: Number(value) / 1e18,
          currency: 'ETH',
          status: 'planned',
          unsigned_tx: unsignedTx
        })
        .select('id')
        .maybeSingle();

      if (jobErr) throw jobErr;
      planned.push({ deposit_id: d.id, job_id: job2?.id || '', unsigned_tx: unsignedTx });
    }

    return new Response(
      JSON.stringify({ success: true, count: planned.length, planned }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sweep-planner] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

