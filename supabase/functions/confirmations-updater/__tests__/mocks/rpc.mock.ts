/**
 * RPC/APIモック（confirmations-updater用）
 * EVM, Bitcoin, Tron, Cardano APIをモック化
 */

import { MOCK_RPC_RESPONSES, TEST_TX_HASHES } from './fixtures.ts';

type MockBehavior = 'success' | 'error' | 'custom';

class MockRpcState {
  behavior: MockBehavior = 'success';
  customResponse: any = null;

  reset() {
    this.behavior = 'success';
    this.customResponse = null;
  }

  setBehavior(behavior: MockBehavior, customResponse?: any) {
    this.behavior = behavior;
    this.customResponse = customResponse || null;
  }
}

export const mockRpcState = new MockRpcState();

/**
 * グローバルfetchをモック化
 */
export function setupMockFetch() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    // EVMReleated
    if (url.includes('ethereum') || url.includes('sepolia')) {
      return handleEvmRpc(url, init);
    }

    // Bitcoin (Blockstream)
    if (url.includes('blockstream.info')) {
      return handleBitcoinApi(url);
    }

    // Tron (TronGrid)
    if (url.includes('trongrid.io')) {
      return handleTronApi(url, init);
    }

    // Cardano (Blockfrost)
    if (url.includes('blockfrost.io')) {
      return handleCardanoApi(url, init);
    }

    return new Response(JSON.stringify({ error: 'Unknown API' }), { status: 404 });
  };
}

/**
 * EVM RPC (eth_blockNumber, eth_getTransactionReceipt)
 */
function handleEvmRpc(url: string, init?: RequestInit): Response {
  if (mockRpcState.behavior === 'error') {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'RPC error' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (mockRpcState.behavior === 'custom' && mockRpcState.customResponse) {
    return new Response(
      JSON.stringify(mockRpcState.customResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = init?.body ? JSON.parse(init.body as string) : {};
  const method = body.method;

  if (method === 'eth_blockNumber') {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.eth_blockNumber),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (method === 'eth_getTransactionReceipt') {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.eth_getTransactionReceipt),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'Unknown method' } }),
    { status: 200 }
  );
}

/**
 * Bitcoin API (Blockstream)
 */
function handleBitcoinApi(url: string): Response {
  if (mockRpcState.behavior === 'error') {
    return new Response('API error', { status: 500 });
  }

  if (mockRpcState.behavior === 'custom' && mockRpcState.customResponse) {
    if (url.includes('/blocks/tip/height')) {
      return new Response(String(mockRpcState.customResponse), { status: 200 });
    }
    return new Response(
      JSON.stringify(mockRpcState.customResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // /blocks/tip/height
  if (url.includes('/blocks/tip/height')) {
    return new Response(MOCK_RPC_RESPONSES.btc_tip_height, { status: 200 });
  }

  // /tx/{txHash}
  if (url.includes('/api/tx/')) {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.btc_tx_detail),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response('Not found', { status: 404 });
}

/**
 * Tron API (TronGrid)
 */
function handleTronApi(url: string, init?: RequestInit): Response {
  if (mockRpcState.behavior === 'error') {
    return new Response(
      JSON.stringify({ error: 'TronGrid error' }),
      { status: 500 }
    );
  }

  if (mockRpcState.behavior === 'custom' && mockRpcState.customResponse) {
    return new Response(
      JSON.stringify(mockRpcState.customResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // /wallet/getnowblock
  if (url.includes('/wallet/getnowblock')) {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.tron_nowblock),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // /v1/transactions/{txid}
  if (url.includes('/v1/transactions/')) {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.tron_tx_detail),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ error: 'Unknown endpoint' }), { status: 404 });
}

/**
 * Cardano API (Blockfrost)
 */
function handleCardanoApi(url: string, init?: RequestInit): Response {
  if (mockRpcState.behavior === 'error') {
    return new Response(
      JSON.stringify({ error: 'Blockfrost error' }),
      { status: 500 }
    );
  }

  if (mockRpcState.behavior === 'custom' && mockRpcState.customResponse) {
    return new Response(
      JSON.stringify(mockRpcState.customResponse),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // /api/v0/txs/{txHash}
  if (url.includes('/api/v0/txs/')) {
    return new Response(
      JSON.stringify(MOCK_RPC_RESPONSES.ada_tx_detail),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ error: 'Unknown endpoint' }), { status: 404 });
}

export const mockRpcFactory = {
  setup: setupMockFetch,
  getState: () => mockRpcState,
  resetState: () => mockRpcState.reset(),
  setBehavior: (behavior: MockBehavior, customResponse?: any) => {
    mockRpcState.setBehavior(behavior, customResponse);
  },
};
