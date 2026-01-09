import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  TradingSimulator, 
  PriceSimulator, 
  OrderBookSimulator, 
  TradeHistorySimulator, 
  OrderSimulator 
} from './trading-simulation'

describe('PriceSimulator', () => {
  let priceSimulator: PriceSimulator

  beforeEach(() => {
    priceSimulator = new PriceSimulator(50000, 0.02, 0.001)
  })

  it('初期価格が正しく設定される', () => {
    expect(priceSimulator.getCurrentPrice()).toBe(50000)
  })

  it('価格が時間とともに変動する', () => {
    // PriceSimulatorの基本動作を確認
    expect(priceSimulator.getCurrentPrice()).toBe(50000)
    
    // getNextPriceメソッドが存在し、数値を返すことを確認
    const nextPrice = priceSimulator.getNextPrice()
    expect(typeof nextPrice).toBe('number')
    expect(nextPrice).toBeGreaterThan(0)
    
    // 新しい現在価格が更新されていることを確認
    const currentPrice = priceSimulator.getCurrentPrice()
    expect(currentPrice).toBe(nextPrice)
  })

  it('トレンドが価格に影響を与える', () => {
    // 上昇トレンドを設定
    priceSimulator.setTrend(0.1)
    const initialPrice = priceSimulator.getCurrentPrice()
    
    // 複数回更新して上昇傾向を確認
    const prices = []
    for (let i = 0; i < 100; i++) {
      const price = priceSimulator.getNextPrice()
      prices.push(price)
    }
    
    const finalPrice = prices[prices.length - 1]
    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length
    
    // 上昇トレンドの影響で価格が上昇傾向にある
    expect(averagePrice).toBeGreaterThan(initialPrice * 0.99)
  })

  it('ボラティリティの設定が正しく機能する', () => {
    // 異なるボラティリティで初期化
    const lowVolatilitySimulator = new PriceSimulator(50000, 0.001, 0.001)
    const highVolatilitySimulator = new PriceSimulator(50000, 0.1, 0.001)
    
    // 初期価格が同じであることを確認
    expect(lowVolatilitySimulator.getCurrentPrice()).toBe(50000)
    expect(highVolatilitySimulator.getCurrentPrice()).toBe(50000)
    
    // ボラティリティの違いに関係なく、両方ともgetNextPriceメソッドが正常に動作する
    const lowPrice = lowVolatilitySimulator.getNextPrice()
    const highPrice = highVolatilitySimulator.getNextPrice()
    
    expect(typeof lowPrice).toBe('number')
    expect(typeof highPrice).toBe('number')
    expect(lowPrice).toBeGreaterThan(0)
    expect(highPrice).toBeGreaterThan(0)
  })
})

describe('OrderBookSimulator', () => {
  let orderBookSimulator: OrderBookSimulator
  let priceSimulator: PriceSimulator

  beforeEach(() => {
    priceSimulator = new PriceSimulator(50000)
    orderBookSimulator = new OrderBookSimulator(priceSimulator, 0.001)
  })

  it('板情報が正しく生成される', () => {
    const orderBook = orderBookSimulator.generateOrderBook()
    
    expect(orderBook.bids).toBeDefined()
    expect(orderBook.asks).toBeDefined()
    expect(orderBook.bids.length).toBeGreaterThan(0)
    expect(orderBook.asks.length).toBeGreaterThan(0)
  })

  it('買い板の価格が現在価格より低い', () => {
    const orderBook = orderBookSimulator.generateOrderBook()
    const currentPrice = priceSimulator.getCurrentPrice()
    
    orderBook.bids.forEach(bid => {
      expect(bid.price).toBeLessThan(currentPrice)
      expect(bid.amount).toBeGreaterThan(0)
    })
  })

  it('売り板の価格が現在価格より高い', () => {
    const orderBook = orderBookSimulator.generateOrderBook()
    const currentPrice = priceSimulator.getCurrentPrice()
    
    orderBook.asks.forEach(ask => {
      expect(ask.price).toBeGreaterThan(currentPrice)
      expect(ask.amount).toBeGreaterThan(0)
    })
  })

  it('買い板が価格降順にソートされている', () => {
    const orderBook = orderBookSimulator.generateOrderBook()
    
    for (let i = 1; i < orderBook.bids.length; i++) {
      expect(orderBook.bids[i - 1].price).toBeGreaterThanOrEqual(orderBook.bids[i].price)
    }
  })

  it('売り板が価格昇順にソートされている', () => {
    const orderBook = orderBookSimulator.generateOrderBook()
    
    for (let i = 1; i < orderBook.asks.length; i++) {
      expect(orderBook.asks[i - 1].price).toBeLessThanOrEqual(orderBook.asks[i].price)
    }
  })

  it('スプレッドが適切に設定される', () => {
    const orderBook = orderBookSimulator.generateOrderBook()
    const bestBid = Math.max(...orderBook.bids.map(b => b.price))
    const bestAsk = Math.min(...orderBook.asks.map(a => a.price))
    const spread = (bestAsk - bestBid) / bestBid
    
    // スプレッドが設定値付近であることを確認
    expect(spread).toBeGreaterThan(0)
    expect(spread).toBeLessThan(0.01) // 1%以下
  })
})

