// Deno type declarations for Supabase Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// Deno.serve is available globally in newer Deno versions
// import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error - Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY) {
  throw new Error('Supabase credentials are not configured');
}
const ETHEREUM_RPC_URL = Deno.env.get('ETHEREUM_RPC_URL');
const ETHEREUM_SEPOLIA_RPC_URL = Deno.env.get('ETHEREUM_SEPOLIA_RPC_URL');

const TRON_RPC_URL = Deno.env.get('TRON_RPC_URL') || 'https://api.trongrid.io';
const TRONGRID_API_KEY = Deno.env.get('TRONGRID_API_KEY') || '';
const BLOCKFROST_PROJECT_ID = Deno.env.get('BLOCKFROST_PROJECT_ID') || Deno.env.get('BLOCKFROST_API_KEY') || '';

const supabase = createClient(
  SUPABASE_URL,
  (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY) as string
);

// 入金完了通知を作成するヘルパー関数
async function createDepositNotification(userId: string, currency: string, amount: number, transactionHash: string) {
  try {
    await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title: '入金が完了しました',
        message: `${amount} ${currency}の入金が確認されました。残高に反映されています。`,
        type: 'deposit_completed',
        metadata: {
          currency: currency,
          amount: amount.toString(),
          transaction_hash: transactionHash,
          timestamp: new Date().toISOString()
        },
        read: false
      });
  } catch (error) {
    console.warn('[confirmations-updater] 通知作成エラー:', error);
  }
}

async function updateEvmPending(network: 'ethereum' | 'sepolia') {
  const rpcUrl = network === 'ethereum' ? ETHEREUM_RPC_URL : ETHEREUM_SEPOLIA_RPC_URL;
  if (!rpcUrl) return { updated: 0 };

  const { data: rows } = await supabase
    .from('deposit_transactions')
    .select('*')
    .eq('chain', 'evm')
    .eq('network', network)
    .eq('status', 'pending')
    .limit(200);
  if (!Array.isArray(rows) || rows.length === 0) return { updated: 0 };

  const tipRes = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) });
  const tipHex = (await tipRes.json()).result;
  const tip = parseInt(tipHex, 16);

  let updated = 0;
  for (const r of rows) {
    const txHash = r.transaction_hash as string;
    const recRes = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getTransactionReceipt', params: [txHash] }) });
    const receipt = (await recRes.json()).result;
    const bn = receipt?.blockNumber ? parseInt(receipt.blockNumber, 16) : 0;
    const confirmations = bn > 0 ? (tip - bn + 1) : 0;
    const required = r.required_confirmations || 12;
    const isConfirmed = confirmations >= required;

    const updates: Record<string, unknown> = { confirmations, status: isConfirmed ? 'confirmed' : 'pending' };
    if (isConfirmed) updates.confirmed_at = new Date().toISOString();

    const { error } = await supabase
      .from('deposit_transactions')
      .update(updates)
      .eq('id', r.id);
    if (!error) {
      updated++;
      // deposits も更新
      await supabase
        .from('deposits')
        .update({
          status: isConfirmed ? 'confirmed' : 'pending',
          confirmations_observed: confirmations,
          confirmations_required: required,
          confirmed_at: isConfirmed ? new Date().toISOString() : null
        })
        .eq('transaction_hash', txHash)
        .eq('user_id', r.user_id);

      if (isConfirmed) {
        // user_assetsへ反映（冪等）
        const amt = parseFloat(r.amount as string);
        const asset = r.asset as string;
        const { data: bal } = await supabase
          .from('user_assets')
          .select('*')
          .eq('user_id', r.user_id)
          .eq('currency', asset)
          .maybeSingle();
        if (bal) {
          await supabase
            .from('user_assets')
            .update({ balance: (parseFloat(bal.balance as string) + amt).toString(), updated_at: new Date().toISOString() })
            .eq('id', bal.id);
        } else {
          await supabase
            .from('user_assets')
            .insert({ user_id: r.user_id, currency: asset, balance: amt.toString() });
        }
        // 入金完了通知を作成
        await createDepositNotification(r.user_id, asset, amt, txHash);
      }
    }
  }
  return { updated };
}

