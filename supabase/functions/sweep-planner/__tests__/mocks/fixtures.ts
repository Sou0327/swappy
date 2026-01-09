/**
 * sweep-planner テスト用フィクスチャ
 * 決定論的なテストデータを提供
 */

export const TEST_USER_ID = 'user-test-123';

// テスト用アドレス
export const TEST_ADDRESSES = {
  from_deposit_1: '0x1111111111111111111111111111111111111111',
  from_deposit_2: '0x2222222222222222222222222222222222222222',
  from_deposit_3: '0x3333333333333333333333333333333333333333',
  admin_ethereum: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  admin_sepolia: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
};

// テスト用deposit (confirmed状態)
export const createMockDeposit = (
  network: 'ethereum' | 'sepolia',
  walletAddress: string,
  amount = '1.5',
  id?: string
) => ({
  id: id || `deposit-${network}-001`,
  user_id: TEST_USER_ID,
  chain: 'evm',
  network,
  asset: 'ETH',
  wallet_address: walletAddress,
  amount,
  status: 'confirmed',
  transaction_hash: `0xdeadbeef${network}${walletAddress.slice(2, 10)}`,
  confirmations_observed: 15,
  confirmations_required: 12,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// テスト用admin_wallet
export const createMockAdminWallet = (
  network: 'ethereum' | 'sepolia',
  active = true
) => ({
  id: `admin-wallet-${network}`,
  chain: 'evm',
  network,
  asset: 'ETH',
  address: network === 'ethereum' ? TEST_ADDRESSES.admin_ethereum : TEST_ADDRESSES.admin_sepolia,
  active,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// テスト用sweep_job
export const createMockSweepJob = (
  depositId: string,
  network: 'ethereum' | 'sepolia',
  status: 'planned' | 'signed' | 'broadcast' | 'confirmed' | 'failed' = 'planned',
  fromAddress?: string
) => ({
  id: `sweep-job-${depositId}`,
  deposit_id: depositId,
  chain: 'evm',
  network,
  asset: 'ETH',
  from_address: fromAddress || TEST_ADDRESSES.from_deposit_1,
  to_address: network === 'ethereum' ? TEST_ADDRESSES.admin_ethereum : TEST_ADDRESSES.admin_sepolia,
  planned_amount: 0.5,
  currency: 'ETH',
  status,
  unsigned_tx: null,
  signed_tx: null,
  broadcast_tx_hash: null,
  confirmations: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// RPC/APIレスポンスモック
export const MOCK_RPC_RESPONSES = {
  // eth_getBalance: 2 ETH (十分な残高)
  eth_getBalance_sufficient: '0x1bc16d674ec80000', // 2 ETH in wei

  // eth_getBalance: 0.00001 ETH (ガス不足)
  eth_getBalance_insufficient: '0x2386f26fc10000', // 0.00001 ETH in wei

  // eth_getTransactionCount (nonce)
  eth_getTransactionCount: '0x0', // nonce 0

  // eth_gasPrice (20 gwei)
  eth_gasPrice: '0x4a817c800', // 20 gwei

  // 実際のRPCレスポンス形式
  standard_balance_response: {
    jsonrpc: '2.0',
    id: 1,
    result: '0x1bc16d674ec80000' // 2 ETH
  },

  insufficient_balance_response: {
    jsonrpc: '2.0',
    id: 1,
    result: '0x2386f26fc10000' // 0.00001 ETH
  },

  nonce_response: {
    jsonrpc: '2.0',
    id: 1,
    result: '0x0'
  },

  gas_price_response: {
    jsonrpc: '2.0',
    id: 1,
    result: '0x4a817c800' // 20 gwei
  },

  rpc_error_response: {
    jsonrpc: '2.0',
    id: 1,
    error: {
      message: 'RPC connection failed',
      code: -32603
    }
  }
};

// ガス計算用定数
export const GAS_CONSTANTS = {
  gas_limit: 21000n,
  gas_price_gwei: 20n,
  gas_price_wei: 20000000000n, // 20 gwei
  gas_cost_wei: 420000000000000n, // 21000 * 20 gwei = 0.00042 ETH
  balance_sufficient_wei: 2000000000000000000n, // 2 ETH
  balance_insufficient_wei: 10000000000000n, // 0.00001 ETH
  expected_sweep_amount_wei: 1999580000000000000n, // 2 ETH - 0.00042 ETH = 1.99958 ETH
};

// ChainID
export const CHAIN_IDS = {
  ethereum: 1,
  sepolia: 11155111,
};

// 期待されるunsigned_tx構造
export const createExpectedUnsignedTx = (
  from: string,
  to: string,
  network: 'ethereum' | 'sepolia',
  valueWei: bigint = GAS_CONSTANTS.expected_sweep_amount_wei
) => ({
  from,
  to,
  value: '0x' + valueWei.toString(16),
  gas: '0x5208', // 21000
  gasPrice: MOCK_RPC_RESPONSES.eth_gasPrice,
  nonce: MOCK_RPC_RESPONSES.eth_getTransactionCount,
  chainId: CHAIN_IDS[network],
});
