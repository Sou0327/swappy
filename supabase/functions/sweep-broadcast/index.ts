/**
 * Sweep Broadcast Edge Function (Multi-Chain Version)
 *
 * 署名済みトランザクションをブロックチェーンにブロードキャストする
 * 対応チェーン: EVM, Tron, Bitcoin, Cardano, Ripple
 *
 * Input (POST):
 *   - job_id: sweep_jobsテーブルのID
 *   - signed_tx: 署名済みトランザクション
 *
 * Output:
 *   - transaction_hash: ブロードキャストされたトランザクションハッシュ
 *   - metadata: broadcasted_at等
 */

import { ChainTxBuilderFactory } from '../_shared/chain-abstraction/factory.ts';
import type { BroadcastParams } from '../_shared/chain-abstraction/types.ts';

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
        message: 'Sweep Broadcast',
        version: '1.0.0',
        description: 'Broadcast signed transaction to blockchain',
        endpoints: {
          'GET /': 'This help message',
          'POST /': 'Broadcast signed_tx for a sweep job',
        },
        parameters: {
          job_id: 'ID of the sweep job (required)',
          signed_tx: 'Signed transaction in hex format (required)',
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // POST: トランザクションブロードキャスト
  if (request.method === 'POST') {
    try {
      // リクエストボディ解析
      const body = await request.json();
      const { job_id, signed_tx } = body;

      if (!job_id) {
        return new Response(
          JSON.stringify({ error: 'job_id is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!signed_tx) {
        return new Response(
          JSON.stringify({ error: 'signed_tx is required' }),
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

      // 2. チェーン別ビルダーを取得
      const builder = ChainTxBuilderFactory.create(job.chain);

      // 3. BroadcastParamsを構築
      const broadcastParams: BroadcastParams = {
        chain: job.chain,
        network: job.network,
        signedTx: signed_tx,
      };

      // 4. トランザクションブロードキャスト（チェーン非依存）
      const broadcastResult = await builder.broadcastTx(broadcastParams);
      const transactionHash = broadcastResult.transactionHash;

      // 5. sweep_job更新
      const now = new Date().toISOString();
      await client
        .from('sweep_jobs')
        .update({
          status: 'broadcast',
          transaction_hash: transactionHash,
          broadcasted_at: now,
        })
        .eq('id', job_id);

      // 6. レスポンス返却
      return new Response(
        JSON.stringify({
          success: true,
          transaction_hash: transactionHash,
          metadata: {
            job_id,
            chain: job.chain,
            network: job.network,
            broadcasted_at: now,
            ...broadcastResult.metadata,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    } catch (error) {
      console.error('Error broadcasting transaction:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
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