async function updateBtcPending(network: 'mainnet' | 'testnet') {
  const { data: rows } = await supabase
    .from('deposit_transactions')
    .select('*')
    .eq('chain', 'btc')
    .eq('network', network)
    .eq('status', 'pending')
    .limit(200);
  if (!Array.isArray(rows) || rows.length === 0) return { updated: 0 };

  const tipUrl = network === 'mainnet' ? 'https://blockstream.info/api/blocks/tip/height' : 'https://blockstream.info/testnet/api/blocks/tip/height';
  const tipText = await (await fetch(tipUrl)).text();
  const tip = parseInt(tipText, 10) || 0;

  let updated = 0;
  for (const r of rows) {
    const txHash = r.transaction_hash as string;
    // 簡易: tx詳細からblock_height取得
    const base = network === 'mainnet' ? 'https://blockstream.info/api' : 'https://blockstream.info/testnet/api';
    const detail = await (await fetch(`${base}/tx/${txHash}`)).json();
    const bn = detail.status?.block_height || 0;
    const confirmations = (detail.status?.confirmed && bn > 0) ? (tip - bn + 1) : 0;
    const required = r.required_confirmations || 3;
    const isConfirmed = confirmations >= required;

    const { error } = await supabase
      .from('deposit_transactions')
      .update({ confirmations, status: isConfirmed ? 'confirmed' : 'pending', confirmed_at: isConfirmed ? new Date().toISOString() : null })
      .eq('id', r.id);
    if (!error) {
      updated++;
      await supabase
        .from('deposits')
        .update({
          status: isConfirmed ? 'confirmed' : 'pending',
          confirmations_observed: confirmations,
          confirmations_required: required,
          confirmed_at: isConfirmed ? new Date().toISOString() : null
        })
        .eq('transaction_hash', txHash)
        .eq('user_id', r.user_id);
    }
  }
  return { updated };
}

async function updateTronPending(network: 'mainnet' | 'shasta') {
  if (!TRONGRID_API_KEY) return { updated: 0 };
  const base = network === 'mainnet' ? 'https://api.trongrid.io' : 'https://api.shasta.trongrid.io';
  const headers = { 'TRON-PRO-API-KEY': TRONGRID_API_KEY, 'Accept': 'application/json' } as Record<string,string>;
  const { data: rows } = await supabase
    .from('deposit_transactions')
    .select('*')
    .eq('chain', 'trc')
    .eq('network', network)
    .eq('status', 'pending')
    .limit(200);
  if (!Array.isArray(rows) || rows.length === 0) return { updated: 0 };

  // 最新ブロック番号
  let tip = 0;
  try {
    const info = await (await fetch(`${base}/wallet/getnowblock`)).json();
    tip = info?.block_header?.raw_data?.number || 0;
  } catch {
    // Ignore errors when fetching latest block info
  }

  let updated = 0;
  for (const r of rows) {
    const txid = r.transaction_hash as string;
    try {
      const detailRes = await fetch(`${base}/v1/transactions/${txid}`, { headers });
      const detail = await detailRes.json();
      const tx = Array.isArray(detail?.data) ? detail.data[0] : null;
      const bn = tx?.blockNumber || 0;
      const contractRet = tx?.ret?.[0]?.contractRet;
      const ok = contractRet === 'SUCCESS' && bn > 0;
      const confirmations = ok && tip > 0 ? Math.max(0, tip - bn + 1) : 0;
      const required = r.required_confirmations || 19;
      const isConfirmed = ok && confirmations >= required;

      const { error } = await supabase
        .from('deposit_transactions')
        .update({ confirmations, status: isConfirmed ? 'confirmed' : 'pending', confirmed_at: isConfirmed ? new Date().toISOString() : null })
        .eq('id', r.id);
      if (!error) {
        updated++;
        await supabase
          .from('deposits')
          .update({
            status: isConfirmed ? 'confirmed' : 'pending',
            confirmations_observed: confirmations,
            confirmations_required: required,
            confirmed_at: isConfirmed ? new Date().toISOString() : null
          })
          .eq('transaction_hash', txid)
          .eq('user_id', r.user_id);

        if (isConfirmed) {
          const amt = parseFloat(r.amount as string);
          const asset = r.asset as string;
          const { data: bal } = await supabase
            .from('user_assets')
            .select('*')
            .eq('user_id', r.user_id)
            .eq('currency', asset)
            .maybeSingle();
          if (bal) {
            await supabase
              .from('user_assets')
              .update({ balance: (parseFloat(bal.balance as string) + amt).toString(), updated_at: new Date().toISOString() })
              .eq('id', bal.id);
          } else {
            await supabase
              .from('user_assets')
              .insert({ user_id: r.user_id, currency: asset, balance: amt.toString() });
          }
          // 入金完了通知を作成（Tron）
          await createDepositNotification(r.user_id, asset, amt, txid);
        }
      }
    } catch {
      // Ignore errors when fetching transaction details
    }

  }
  return { updated };
}

