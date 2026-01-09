import { vi } from 'vitest'

/**
 * Tatum APIモック
 * マルチチェーン対応のウォレット・トランザクションモック
 */

// BTC関連モック
export const mockBitcoinAddress = {
  address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  privateKey: 'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ',
  xpub: 'xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz'
}

export const mockBitcoinTransaction = {
  txid: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
  hash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
  version: 2,
  size: 225,
  vsize: 144,
  weight: 573,
  locktime: 0,
  vin: [{
    txid: 'prev-tx-id',
    vout: 0,
    scriptSig: { asm: '', hex: '' },
    sequence: 4294967295
  }],
  vout: [{
    value: 0.001,
    n: 0,
    scriptPubKey: {
      asm: 'OP_DUP OP_HASH160',
      hex: '76a914',
      type: 'pubkeyhash',
      addresses: [mockBitcoinAddress.address]
    }
  }],
  hex: '',
  confirmations: 6
}

// ETH関連モック
export const mockEthereumAddress = {
  address: '0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2',
  privateKey: '0x4646464646464646464646464646464646464646464646464646464646464646'
}

export const mockEthereumTransaction = {
  hash: '0xa1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0',
  from: mockEthereumAddress.address,
  to: '0x123456789abcdef123456789abcdef123456789a',
  value: '1000000000000000000', // 1 ETH in wei
  gas: '21000',
  gasPrice: '20000000000',
  nonce: 1,
  blockNumber: 1234567,
  confirmations: 12
}

// XRP関連モック
export const mockXrpAddress = {
  address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
  secret: 'sn3nxiW7v8KXzPzAqzyHXbSSKNuN9',
  classicAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'
}

export const mockXrpTransaction = {
  id: '1',
  type: 'payment',
  account: mockXrpAddress.address,
  destination: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY',
  amount: {
    currency: 'XRP',
    value: '100',
    issuer: ''
  },
  fee: '12',
  sequence: 1,
  lastLedgerSequence: 1234567,
  validated: true
}

// Tatum SDKモック
export const mockTatumBitcoin = {
  generateAddress: vi.fn(() => Promise.resolve(mockBitcoinAddress)),
  generatePrivateKey: vi.fn(() => Promise.resolve(mockBitcoinAddress.privateKey)),
  getTransaction: vi.fn(() => Promise.resolve(mockBitcoinTransaction)),
  getBalance: vi.fn(() => Promise.resolve({ incoming: '0.001', outgoing: '0' }))
}

export const mockTatumEthereum = {
  generateAddress: vi.fn(() => Promise.resolve(mockEthereumAddress)),
  generatePrivateKey: vi.fn(() => Promise.resolve(mockEthereumAddress.privateKey)),
  getTransaction: vi.fn(() => Promise.resolve(mockEthereumTransaction)),
  getBalance: vi.fn(() => Promise.resolve({ balance: '1000000000000000000' }))
}

export const mockTatumXrp = {
  generateAccount: vi.fn(() => Promise.resolve(mockXrpAddress)),
  getTransaction: vi.fn(() => Promise.resolve(mockXrpTransaction)),
  getBalance: vi.fn(() => Promise.resolve({ balance: '100' }))
}

// Tatum APIクライアントモック
export const createMockTatumClient = () => ({
  bitcoin: mockTatumBitcoin,
  ethereum: mockTatumEthereum,
  xrp: mockTatumXrp,
  notification: {
    create: vi.fn(() => Promise.resolve({ id: 'subscription-id' })),
    delete: vi.fn(() => Promise.resolve({ success: true })),
    getAll: vi.fn(() => Promise.resolve([]))
  }
})

// グローバルモック設定
export const setupTatumMock = () => {
  vi.mock('@tatumio/tatum', () => ({
    Bitcoin: mockTatumBitcoin,
    Ethereum: mockTatumEthereum,
    TatumSDK: {
      init: vi.fn(() => Promise.resolve(createMockTatumClient()))
    }
  }))
}
