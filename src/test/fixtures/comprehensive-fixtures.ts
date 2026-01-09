/**
 * 統合テストフィクスチャ
 * 全テストで使用可能な共通データセット
 */

import { faker } from '@faker-js/faker'

// ユーザーフィクスチャ
export const testUsers = {
  normalUser: {
    id: 'user-normal-12345',
    email: 'user@example.com',
    role: 'user' as const,
    emailConfirmed: true,
    kycStatus: 'approved' as const,
    createdAt: new Date('2024-01-01').toISOString()
  },
  adminUser: {
    id: 'user-admin-12345',
    email: 'admin@example.com',
    role: 'admin' as const,
    emailConfirmed: true,
    kycStatus: 'approved' as const,
    createdAt: new Date('2024-01-01').toISOString()
  },
  moderatorUser: {
    id: 'user-moderator-12345',
    email: 'moderator@example.com',
    role: 'moderator' as const,
    emailConfirmed: true,
    kycStatus: 'approved' as const,
    createdAt: new Date('2024-01-01').toISOString()
  },
  unverifiedUser: {
    id: 'user-unverified-12345',
    email: 'unverified@example.com',
    role: 'user' as const,
    emailConfirmed: false,
    kycStatus: 'pending' as const,
    createdAt: new Date('2024-01-01').toISOString()
  }
}

// ウォレットフィクスチャ
export const testWallets = {
  btc: {
    userId: testUsers.normalUser.id,
    chain: 'bitcoin' as const,
    network: 'mainnet' as const,
    address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    currency: 'BTC',
    balance: '0.5',
    lockedBalance: '0.1',
    createdAt: new Date('2024-01-02').toISOString()
  },
  eth: {
    userId: testUsers.normalUser.id,
    chain: 'ethereum' as const,
    network: 'mainnet' as const,
    address: '0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2',
    currency: 'ETH',
    balance: '2.5',
    lockedBalance: '0',
    createdAt: new Date('2024-01-02').toISOString()
  },
  usdt: {
    userId: testUsers.normalUser.id,
    chain: 'ethereum' as const,
    network: 'mainnet' as const,
    address: '0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2',
    currency: 'USDT',
    contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    balance: '10000',
    lockedBalance: '500',
    createdAt: new Date('2024-01-02').toISOString()
  },
  xrp: {
    userId: testUsers.normalUser.id,
    chain: 'xrp' as const,
    network: 'mainnet' as const,
    address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
    destinationTag: 12345,
    currency: 'XRP',
    balance: '1000',
    lockedBalance: '0',
    createdAt: new Date('2024-01-02').toISOString()
  }
}

// トランザクションフィクスチャ
export const testTransactions = {
  btcDeposit: {
    id: 'tx-btc-deposit-001',
    userId: testUsers.normalUser.id,
    type: 'deposit' as const,
    currency: 'BTC',
    amount: '0.1',
    fee: '0.0001',
    status: 'completed' as const,
    txHash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
    confirmations: 6,
    requiredConfirmations: 3,
    fromAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    toAddress: testWallets.btc.address,
    createdAt: new Date('2024-01-03T10:00:00Z').toISOString(),
    completedAt: new Date('2024-01-03T11:00:00Z').toISOString()
  },
  ethWithdrawal: {
    id: 'tx-eth-withdrawal-001',
    userId: testUsers.normalUser.id,
    type: 'withdrawal' as const,
    currency: 'ETH',
    amount: '1.0',
    fee: '0.005',
    status: 'pending' as const,
    txHash: null,
    fromAddress: testWallets.eth.address,
    toAddress: '0x123456789abcdef123456789abcdef123456789a',
    createdAt: new Date('2024-01-04T10:00:00Z').toISOString()
  }
}

// 注文フィクスチャ
export const testOrders = {
  limitBuy: {
    id: 'order-limit-buy-001',
    userId: testUsers.normalUser.id,
    market: 'BTC-USDT',
    type: 'limit' as const,
    side: 'buy' as const,
    price: '95000',
    qty: '0.01',
    filledQty: '0',
    status: 'open' as const,
    timeInForce: 'GTC' as const,
    createdAt: new Date('2024-01-05T10:00:00Z').toISOString()
  },
  marketSell: {
    id: 'order-market-sell-001',
    userId: testUsers.normalUser.id,
    market: 'ETH-USDT',
    type: 'market' as const,
    side: 'sell' as const,
    price: null,
    qty: '0.5',
    filledQty: '0.5',
    status: 'filled' as const,
    timeInForce: 'IOC' as const,
    createdAt: new Date('2024-01-05T11:00:00Z').toISOString(),
    completedAt: new Date('2024-01-05T11:00:01Z').toISOString()
  }
}

// 価格データフィクスチャ
export const testPrices = {
  BTC: '97000',
  ETH: '3800',
  USDT: '1',
  USDC: '1',
  XRP: '2.3',
  ADA: '0.9',
  TRX: '0.23'
}

// マーケットデータフィクスチャ
export const testMarkets = {
  'BTC-USDT': {
    symbol: 'BTC-USDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    lastPrice: testPrices.BTC,
    volume24h: '125000000',
    priceChange24h: '+1500',
    priceChangePercent24h: '+1.57',
    high24h: '97500',
    low24h: '95000'
  },
  'ETH-USDT': {
    symbol: 'ETH-USDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    lastPrice: testPrices.ETH,
    volume24h: '85000000',
    priceChange24h: '+120',
    priceChangePercent24h: '+3.26',
    high24h: '3850',
    low24h: '3650'
  }
}

// KYCデータフィクスチャ
export const testKycData = {
  pending: {
    userId: testUsers.unverifiedUser.id,
    status: 'pending' as const,
    documentType: 'passport',
    documentNumber: 'A12345678',
    documentImages: ['doc-front.jpg', 'doc-back.jpg'],
    selfieImage: 'selfie.jpg',
    submittedAt: new Date('2024-01-06T10:00:00Z').toISOString()
  },
  approved: {
    userId: testUsers.normalUser.id,
    status: 'approved' as const,
    documentType: 'passport',
    documentNumber: 'B98765432',
    approvedAt: new Date('2024-01-01T15:00:00Z').toISOString(),
    approvedBy: testUsers.adminUser.id
  }
}

// ヘルパー関数：ランダムなテストデータ生成
export const generateRandomUser = () => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  role: faker.helpers.arrayElement(['user', 'moderator', 'admin'] as const),
  emailConfirmed: faker.datatype.boolean(),
  kycStatus: faker.helpers.arrayElement(['pending', 'approved', 'rejected'] as const),
  createdAt: faker.date.past().toISOString()
})

export const generateRandomWallet = (userId: string, currency: string) => ({
  userId,
  currency,
  balance: faker.finance.amount({ min: 0, max: 100, dec: 8 }),
  lockedBalance: faker.finance.amount({ min: 0, max: 10, dec: 8 }),
  createdAt: faker.date.past().toISOString()
})

export const generateRandomTransaction = (userId: string) => ({
  id: faker.string.uuid(),
  userId,
  type: faker.helpers.arrayElement(['deposit', 'withdrawal', 'trade'] as const),
  currency: faker.helpers.arrayElement(['BTC', 'ETH', 'USDT', 'XRP']),
  amount: faker.finance.amount({ min: 0.001, max: 10, dec: 8 }),
  status: faker.helpers.arrayElement(['pending', 'completed', 'failed'] as const),
  createdAt: faker.date.recent().toISOString()
})
