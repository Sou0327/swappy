/**
 * Sweep Broadcast Edge Function - Test Suite (TDD Red Phase)
 *
 * 署名済みトランザクションをブロードキャストしてブロックチェーンに送信する
 *
 * TDDフロー:
 * 1. このテストを作成（Red - 失敗することを確認）
 * 2. index.tsを実装（Green - テスト通過）
 * 3. リファクタリング（Refactor - コード改善）
 */

import { describe, it, beforeEach } from 'https://deno.land/std@0.192.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { handleRequest } from './index.ts';

describe('sweep-broadcast Edge Function', () => {
  let mockSupabaseClient: Record<string, unknown>;
  const mockJob = {
    id: 'job-123',
    chain: 'evm',
    network: 'sepolia',
    deposit_id: 'deposit-456',
    status: 'pending',
    unsigned_tx: '{"from":"0x123","to":"0xabc","value":"0x1"}',
    tx_generated_at: '2024-01-01T00:00:00Z',
    deposit_index: 5,
  };

  beforeEach(() => {
    // 環境変数設定
    Deno.env.set('ETHEREUM_SEPOLIA_RPC_URL', 'https://sepolia.example.com');
    Deno.env.set('ETHEREUM_ETHEREUM_RPC_URL', 'https://ethereum.example.com');

    // Supabaseクライアントのモック
    mockSupabaseClient = {
      from: (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => Promise.resolve({
                data: { ...mockJob, status: 'broadcast' },
                error: null,
              }),
            }),
          };
        }
        return {};
      },
    };

    // Fetch APIのモック（RPC呼び出し用）
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

      // eth_sendRawTransaction: トランザクションハッシュを返す
      if (body.method === 'eth_sendRawTransaction') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // デフォルト（エラー）
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'Unknown method' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
  });

  describe('GET request', () => {
    it('機能説明を返す', async () => {
      const request = new Request('http://localhost/sweep-broadcast', {
        method: 'GET',
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.message, 'Sweep Broadcast');
      assertEquals(data.version, '1.0.0');
    });
  });

  describe('POST request - 正常系', () => {
    it('有効なjob_idとsigned_txでブロードキャスト成功', async () => {
      const requestBody = {
        job_id: 'job-123',
        signed_tx: '0xf86c808504a817c800825208940xabc85208940xabc85208940xabc8502088083989680801ba0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0',
      };

      const request = new Request('http://localhost/sweep-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.success, true);
      assertEquals(
        data.transaction_hash,
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      );
    });
  });

  describe('POST request - エラー系', () => {
    it('job_idが指定されていない場合400エラーを返す', async () => {
      const requestBody = {
        signed_tx: '0xf86c...',
      };

      const request = new Request('http://localhost/sweep-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 400);
      assertEquals(data.error, 'job_id is required');
    });

    it('signed_txが指定されていない場合400エラーを返す', async () => {
      const requestBody = {
        job_id: 'job-123',
      };

      const request = new Request('http://localhost/sweep-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 400);
      assertEquals(data.error, 'signed_tx is required');
    });

    it('ジョブが見つからない場合404エラーを返す', async () => {
      // モックを上書き（ジョブが見つからない）
      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: null,
                  error: { code: 'PGRST116', message: 'not found' },
                }),
              }),
            }),
          };
        }
        return {};
      };

      const requestBody = {
        job_id: 'invalid-job',
        signed_tx: '0xf86c...',
      };

      const request = new Request('http://localhost/sweep-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 404);
      assertEquals(data.error, 'Job not found');
    });

    it('RPC送信失敗時に500エラーを返す', async () => {
      // Fetch APIのモックを上書き（RPC失敗）
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

        if (body.method === 'eth_sendRawTransaction') {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              error: { message: 'Transaction failed' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'Unknown method' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const requestBody = {
        job_id: 'job-123',
        signed_tx: '0xf86c...',
      };

      const request = new Request('http://localhost/sweep-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 500);
      assertEquals(data.error, 'RPC error for evm at https://sepolia.example.com: Failed to broadcast transaction: Transaction failed');
    });
  });

  describe('POST request - ネットワーク検証', () => {
    it('Sepoliaネットワークで正しいRPC URLを使用', async () => {
      let capturedUrl = '';

      // Fetch APIのモックを上書き（URL確認用）
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = input.toString();

        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const requestBody = {
        job_id: 'job-123',
        signed_tx: '0xf86c...',
      };

      const request = new Request('http://localhost/sweep-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      await handleRequest(request, mockSupabaseClient);

      assertEquals(capturedUrl, 'https://sepolia.example.com');
    });

    it('Ethereumネットワークで正しいRPC URLを使用', async () => {
      // モックを上書き（Ethereumネットワーク）
      const ethereumJob = { ...mockJob, network: 'ethereum' };
      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: ethereumJob,
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => Promise.resolve({
                data: { ...ethereumJob, status: 'broadcast' },
                error: null,
              }),
            }),
          };
        }
        return {};
      };

      let capturedUrl = '';

      // Fetch APIのモックを上書き（URL確認用）
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = input.toString();

        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const requestBody = {
        job_id: 'job-123',
        signed_tx: '0xf86c...',
      };

      const request = new Request('http://localhost/sweep-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      await handleRequest(request, mockSupabaseClient);

      assertEquals(capturedUrl, 'https://ethereum.example.com');
    });
  });
});