async function updateAdaPending(network: 'mainnet' | 'testnet') {
  if (!BLOCKFROST_PROJECT_ID) return { updated: 0 };
  const base = network === 'mainnet' ? 'https://cardano-mainnet.blockfrost.io/api/v0' : 'https://cardano-preprod.blockfrost.io/api/v0';
  const headers = { 'project_id': BLOCKFROST_PROJECT_ID } as Record<string,string>;
  const { data: rows } = await supabase
    .from('deposit_transactions')
    .select('*')
    .eq('chain', 'ada')
    .eq('network', network)
    .eq('status', 'pending')
    .limit(200);
  if (!Array.isArray(rows) || rows.length === 0) return { updated: 0 };
  let updated = 0;
  for (const r of rows) {
    const txHash = r.transaction_hash as string;
    try {
      const detail = await (await fetch(`${base}/txs/${txHash}`, { headers })).json();
      const bn = detail?.block_height || 0;
      const conf = detail?.confirmations || 0; // Blockfrost returns confirmations
      const required = r.required_confirmations || 15;
      const isConfirmed = conf >= required;
      const { error } = await supabase
        .from('deposit_transactions')
        .update({ confirmations: conf, status: isConfirmed ? 'confirmed' : 'pending', confirmed_at: isConfirmed ? new Date().toISOString() : null })
        .eq('id', r.id);
      if (!error) {
        updated++;
        await supabase
          .from('deposits')
          .update({
            status: isConfirmed ? 'confirmed' : 'pending',
            confirmations_observed: conf,
            confirmations_required: required,
            confirmed_at: isConfirmed ? new Date().toISOString() : null
          })
          .eq('transaction_hash', txHash)
          .eq('user_id', r.user_id);
        if (isConfirmed) {
          const amt = parseFloat(r.amount as string);
          const asset = r.asset as string;
          const { data: bal } = await supabase
            .from('user_assets')
            .select('*')
            .eq('user_id', r.user_id)
            .eq('currency', asset)
            .maybeSingle();
          if (bal) {
            await supabase
              .from('user_assets')
              .update({ balance: (parseFloat(bal.balance as string) + amt).toString(), updated_at: new Date().toISOString() })
              .eq('id', bal.id);
          } else {
            await supabase
              .from('user_assets')
              .insert({ user_id: r.user_id, currency: asset, balance: amt.toString() });
          }
          // 入金完了通知を作成（Cardano）
          await createDepositNotification(r.user_id, asset, amt, txHash);
        }
      }
    } catch {
      // Ignore errors when fetching transaction details
    }

  }
  return { updated };
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ message: 'confirmations-updater', version: '0.1' }), { headers: { 'Content-Type': 'application/json' } });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const results: Record<string, unknown> = { success: true };

    if (ETHEREUM_RPC_URL) {
      results.evmEthereum = await updateEvmPending('ethereum');
    }

    if (ETHEREUM_SEPOLIA_RPC_URL) {
      results.evmSepolia = await updateEvmPending('sepolia');
    }

    if (TRONGRID_API_KEY) {
      results.tronMain = await updateTronPending('mainnet');
      results.tronShasta = await updateTronPending('shasta');
    }

    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[confirmations-updater] error:', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message || String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