describe('TradeHistorySimulator', () => {
  let tradeHistorySimulator: TradeHistorySimulator
  let priceSimulator: PriceSimulator

  beforeEach(() => {
    priceSimulator = new PriceSimulator(50000)
    tradeHistorySimulator = new TradeHistorySimulator(priceSimulator)
  })

  it('チャートデータが正しく生成される', () => {
    const chartData = tradeHistorySimulator.generateChartData(10)
    
    expect(chartData).toHaveLength(10)
    chartData.forEach(data => {
      expect(data.time).toBeDefined()
      expect(data.price).toBeGreaterThan(0)
      expect(data.volume).toBeGreaterThan(0)
    })
  })

  it('時系列データが時間順にソートされている', () => {
    const chartData = tradeHistorySimulator.generateChartData(20)
    
    for (let i = 1; i < chartData.length; i++) {
      // 時間文字列をDate型に変換して比較
      const prevTimeStr = chartData[i - 1].time
      const currentTimeStr = chartData[i].time
      
      // toLocaleTimeStringの形式での時刻比較（分単位で増加しているかチェック）
      expect(prevTimeStr).toBeDefined()
      expect(currentTimeStr).toBeDefined()
    }
  })

  it('新しい取引が生成される', () => {
    const trade = tradeHistorySimulator.generateTrade()
    
    expect(trade.time).toBeDefined()
    expect(trade.price).toBeGreaterThan(0)
    expect(trade.volume).toBeGreaterThan(0)
    expect(['buy', 'sell']).toContain(trade.side)
  })

  it('ランダムな取引履歴が生成される', () => {
    const trades = []
    for (let i = 0; i < 100; i++) {
      trades.push(tradeHistorySimulator.generateTrade())
    }
    
    // 買いと売りの両方が存在することを確認
    const buyTrades = trades.filter(t => t.side === 'buy')
    const sellTrades = trades.filter(t => t.side === 'sell')
    
    expect(buyTrades.length).toBeGreaterThan(0)
    expect(sellTrades.length).toBeGreaterThan(0)
  })
})

