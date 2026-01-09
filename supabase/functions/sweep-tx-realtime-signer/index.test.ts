/**
 * sweep-tx-realtime-signer Edge Function - Unit Test (TDD Red Phase)
 *
 * テスト対象: supabase/functions/sweep-tx-realtime-signer/index.ts
 *
 * TDDフロー:
 * 1. このテストを作成（Red - 失敗することを確認）
 * 2. index.tsを実装（Green - テスト通過）
 * 3. リファクタリング（Refactor - コード改善）
 *
 * 機能:
 * - sweep_jobに対してリアルタイムでunsigned_txを生成
 * - EVM チェーン対応（Ethereum, Sepolia等）
 * - nonce、gasPrice、balanceを最新値で取得
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { describe, it, beforeEach, afterEach } from 'https://deno.land/std@0.192.0/testing/bdd.ts';
import { handleRequest } from './index.ts';

// モック設定
let mockSupabaseClient: Record<string, unknown>;
let mockFetch: typeof globalThis.fetch;

beforeEach(() => {
  // 環境変数設定（RPC URL）
  Deno.env.set('ETHEREUM_SEPOLIA_RPC_URL', 'https://sepolia.example.com');
  Deno.env.set('ETHEREUM_ETHEREUM_RPC_URL', 'https://ethereum.example.com');

  // Supabase clientのモック
  mockSupabaseClient = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          data: [],
          error: null
        }),
        single: () => ({
          data: null,
          error: null
        })
      }),
      update: () => ({
        eq: () => ({
          data: null,
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

describe('sweep-tx-realtime-signer Edge Function', () => {
  describe('GET request', () => {
    it('機能説明を返す', async () => {
      const response = await handleRequest(new Request('http://localhost', { method: 'GET' }));
      const data = await response.json();

      assertEquals(response.status, 200);
      assertExists(data.message);
      assertExists(data.version);
      assertEquals(data.message, 'Sweep TX Real-time Signer');
    });
  });

  describe('POST request - 正常系', () => {
    it('有効なジョブIDでunsigned_txを生成する', async () => {
      // モックデータ
      const mockJob = {
        id: 'job-123',
        deposit_id: 'deposit-456',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH',
        from_address: '0x1234567890123456789012345678901234567890',
        to_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        status: 'pending'
      };

      const mockDeposit = {
        id: 'deposit-456',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH',
        address: '0x1234567890123456789012345678901234567890',
        balance: '1000000000000000000', // 1 ETH in wei
        user_id: 'user-1',
        deposit_index: 5
      };

      const mockWalletRoot = {
        id: 'root-1',
        chain: 'evm',
        network: 'sepolia',
        root_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        master_key_encrypted: 'encrypted...'
      };

      // Supabase モック設定
      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null
                })
              })
            }),
            update: (data: Record<string, unknown>) => ({
              eq: () => Promise.resolve({
                data: { ...mockJob, ...data },
                error: null
              })
            })
          };
        }
        if (table === 'deposits') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockDeposit,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'wallet_roots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({
                    data: mockWalletRoot,
                    error: null
                  })
                })
              })
            })
          };
        }
        return { select: () => ({}) };
      };

      // RPC モック（nonce, gasPrice取得）
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

        if (body.method === 'eth_getTransactionCount') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x5' // nonce = 5
          }));
        }

        if (body.method === 'eth_gasPrice') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x4a817c800' // 20 gwei
          }));
        }

        return new Response(JSON.stringify({ error: 'Unknown method' }), { status: 400 });
      };

      // リクエスト実行
      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'job-123' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      // アサーション
      assertEquals(response.status, 200);
      assertEquals(data.success, true);
      assertExists(data.unsigned_tx);
      assertEquals(data.unsigned_tx.from, mockDeposit.address);
      assertEquals(data.unsigned_tx.to, mockWalletRoot.root_address);
      assertEquals(data.unsigned_tx.nonce, '0x5');
      assertEquals(data.unsigned_tx.gasPrice, '0x4a817c800');
      assertEquals(data.unsigned_tx.chainId, 11155111); // Sepolia
      assertExists(data.unsigned_tx.value);
      assertExists(data.unsigned_tx.gas);
    });
  });

  describe('POST request - エラー系', () => {
    it('job_idが指定されていない場合400エラーを返す', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // job_id なし
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 400);
      assertEquals(data.error, 'job_id is required');
    });

    it('ジョブが見つからない場合404エラーを返す', async () => {
      mockSupabaseClient.from = (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: null,
              error: { code: 'PGRST116', message: 'not found' }
            })
          })
        })
      });

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'job-nonexistent' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 404);
      assertEquals(data.error, 'Job not found');
    });

    it('入金が見つからない場合404エラーを返す', async () => {
      const mockJob = {
        id: 'job-123',
        deposit_id: 'deposit-456',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH'
      };

      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposits') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: null,
                  error: { code: 'PGRST116', message: 'not found' }
                })
              })
            })
          };
        }
        return { select: () => ({}) };
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'job-123' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 404);
      assertEquals(data.error, 'Deposit not found');
    });

    it('wallet_rootが見つからない場合404エラーを返す', async () => {
      const mockJob = {
        id: 'job-123',
        deposit_id: 'deposit-456',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH'
      };

      const mockDeposit = {
        id: 'deposit-456',
        address: '0x1234567890123456789012345678901234567890',
        balance: '1000000000000000000',
        deposit_index: 5
      };

      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposits') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockDeposit,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'wallet_roots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({
                    data: null,
                    error: { code: 'PGRST116', message: 'not found' }
                  })
                })
              })
            })
          };
        }
        return { select: () => ({}) };
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'job-123' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 404);
      assertEquals(data.error, 'Wallet root not found');
    });

    it('残高不足の場合400エラーを返す', async () => {
      const mockJob = {
        id: 'job-123',
        deposit_id: 'deposit-456',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH'
      };

      const mockDeposit = {
        id: 'deposit-456',
        address: '0x1234567890123456789012345678901234567890',
        balance: '100', // 極小残高
        deposit_index: 5
      };

      const mockWalletRoot = {
        id: 'root-1',
        root_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      };

      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposits') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockDeposit,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'wallet_roots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({
                    data: mockWalletRoot,
                    error: null
                  })
                })
              })
            })
          };
        }
        return { select: () => ({}) };
      };

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

        if (body.method === 'eth_getTransactionCount') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x0'
          }));
        }

        if (body.method === 'eth_gasPrice') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x4a817c800' // 20 gwei
          }));
        }

        return new Response(JSON.stringify({ error: 'Unknown method' }), { status: 400 });
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'job-123' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 400);
      assertExists(data.error);
      assertEquals(data.error.includes('Insufficient balance'), true);
    });

    it('nonce取得失敗時に500エラーを返す', async () => {
      const mockJob = {
        id: 'job-123',
        deposit_id: 'deposit-456',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH'
      };

      const mockDeposit = {
        id: 'deposit-456',
        address: '0x1234567890123456789012345678901234567890',
        balance: '1000000000000000000',
        deposit_index: 5
      };

      const mockWalletRoot = {
        id: 'root-1',
        root_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      };

      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposits') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockDeposit,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'wallet_roots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({
                    data: mockWalletRoot,
                    error: null
                  })
                })
              })
            })
          };
        }
        return { select: () => ({}) };
      };

      // nonce取得エラー
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
        body: JSON.stringify({ job_id: 'job-123' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 500);
      assertExists(data.error);
      assertEquals(data.error.includes('Internal error'), true);
    });

    it('gasPrice取得失敗時に500エラーを返す', async () => {
      const mockJob = {
        id: 'job-123',
        deposit_id: 'deposit-456',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH'
      };

      const mockDeposit = {
        id: 'deposit-456',
        address: '0x1234567890123456789012345678901234567890',
        balance: '1000000000000000000',
        deposit_index: 5
      };

      const mockWalletRoot = {
        id: 'root-1',
        root_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      };

      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposits') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockDeposit,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'wallet_roots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({
                    data: mockWalletRoot,
                    error: null
                  })
                })
              })
            })
          };
        }
        return { select: () => ({}) };
      };

      // nonce成功、gasPrice失敗
      let callCount = 0;
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        callCount++;

        if (body.method === 'eth_getTransactionCount') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x5'
          }));
        }

        if (body.method === 'eth_gasPrice') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32000, message: 'Gas price error' }
          }));
        }

        return new Response(JSON.stringify({ error: 'Unknown method' }), { status: 400 });
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'job-123' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 500);
      assertExists(data.error);
      assertEquals(data.error.includes('Gas price'), true);
    });
  });

  describe('POST request - chainId検証', () => {
    it('Sepolia (chainId: 11155111) を正しく設定する', async () => {
      const mockJob = {
        id: 'job-123',
        deposit_id: 'deposit-456',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH'
      };

      const mockDeposit = {
        id: 'deposit-456',
        address: '0x1234567890123456789012345678901234567890',
        balance: '1000000000000000000',
        deposit_index: 5
      };

      const mockWalletRoot = {
        id: 'root-1',
        root_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      };

      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null
                })
              })
            }),
            update: (data: Record<string, unknown>) => ({
              eq: () => Promise.resolve({
                data: { ...mockJob, ...data },
                error: null
              })
            })
          };
        }
        if (table === 'deposits') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockDeposit,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'wallet_roots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({
                    data: mockWalletRoot,
                    error: null
                  })
                })
              })
            })
          };
        }
        return { select: () => ({}) };
      };

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

        if (body.method === 'eth_getTransactionCount') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x5'
          }));
        }

        if (body.method === 'eth_gasPrice') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x4a817c800'
          }));
        }

        return new Response(JSON.stringify({ error: 'Unknown method' }), { status: 400 });
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'job-123' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.unsigned_tx.chainId, 11155111);
    });

    it('Ethereum mainnet (chainId: 1) を正しく設定する', async () => {
      const mockJob = {
        id: 'job-123',
        deposit_id: 'deposit-456',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH'
      };

      const mockDeposit = {
        id: 'deposit-456',
        address: '0x1234567890123456789012345678901234567890',
        balance: '1000000000000000000',
        deposit_index: 5
      };

      const mockWalletRoot = {
        id: 'root-1',
        root_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      };

      mockSupabaseClient.from = (table: string) => {
        if (table === 'sweep_jobs') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockJob,
                  error: null
                })
              })
            }),
            update: (data: Record<string, unknown>) => ({
              eq: () => Promise.resolve({
                data: { ...mockJob, ...data },
                error: null
              })
            })
          };
        }
        if (table === 'deposits') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: mockDeposit,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'wallet_roots') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({
                    data: mockWalletRoot,
                    error: null
                  })
                })
              })
            })
          };
        }
        return { select: () => ({}) };
      };

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

        if (body.method === 'eth_getTransactionCount') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x5'
          }));
        }

        if (body.method === 'eth_gasPrice') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: '0x4a817c800'
          }));
        }

        return new Response(JSON.stringify({ error: 'Unknown method' }), { status: 400 });
      };

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'job-123' })
      });

      const response = await handleRequest(request, mockSupabaseClient);
      const data = await response.json();

      assertEquals(response.status, 200);
      assertEquals(data.unsigned_tx.chainId, 1);
    });
  });
});
