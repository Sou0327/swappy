/**
 * Sweep TX Real-time Signer Edge Function (Multi-Chain Version)
 *
 * sweep_jobに対してリアルタイムでunsigned_txを生成する
 * 対応チェーン: EVM, Tron, Bitcoin, Cardano, Ripple
 *
 * Input (POST):
 *   - job_id: sweep_jobsテーブルのID
 *
 * Output:
 *   - unsigned_tx: 署名前のトランザクション
 *   - metadata: tx_generated_at, deposit_index等
 */

import { ChainTxBuilderFactory } from '../_shared/chain-abstraction/factory.ts';
import type { BuildTxParams } from '../_shared/chain-abstraction/types.ts';

// EVM固有のヘルパー関数は削除（各チェーンのビルダーが処理）

/**
 * メインハンドラー
 */
export async function handleRequest(
  request: Request,
  supabaseClient?: Record<string, unknown>
): Promise<Response> {
  // GET: 機能説明を返す
  if (request.method === 'GET') {
    return new Response(
      JSON.stringify({
        message: 'Sweep TX Real-time Signer',
        version: '1.0.0',
        description: 'Generate unsigned transaction for sweep jobs in real-time',
        endpoints: {
          'GET /': 'This help message',
          'POST /': 'Generate unsigned_tx for a sweep job',
        },
        parameters: {
          job_id: 'ID of the sweep job (required)',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // POST: unsigned_tx生成
  if (request.method === 'POST') {
    try {
      // リクエストボディ解析
      const body = await request.json();
      const { job_id } = body;

      if (!job_id) {
        return new Response(
          JSON.stringify({ error: 'job_id is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Supabaseクライアント（テスト時はモックを使用）
      const client = supabaseClient || createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      );

      // 1. sweep_job取得
      const { data: job, error: jobError } = await client
        .from('sweep_jobs')
        .select('*')
        .eq('id', job_id)
        .single();

      if (jobError || !job) {
        return new Response(
          JSON.stringify({ error: 'Job not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 2. deposit取得
      const { data: deposit, error: depositError } = await client
        .from('deposits')
        .select('*')
        .eq('id', job.deposit_id)
        .single();

      if (depositError || !deposit) {
        return new Response(
          JSON.stringify({ error: 'Deposit not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 3. wallet_root取得
      const { data: walletRoot, error: walletRootError } = await client
        .from('wallet_roots')
        .select('*')
        .eq('chain', job.chain)
        .eq('network', job.network)
        .single();

      if (walletRootError || !walletRoot) {
        return new Response(
          JSON.stringify({ error: 'Wallet root not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 4. チェーン別ビルダーを取得
      const builder = ChainTxBuilderFactory.create(job.chain);

      // 5. BuildTxParamsを構築
      const txParams: BuildTxParams = {
        chain: job.chain,
        network: job.network,
        asset: job.asset,
        fromAddress: deposit.address,
        toAddress: walletRoot.root_address,
        balance: BigInt(deposit.balance),
        depositIndex: deposit.deposit_index,
      };

      // 6. unsigned_tx生成（チェーン非依存）
      const unsignedTxResult = await builder.buildUnsignedTx(txParams);

      // 7. sweep_job更新
      const now = new Date().toISOString();
      await client
        .from('sweep_jobs')
        .update({
          unsigned_tx: unsignedTxResult.data,
          tx_generated_at: now,
          deposit_index: deposit.deposit_index,
        })
        .eq('id', job_id);

      // 8. レスポンス返却
      return new Response(
        JSON.stringify({
          success: true,
          unsigned_tx: unsignedTxResult.data,
          metadata: {
            job_id,
            chain: job.chain,
            network: job.network,
            deposit_index: deposit.deposit_index,
            tx_generated_at: now,
            estimated_fee: unsignedTxResult.estimatedFee,
            ...unsignedTxResult.metadata,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    } catch (error) {
      console.error('Error generating unsigned_tx:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // 残高不足エラーは400として返す
      const status = errorMessage.includes('Insufficient balance') ? 400 : 500;

      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // その他のメソッド
  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { 'Content-Type': 'application/json' } }
  );
}

// Supabase Edge Function エントリーポイント
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  return await handleRequest(req);
});