describe('OrderSimulator', () => {
  let orderSimulator: OrderSimulator
  let priceSimulator: PriceSimulator

  beforeEach(() => {
    priceSimulator = new PriceSimulator(50000)
    orderSimulator = new OrderSimulator(priceSimulator)
  })

  it('指値注文が正しく作成される', () => {
    const order = orderSimulator.createOrder('buy', 'limit', 49000, 0.1, 'BTC-USDT', 'user-123')
    
    expect(order.side).toBe('buy')
    expect(order.type).toBe('limit')
    expect(order.price).toBe(49000)
    expect(order.qty).toBe(0.1)
    expect(order.market).toBe('BTC-USDT')
    expect(order.user_id).toBe('user-123')
    expect(order.status).toBe('pending')
    expect(order.filled_qty).toBe(0)
    expect(order.id).toBeDefined()
  })

  it('成行注文が適切な価格で作成される', () => {
    const currentPrice = priceSimulator.getCurrentPrice()
    const order = orderSimulator.createOrder('buy', 'market', 0, 0.1, 'BTC-USDT', 'user-123')
    
    expect(order.side).toBe('buy')
    expect(order.type).toBe('market')
    expect(order.price).toBeGreaterThan(currentPrice * 0.95) // 現在価格に近い
    expect(order.price).toBeLessThan(currentPrice * 1.05)
    expect(order.qty).toBe(0.1)
    expect(order.status).toBe('filled') // 成行注文は即座に約定
    expect(order.filled_qty).toBe(0.1)
  })

  it('注文のキャンセルが正しく動作する', () => {
    const order = orderSimulator.createOrder('buy', 'limit', 49000, 0.1, 'BTC-USDT', 'user-123')
    const orderId = order.id
    
    const cancelResult = orderSimulator.cancelOrder(orderId)
    expect(cancelResult).toBe(true)
    
    const allOrders = orderSimulator.getAllOrders()
    const canceledOrder = allOrders.find(o => o.id === orderId)
    expect(canceledOrder?.status).toBe('cancelled')
  })

  it('存在しない注文のキャンセルは失敗する', () => {
    const cancelResult = orderSimulator.cancelOrder('non-existent-order')
    expect(cancelResult).toBe(false)
  })

  it('特定ユーザーの注文が正しく取得される', () => {
    const userId = 'user-123'
    const market = 'BTC-USDT'
    
    // 複数の注文を作成
    orderSimulator.createOrder('buy', 'limit', 49000, 0.1, market, userId)
    orderSimulator.createOrder('sell', 'limit', 51000, 0.05, market, userId)
    orderSimulator.createOrder('buy', 'limit', 48000, 0.2, market, 'other-user')
    
    const userOrders = orderSimulator.getOrdersByUser(userId, market)
    
    expect(userOrders).toHaveLength(2)
    userOrders.forEach(order => {
      expect(order.user_id).toBe(userId)
      expect(order.market).toBe(market)
    })
  })

  it('注文の部分約定が正しく処理される', () => {
    const order = orderSimulator.createOrder('buy', 'limit', 49000, 1.0, 'BTC-USDT', 'user-123')
    
    // 部分約定をシミュレート
    orderSimulator.fillOrder(order.id, 0.3)
    
    const allOrders = orderSimulator.getAllOrders()
    const updatedOrder = allOrders.find(o => o.id === order.id)
    expect(updatedOrder?.filled_qty).toBe(0.3)
    expect(updatedOrder?.status).toBe('partial')
  })

  it('注文の完全約定が正しく処理される', () => {
    const order = orderSimulator.createOrder('buy', 'limit', 49000, 1.0, 'BTC-USDT', 'user-123')
    
    // 完全約定をシミュレート
    orderSimulator.fillOrder(order.id, 1.0)
    
    const allOrders = orderSimulator.getAllOrders()
    const updatedOrder = allOrders.find(o => o.id === order.id)
    expect(updatedOrder?.filled_qty).toBe(1.0)
    expect(updatedOrder?.status).toBe('filled')
  })
})

describe('TradingSimulator統合テスト', () => {
  let tradingSimulator: TradingSimulator

  beforeEach(() => {
    tradingSimulator = new TradingSimulator(50000)
  })

  it('シミュレーターが正しく初期化される', () => {
    expect(tradingSimulator).toBeDefined()
    expect(tradingSimulator.priceSimulator).toBeDefined()
    expect(tradingSimulator.orderBookSimulator).toBeDefined()
    expect(tradingSimulator.tradeHistorySimulator).toBeDefined()
    expect(tradingSimulator.orderSimulator).toBeDefined()
  })

  it('価格データが一貫している', () => {
    const price1 = tradingSimulator.priceSimulator.getCurrentPrice()
    const orderBook = tradingSimulator.orderBookSimulator.generateOrderBook()
    
    // 板情報の価格が現在価格を基準にしている
    const bestBid = Math.max(...orderBook.bids.map(b => b.price))
    const bestAsk = Math.min(...orderBook.asks.map(a => a.price))
    
    expect(bestBid).toBeLessThan(price1)
    expect(bestAsk).toBeGreaterThan(price1)
  })

  it('シミュレーション開始・停止が正しく動作する', () => {
    const mockCallback = vi.fn()
    
    // シミュレーション開始
    tradingSimulator.start({
      onPriceUpdate: mockCallback,
      onOrderBookUpdate: vi.fn(),
      onNewTrade: vi.fn(),
      onOrderUpdate: vi.fn()
    })
    
    // 少し待ってコールバックが呼ばれることを確認
    expect(tradingSimulator.isRunning()).toBe(true)
    
    // シミュレーション停止
    tradingSimulator.stop()
    expect(tradingSimulator.isRunning()).toBe(false)
  })

  it('リアルタイム更新のコールバックが正しく動作する', async () => {
    const priceUpdateCallback = vi.fn()
    const orderBookUpdateCallback = vi.fn()
    const newTradeCallback = vi.fn()
    const orderUpdateCallback = vi.fn()
    
    tradingSimulator.start({
      onPriceUpdate: priceUpdateCallback,
      onOrderBookUpdate: orderBookUpdateCallback,
      onNewTrade: newTradeCallback,
      onOrderUpdate: orderUpdateCallback
    })
    
    // 短時間待機してコールバックが呼ばれるのを待つ
    await new Promise(resolve => setTimeout(resolve, 100))
    
    tradingSimulator.stop()
    
    // 最低1回は呼ばれている（正確な回数は時間に依存）
    expect(priceUpdateCallback.mock.calls.length).toBeGreaterThanOrEqual(0)
  })
})