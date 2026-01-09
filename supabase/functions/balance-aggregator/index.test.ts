import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { describe, it, beforeEach, afterEach } from 'https://deno.land/std@0.192.0/testing/bdd.ts';
import { handleRequest } from './index.ts';

// モック設定
let mockSupabaseClient: Record<string, unknown>;
let mockFetch: typeof globalThis.fetch;

beforeEach(() => {
  // Supabase clientのモック
  mockSupabaseClient = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          data: [],
          error: null
        })
      })
    })
  };

  // fetchのモック保存
  mockFetch = globalThis.fetch;
});

afterEach(() => {
  // fetch復元
  globalThis.fetch = mockFetch;
});

describe('balance-aggregator Edge Function', () => {
  describe('GET request', () => {
    it('機能説明を返す', async () => {
      const response = await handleRequest(new Request('http://localhost', { method: 'GET' }));
      const data = await response.json();

      assertEquals(response.status, 200);
      assertExists(data.message);
      assertExists(data.version);
      assertEquals(data.message, 'Balance Aggregator');
    });
  });

  describe('POST request - EVM chains', () => {
    it('deposit_addressesからアドレス一覧を取得する', async () => {
      const mockAddresses = [
        {
          id: '1',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          address: '0x1234567890123456789012345678901234567890',
          user_id: 'user-1'
        },
        {
          id: '2',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          address: '0x2345678901234567890123456789012345678901',
          user_id: 'user-2'
        }
      ];

      mockSupabaseClient.from = (table: string) => ({
        select: () => ({
          eq: () => Promise.resolve({
            data: table === 'deposit_addresses' ? mockAddresses : [],
            error: null
          })
        })
      });

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: 'evm', network: 'ethereum', asset: 'ETH' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.success, true);
      assertExists(data.addresses);
      assertEquals(data.addresses.length, 2);
    });

    it('RPC経由で各アドレスの残高を取得する', async () => {
      const mockAddresses = [
        {
          id: '1',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          address: '0x1234567890123456789012345678901234567890',
          user_id: 'user-1'
        }
      ];

      mockSupabaseClient.from = () => ({
        select: () => ({
          eq: () => Promise.resolve({
            data: mockAddresses,
            error: null
          })
        })
      });

      // eth_getBalance RPCモック
      globalThis.fetch = async (url: string | Request, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

        if (body.method === 'eth_getBalance') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x1bc16d674ec80000' // 2 ETH in wei
          }));
        }

        return new Response(JSON.stringify({ error: 'Unknown method' }), { status: 400 });
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: 'evm', network: 'ethereum', asset: 'ETH' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.success, true);
      assertExists(data.balances);
      assertEquals(data.balances.length, 1);
      assertEquals(data.balances[0].balance, '2.0'); // 2 ETH
    });

    it('チェーン/アセット別に残高を集計する', async () => {
      const mockAddresses = [
        {
          id: '1',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          address: '0x1234567890123456789012345678901234567890',
          user_id: 'user-1'
        },
        {
          id: '2',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          address: '0x2345678901234567890123456789012345678901',
          user_id: 'user-2'
        }
      ];

      mockSupabaseClient.from = () => ({
        select: () => ({
          eq: () => Promise.resolve({
            data: mockAddresses,
            error: null
          })
        })
      });

      globalThis.fetch = async (url: string | Request, init?: RequestInit) => {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: '0xde0b6b3a7640000' // 1 ETH in wei
        }));
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: 'evm', network: 'ethereum', asset: 'ETH' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.success, true);
      assertExists(data.summary);
      assertEquals(data.summary.totalBalance, '2.0'); // 1 ETH + 1 ETH = 2 ETH
      assertEquals(data.summary.addressCount, 2);
    });

    it('RPC呼び出し失敗時にエラーハンドリングする', async () => {
      const mockAddresses = [
        {
          id: '1',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          address: '0x1234567890123456789012345678901234567890',
          user_id: 'user-1'
        }
      ];

      mockSupabaseClient.from = () => ({
        select: () => ({
          eq: () => Promise.resolve({
            data: mockAddresses,
            error: null
          })
        })
      });

      // RPC失敗をシミュレート
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32000, message: 'Internal error' }
        }));
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: 'evm', network: 'ethereum', asset: 'ETH' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.success, true);
      // エラーがあってもレスポンスは返し、個別の残高にエラー情報を含める
      assertExists(data.balances);
      assertEquals(data.balances[0].error, 'Internal error');
    });
  });

  describe('POST request - filter by chain/network/asset', () => {
    it('chain指定でフィルタリングする', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: 'evm' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.success, true);
    });
  });
});
