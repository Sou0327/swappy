/**
 * RPC/APIモック（sweep-planner用）
 * EVM RPC (eth_getBalance, eth_getTransactionCount, eth_gasPrice) をモック化
 */

import { MOCK_RPC_RESPONSES } from './fixtures.ts';

type MockBehavior = 'success' | 'error' | 'insufficient_gas' | 'custom';

class MockRpcState {
  behavior: MockBehavior = 'success';
  customResponses: Map<string, any> = new Map();

  reset() {
    this.behavior = 'success';
    this.customResponses.clear();
  }

  setBehavior(behavior: MockBehavior, customResponses?: Record<string, any>) {
    this.behavior = behavior;
    if (customResponses) {
      Object.entries(customResponses).forEach(([method, response]) => {
        this.customResponses.set(method, response);
      });
    }
  }

  getCustomResponse(method: string): any | null {
    return this.customResponses.get(method) || null;
  }
}

export const mockRpcState = new MockRpcState();

/**
 * グローバルfetchをモック化
 */
export function setupMockFetch() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    // EVM RPC
    if (url.includes('ethereum') || url.includes('sepolia')) {
      return handleEvmRpc(url, init);
    }

    return new Response(JSON.stringify({ error: 'Unknown API' }), { status: 404 });
  };
}

/**
 * EVM RPC (eth_getBalance, eth_getTransactionCount, eth_gasPrice)
 */
function handleEvmRpc(url: string, init?: RequestInit): Response {
  // エラーモード
  if (mockRpcState.behavior === 'error') {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.rpc_error_response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = init?.body ? JSON.parse(init.body as string) : {};
  const method = body.method;

  // カスタムレスポンス優先
  const customResponse = mockRpcState.getCustomResponse(method);
  if (customResponse) {
    return new Response(
      JSON.stringify(customResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // eth_getBalance
  if (method === 'eth_getBalance') {
    const response = mockRpcState.behavior === 'insufficient_gas'
      ? MOCK_RPC_RESPONSES.insufficient_balance_response
      : MOCK_RPC_RESPONSES.standard_balance_response;

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // eth_getTransactionCount (nonce)
  if (method === 'eth_getTransactionCount') {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.nonce_response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // eth_gasPrice
  if (method === 'eth_gasPrice') {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.gas_price_response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 不明なメソッド
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { message: 'Unknown method', code: -32601 }
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export const mockRpcFactory = {
  setup: setupMockFetch,
  getState: () => mockRpcState,
  resetState: () => mockRpcState.reset(),
  setBehavior: (behavior: MockBehavior, customResponses?: Record<string, any>) => {
    mockRpcState.setBehavior(behavior, customResponses);
  },
};
