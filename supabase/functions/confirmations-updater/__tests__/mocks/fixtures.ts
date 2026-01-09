/**
 * confirmations-updater テスト用フィクスチャ
 * 決定論的なテストデータを提供
 */

export const TEST_USER_ID = 'user-test-123';

// トランザクションハッシュ
export const TEST_TX_HASHES = {
  evm_ethereum: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  evm_sepolia: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  btc_mainnet: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd',
  btc_testnet: 'b2c3d4e5f678901234567890123456789012345678901234567890123456bcde',
  tron_mainnet: 'c3d4e5f67890123456789012345678901234567890123456789012345678cdef',
  tron_shasta: 'd4e5f678901234567890123456789012345678901234567890123456789defa',
  ada_mainnet: 'e5f6789012345678901234567890123456789012345678901234567890efab',
  ada_testnet: 'f67890123456789012345678901234567890123456789012345678901fabc',
};

// ブロック番号
export const TEST_BLOCK_HEIGHTS = {
  evm_current: 1000,
  evm_tx_block: 990,
  btc_current: 800000,
  btc_tx_block: 799990,
  tron_current: 50000000,
  tron_tx_block: 49999980,
  ada_confirmations: 15,
};

// テスト用deposit_transaction
export const createMockDepositTransaction = (
  chain: string,
  network: string,
  asset: string,
  txHash: string,
  confirmations = 0,
  required = 12
) => ({
  id: `tx-${chain}-${network}-001`,
  user_id: TEST_USER_ID,
  chain,
  network,
  asset,
  transaction_hash: txHash,
  amount: '1.5',
  status: 'pending',
  confirmations,
  required_confirmations: required,
  created_at: new Date().toISOString(),
});

// テスト用deposit
export const createMockDeposit = (
  chain: string,
  network: string,
  asset: string,
  txHash: string
) => ({
  id: `deposit-${chain}-${network}-001`,
  user_id: TEST_USER_ID,
  chain,
  network,
  asset,
  transaction_hash: txHash,
  wallet_address: '0x1234567890123456789012345678901234567890',
  amount: '1.5',
  status: 'pending',
  confirmations_observed: 0,
  confirmations_required: 12,
  created_at: new Date().toISOString(),
});

// テスト用user_asset
export const createMockUserAsset = (
  currency: string,
  balance = '100.0'
) => ({
  id: `asset-${currency}-001`,
  user_id: TEST_USER_ID,
  currency,
  balance,
  locked_balance: '0',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// RPC/APIレスポンスモック
export const MOCK_RPC_RESPONSES = {
  // EVM
  eth_blockNumber: { jsonrpc: '2.0', id: 1, result: '0x3e8' }, // 1000
  eth_getTransactionReceipt: {
    jsonrpc: '2.0',
    id: 2,
    result: {
      blockNumber: '0x3de', // 990
      status: '0x1',
      transactionHash: TEST_TX_HASHES.evm_ethereum,
    },
  },

  // Bitcoin (Blockstream API)
  btc_tip_height: '800000',
  btc_tx_detail: {
    status: {
      confirmed: true,
      block_height: 799990,
      block_hash: 'blockhash123',
    },
  },

  // Tron (TronGrid API)
  tron_nowblock: {
    block_header: {
      raw_data: {
        number: 50000000,
      },
    },
  },
  tron_tx_detail: {
    data: [{
      blockNumber: 49999980,
      ret: [{ contractRet: 'SUCCESS' }],
    }],
  },

  // Cardano (Blockfrost API)
  ada_tx_detail: {
    block_height: 8000000,
    confirmations: 15,
    hash: TEST_TX_HASHES.ada_mainnet,
  },
};
