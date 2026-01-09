import { vi } from 'vitest'

/**
 * Binance APIモック
 * WebSocketとREST APIのモック定義
 */

// 価格データモック
export const mockBinancePrice = {
  symbol: 'BTCUSDT',
  price: '97000.00',
  timestamp: Date.now()
}

export const mockBinanceTicker = {
  e: '24hrTicker',
  E: Date.now(),
  s: 'BTCUSDT',
  p: '1500.00',
  P: '1.57',
  w: '96500.00',
  x: '95500.00',
  c: '97000.00',
  Q: '0.05',
  b: '96995.00',
  B: '2.5',
  a: '97005.00',
  A: '1.8',
  o: '95500.00',
  h: '97500.00',
  l: '95000.00',
  v: '12500.50',
  q: '1207525000.00',
  O: Date.now() - 86400000,
  C: Date.now(),
  F: 12345,
  L: 67890,
  n: 55545
}

// 注文簿データモック
export const mockBinanceOrderBook = {
  lastUpdateId: 1234567890,
  bids: [
    ['96995.00', '1.5'],
    ['96990.00', '2.3'],
    ['96985.00', '0.8']
  ],
  asks: [
    ['97005.00', '1.2'],
    ['97010.00', '3.1'],
    ['97015.00', '0.9']
  ]
}

// 注文データモック
export const mockBinanceOrder = {
  symbol: 'BTCUSDT',
  orderId: 12345678,
  orderListId: -1,
  clientOrderId: 'test-order-id',
  transactTime: Date.now(),
  price: '97000.00',
  origQty: '0.01',
  executedQty: '0.01',
  cummulativeQuoteQty: '970.00',
  status: 'FILLED',
  timeInForce: 'GTC',
  type: 'LIMIT',
  side: 'BUY',
  fills: [{
    price: '97000.00',
    qty: '0.01',
    commission: '0.00001',
    commissionAsset: 'BTC',
    tradeId: 123456
  }]
}

// WebSocketメッセージモック
export const mockBinanceWsMessage = {
  trade: {
    e: 'trade',
    E: Date.now(),
    s: 'BTCUSDT',
    t: 12345,
    p: '97000.00',
    q: '0.01',
    b: 88,
    a: 50,
    T: Date.now(),
    m: true,
    M: true
  },
  kline: {
    e: 'kline',
    E: Date.now(),
    s: 'BTCUSDT',
    k: {
      t: Date.now(),
      T: Date.now() + 60000,
      s: 'BTCUSDT',
      i: '1m',
      f: 100,
      L: 200,
      o: '96500.00',
      c: '97000.00',
      h: '97500.00',
      l: '96000.00',
      v: '100.0',
      n: 100,
      x: false,
      q: '9650000.00',
      V: '50.0',
      Q: '4825000.00',
      B: '0'
    }
  }
}

// Binance REST APIモック
export const mockBinanceRestApi = {
  ping: vi.fn(() => Promise.resolve({})),
  time: vi.fn(() => Promise.resolve({ serverTime: Date.now() })),
  exchangeInfo: vi.fn(() => Promise.resolve({
    timezone: 'UTC',
    serverTime: Date.now(),
    symbols: [{
      symbol: 'BTCUSDT',
      status: 'TRADING',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      filters: []
    }]
  })),
  prices: vi.fn(() => Promise.resolve({ BTCUSDT: '97000.00' })),
  dailyStats: vi.fn(() => Promise.resolve([mockBinanceTicker])),
  book: vi.fn(() => Promise.resolve(mockBinanceOrderBook)),
  order: vi.fn(() => Promise.resolve(mockBinanceOrder)),
  getOrder: vi.fn(() => Promise.resolve(mockBinanceOrder)),
  cancelOrder: vi.fn(() => Promise.resolve({
    symbol: 'BTCUSDT',
    orderId: 12345678,
    status: 'CANCELED'
  })),
  openOrders: vi.fn(() => Promise.resolve([mockBinanceOrder])),
  allOrders: vi.fn(() => Promise.resolve([mockBinanceOrder]))
}

// Binance WebSocketモック
export class MockBinanceWebSocket {
  url: string
  callbacks: Map<string, Array<(data: unknown) => void>>

  constructor(url: string) {
    this.url = url
    this.callbacks = new Map()
  }

  on(event: string, callback: (data: unknown) => void) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, [])
    }
    this.callbacks.get(event)!.push(callback)
  }

  emit(event: string, data: unknown) {
    const cbs = this.callbacks.get(event)
    if (cbs) {
      cbs.forEach(cb => cb(data))
    }
  }

  close() {
    this.callbacks.clear()
  }

  // ヘルパーメソッド：テスト用のメッセージ送信
  simulateTrade(data: unknown = mockBinanceWsMessage.trade) {
    this.emit('message', data)
  }

  simulateKline(data: unknown = mockBinanceWsMessage.kline) {
    this.emit('message', data)
  }

  simulateTicker(data: unknown = mockBinanceTicker) {
    this.emit('message', data)
  }
}

// グローバルモック設定
export const setupBinanceMock = () => {
  vi.mock('binance-api-node', () => ({
    default: vi.fn(() => mockBinanceRestApi)
  }))
}
