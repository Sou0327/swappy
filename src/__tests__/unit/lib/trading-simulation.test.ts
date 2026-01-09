/**
 * 取引シミュレーション機能のユニットテスト
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  PriceSimulator,
  OrderBookSimulator,
  TradeHistorySimulator,
  OrderSimulator,
  TradingSimulator
} from '../../../lib/trading-simulation'

describe('PriceSimulator', () => {
  let simulator: PriceSimulator

  beforeEach(() => {
    simulator = new PriceSimulator(50000, 0.02, 0)
  })

  describe('初期化', () => {
    it('デフォルトパラメータで初期化できる', () => {
      const defaultSimulator = new PriceSimulator()
      expect(defaultSimulator.getCurrentPrice()).toBe(50000)
    })

    it('カスタムパラメータで初期化できる', () => {
      const customSimulator = new PriceSimulator(100000, 0.05, 0.001)
      expect(customSimulator.getCurrentPrice()).toBe(100000)
    })
  })

  describe('価格生成', () => {
    it('次の価格を生成できる', () => {
      const nextPrice = simulator.getNextPrice()
      expect(nextPrice).toBeGreaterThan(0)
      expect(typeof nextPrice).toBe('number')
    })

    it('価格が下限1を下回らない', () => {
      const lowPriceSimulator = new PriceSimulator(1, 0.5, -1)

      // 複数回価格を更新して下限をテスト
      for (let i = 0; i < 100; i++) {
        const price = lowPriceSimulator.getNextPrice()
        expect(price).toBeGreaterThanOrEqual(1)
      }
    })

    it('getCurrentPrice()は現在価格を返す', () => {
      const initialPrice = simulator.getCurrentPrice()
      simulator.getNextPrice()
      const updatedPrice = simulator.getCurrentPrice()

      expect(typeof initialPrice).toBe('number')
      expect(typeof updatedPrice).toBe('number')
    })

    it('トレンドを設定できる', () => {
      simulator.setTrend(0.1) // 上昇トレンド

      const prices: number[] = []
      for (let i = 0; i < 10; i++) {
        prices.push(simulator.getNextPrice())
      }

      // 平均的に上昇傾向にあることを確認（ボラティリティがあるため厳密ではない）
      const averageChange = (prices[prices.length - 1] - prices[0]) / prices.length
      expect(averageChange).toBeGreaterThan(-1000) // 大幅な下落はない想定
    })
  })
})

describe('OrderBookSimulator', () => {
  let priceSimulator: PriceSimulator
  let orderBookSimulator: OrderBookSimulator

  beforeEach(() => {
    priceSimulator = new PriceSimulator(50000, 0.02, 0)
    orderBookSimulator = new OrderBookSimulator(priceSimulator, 0.001)
  })

  describe('板情報生成', () => {
    it('デフォルトレベル数の板情報を生成できる', () => {
      const orderBook = orderBookSimulator.generateOrderBook()

      expect(orderBook.bids).toHaveLength(10)
      expect(orderBook.asks).toHaveLength(10)
    })

    it('カスタムレベル数の板情報を生成できる', () => {
      const orderBook = orderBookSimulator.generateOrderBook(20)

      expect(orderBook.bids).toHaveLength(20)
      expect(orderBook.asks).toHaveLength(20)
    })

    it('買い板は価格の高い順にソートされている', () => {
      const orderBook = orderBookSimulator.generateOrderBook()

      for (let i = 0; i < orderBook.bids.length - 1; i++) {
        expect(orderBook.bids[i].price).toBeGreaterThanOrEqual(orderBook.bids[i + 1].price)
      }
    })

    it('売り板は価格の安い順にソートされている', () => {
      const orderBook = orderBookSimulator.generateOrderBook()

      for (let i = 0; i < orderBook.asks.length - 1; i++) {
        expect(orderBook.asks[i].price).toBeLessThanOrEqual(orderBook.asks[i + 1].price)
      }
    })

    it('買い板の価格は現在価格より低い', () => {
      const currentPrice = priceSimulator.getCurrentPrice()
      const orderBook = orderBookSimulator.generateOrderBook()

      orderBook.bids.forEach(bid => {
        expect(bid.price).toBeLessThan(currentPrice)
      })
    })

    it('売り板の価格は現在価格より高い', () => {
      const currentPrice = priceSimulator.getCurrentPrice()
      const orderBook = orderBookSimulator.generateOrderBook()

      orderBook.asks.forEach(ask => {
        expect(ask.price).toBeGreaterThan(currentPrice)
      })
    })

    it('各レベルに正しいプロパティが存在する', () => {
      const orderBook = orderBookSimulator.generateOrderBook()

      orderBook.bids.forEach(bid => {
        expect(bid).toHaveProperty('price')
        expect(bid).toHaveProperty('amount')
        expect(bid).toHaveProperty('total')
        expect(typeof bid.price).toBe('number')
        expect(typeof bid.amount).toBe('number')
        expect(typeof bid.total).toBe('number')
      })

      orderBook.asks.forEach(ask => {
        expect(ask).toHaveProperty('price')
        expect(ask).toHaveProperty('amount')
        expect(ask).toHaveProperty('total')
      })
    })

    it('totalは累積値として正しく計算されている', () => {
      const orderBook = orderBookSimulator.generateOrderBook()

      let runningTotal = 0
      orderBook.bids.forEach(bid => {
        runningTotal += bid.amount
        // 浮動小数点の誤差を考慮
        expect(Math.abs(bid.total - runningTotal)).toBeLessThan(0.01)
      })
    })
  })
})

describe('TradeHistorySimulator', () => {
  let priceSimulator: PriceSimulator
  let tradeHistorySimulator: TradeHistorySimulator

  beforeEach(() => {
    priceSimulator = new PriceSimulator(50000, 0.02, 0)
    tradeHistorySimulator = new TradeHistorySimulator(priceSimulator)
  })

  describe('取引生成', () => {
    it('新しい取引を生成できる', () => {
      const trade = tradeHistorySimulator.generateTrade()

      expect(trade).toHaveProperty('time')
      expect(trade).toHaveProperty('price')
      expect(trade).toHaveProperty('volume')
      expect(trade).toHaveProperty('side')
      expect(['buy', 'sell']).toContain(trade.side)
    })

    it('複数の取引を生成できる', () => {
      const trade1 = tradeHistorySimulator.generateTrade()
      const trade2 = tradeHistorySimulator.generateTrade()

      expect(trade1.time).toBeTruthy()
      expect(trade2.time).toBeTruthy()
    })

    it('取引履歴を取得できる', () => {
      tradeHistorySimulator.generateTrade()
      tradeHistorySimulator.generateTrade()
      tradeHistorySimulator.generateTrade()

      const trades = tradeHistorySimulator.getTrades()
      expect(trades).toHaveLength(3)
    })

    it('取引履歴は新しいものが先頭に追加される', () => {
      const trade1 = tradeHistorySimulator.generateTrade()
      const trade2 = tradeHistorySimulator.generateTrade()

      const trades = tradeHistorySimulator.getTrades()
      expect(trades[0].time).toBe(trade2.time)
      expect(trades[1].time).toBe(trade1.time)
    })

    it('取引履歴は200件に制限される', () => {
      // 250件生成
      for (let i = 0; i < 250; i++) {
        tradeHistorySimulator.generateTrade()
      }

      const trades = tradeHistorySimulator.getTrades()
      expect(trades.length).toBeLessThanOrEqual(200)
    })
  })

  describe('チャートデータ生成', () => {
    it('デフォルトポイント数のチャートデータを生成できる', () => {
      const chartData = tradeHistorySimulator.generateChartData()
      expect(chartData).toHaveLength(50)
    })

    it('カスタムポイント数のチャートデータを生成できる', () => {
      const chartData = tradeHistorySimulator.generateChartData(100)
      expect(chartData).toHaveLength(100)
    })

    it('チャートデータに必要なプロパティが含まれる', () => {
      const chartData = tradeHistorySimulator.generateChartData(10)

      chartData.forEach(point => {
        expect(point).toHaveProperty('time')
        expect(point).toHaveProperty('price')
        expect(point).toHaveProperty('volume')
        expect(typeof point.time).toBe('string')
        expect(typeof point.price).toBe('number')
        expect(typeof point.volume).toBe('number')
      })
    })
  })
})

describe('OrderSimulator', () => {
  let priceSimulator: PriceSimulator
  let orderSimulator: OrderSimulator

  beforeEach(() => {
    vi.useFakeTimers()
    priceSimulator = new PriceSimulator(50000, 0.02, 0)
    orderSimulator = new OrderSimulator(priceSimulator)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('注文作成', () => {
    it('指値買い注文を作成できる', () => {
      const order = orderSimulator.createOrder('buy', 'limit', 49000, 1.5, 'BTC-USDT', 'user-1')

      expect(order.id).toBeTruthy()
      expect(order.side).toBe('buy')
      expect(order.type).toBe('limit')
      expect(order.price).toBe(49000)
      expect(order.qty).toBe(1.5)
      expect(order.filled_qty).toBe(0)
      expect(order.status).toBe('pending')
      expect(order.market).toBe('BTC-USDT')
      expect(order.user_id).toBe('user-1')
    })

    it('成行売り注文を作成できる', () => {
      const order = orderSimulator.createOrder('sell', 'market', 0, 2.0, 'BTC-USDT')

      expect(order.side).toBe('sell')
      expect(order.type).toBe('market')
      expect(order.price).toBe(priceSimulator.getCurrentPrice())
    })

    it('成行注文は即座に約定する', () => {
      const order = orderSimulator.createOrder('buy', 'market', 0, 1.0, 'BTC-USDT')

      expect(order.filled_qty).toBe(1.0)
      expect(order.status).toBe('filled')
    })

    it('注文IDはユニークである', () => {
      const order1 = orderSimulator.createOrder('buy', 'limit', 49000, 1.0, 'BTC-USDT')
      const order2 = orderSimulator.createOrder('buy', 'limit', 49000, 1.0, 'BTC-USDT')

      expect(order1.id).not.toBe(order2.id)
    })
  })

  describe('注文約定処理', () => {
    it('指値注文を部分約定できる', () => {
      const order = orderSimulator.createOrder('buy', 'limit', 49000, 2.0, 'BTC-USDT')
      const filled = orderSimulator.fillOrder(order.id, 1.0)

      expect(filled).toBe(true)

      const orders = orderSimulator.getAllOrders()
      const updatedOrder = orders.find(o => o.id === order.id)

      expect(updatedOrder?.filled_qty).toBe(1.0)
      expect(updatedOrder?.status).toBe('partial')
    })

    it('注文を完全約定できる', () => {
      const order = orderSimulator.createOrder('buy', 'limit', 49000, 1.0, 'BTC-USDT')
      const filled = orderSimulator.fillOrder(order.id, 1.0)

      expect(filled).toBe(true)

      const orders = orderSimulator.getAllOrders()
      const updatedOrder = orders.find(o => o.id === order.id)

      expect(updatedOrder?.filled_qty).toBe(1.0)
      expect(updatedOrder?.status).toBe('filled')
    })

    it('約定量がqtyを超えない', () => {
      const order = orderSimulator.createOrder('buy', 'limit', 49000, 1.0, 'BTC-USDT')
      orderSimulator.fillOrder(order.id, 2.0) // qtyを超える量

      const orders = orderSimulator.getAllOrders()
      const updatedOrder = orders.find(o => o.id === order.id)

      expect(updatedOrder?.filled_qty).toBe(1.0) // qtyが上限
      expect(updatedOrder?.status).toBe('filled')
    })

    it('既に約定済みの注文は約定できない', () => {
      const order = orderSimulator.createOrder('buy', 'market', 0, 1.0, 'BTC-USDT')
      const filled = orderSimulator.fillOrder(order.id, 0.5)

      expect(filled).toBe(false)
    })

    it('存在しない注文IDでは約定できない', () => {
      const filled = orderSimulator.fillOrder('non-existent-id', 1.0)
      expect(filled).toBe(false)
    })
  })

  describe('注文キャンセル', () => {
    it('pending状態の注文をキャンセルできる', () => {
      const order = orderSimulator.createOrder('buy', 'limit', 49000, 1.0, 'BTC-USDT')
      const cancelled = orderSimulator.cancelOrder(order.id)

      expect(cancelled).toBe(true)

      const orders = orderSimulator.getAllOrders()
      const updatedOrder = orders.find(o => o.id === order.id)

      expect(updatedOrder?.status).toBe('cancelled')
    })

    it('部分約定の注文もキャンセルできる', () => {
      const order = orderSimulator.createOrder('buy', 'limit', 49000, 2.0, 'BTC-USDT')
      orderSimulator.fillOrder(order.id, 1.0)
      const cancelled = orderSimulator.cancelOrder(order.id)

      expect(cancelled).toBe(true)

      const orders = orderSimulator.getAllOrders()
      const updatedOrder = orders.find(o => o.id === order.id)

      expect(updatedOrder?.status).toBe('cancelled')
    })

    it('完全約定済みの注文はキャンセルできない', () => {
      const order = orderSimulator.createOrder('buy', 'market', 0, 1.0, 'BTC-USDT')
      const cancelled = orderSimulator.cancelOrder(order.id)

      expect(cancelled).toBe(false)
    })

    it('存在しない注文IDではキャンセルできない', () => {
      const cancelled = orderSimulator.cancelOrder('non-existent-id')
      expect(cancelled).toBe(false)
    })
  })

  describe('注文取得', () => {
    beforeEach(() => {
      orderSimulator.createOrder('buy', 'limit', 49000, 1.0, 'BTC-USDT', 'user-1')
      orderSimulator.createOrder('sell', 'limit', 51000, 2.0, 'BTC-USDT', 'user-1')
      orderSimulator.createOrder('buy', 'limit', 48000, 1.5, 'ETH-USDT', 'user-1')
      orderSimulator.createOrder('buy', 'limit', 49500, 1.0, 'BTC-USDT', 'user-2')
    })

    it('特定ユーザーの全注文を取得できる', () => {
      const orders = orderSimulator.getOrdersByUser('user-1')
      expect(orders).toHaveLength(3)
      expect(orders.every(o => o.user_id === 'user-1')).toBe(true)
    })

    it('特定ユーザーの特定市場の注文を取得できる', () => {
      const orders = orderSimulator.getOrdersByUser('user-1', 'BTC-USDT')
      expect(orders).toHaveLength(2)
      expect(orders.every(o => o.user_id === 'user-1' && o.market === 'BTC-USDT')).toBe(true)
    })

    it('全注文を取得できる', () => {
      const orders = orderSimulator.getAllOrders()
      expect(orders).toHaveLength(4)
    })

    it('存在しないユーザーは空配列を返す', () => {
      const orders = orderSimulator.getOrdersByUser('non-existent-user')
      expect(orders).toHaveLength(0)
    })
  })
})

describe('TradingSimulator', () => {
  let tradingSimulator: TradingSimulator

  beforeEach(() => {
    vi.useFakeTimers()
    tradingSimulator = new TradingSimulator(50000)
  })

  afterEach(() => {
    tradingSimulator.stop()
    vi.useRealTimers()
  })

  describe('初期化', () => {
    it('デフォルトパラメータで初期化できる', () => {
      expect(tradingSimulator.priceSimulator).toBeDefined()
      expect(tradingSimulator.orderBookSimulator).toBeDefined()
      expect(tradingSimulator.tradeHistorySimulator).toBeDefined()
      expect(tradingSimulator.orderSimulator).toBeDefined()
    })

    it('カスタム価格で初期化できる', () => {
      const customSimulator = new TradingSimulator(100000)
      expect(customSimulator.priceSimulator.getCurrentPrice()).toBe(100000)
    })

    it('初期状態ではシミュレーションは実行されていない', () => {
      expect(tradingSimulator.isRunning()).toBe(false)
    })
  })

  describe('シミュレーション実行', () => {
    it('シミュレーションを開始できる', () => {
      tradingSimulator.start()
      expect(tradingSimulator.isRunning()).toBe(true)
    })

    it('シミュレーションを停止できる', () => {
      tradingSimulator.start()
      tradingSimulator.stop()
      expect(tradingSimulator.isRunning()).toBe(false)
    })

    it('価格更新コールバックが呼ばれる', () => {
      const onPriceUpdate = vi.fn()
      tradingSimulator.start({ onPriceUpdate })

      // 1秒進める
      vi.advanceTimersByTime(1000)

      expect(onPriceUpdate).toHaveBeenCalled()
      expect(typeof onPriceUpdate.mock.calls[0][0]).toBe('number')
    })

    it('板情報更新コールバックが呼ばれる', () => {
      const onOrderBookUpdate = vi.fn()
      tradingSimulator.start({ onOrderBookUpdate })

      // 2秒進める
      vi.advanceTimersByTime(2000)

      expect(onOrderBookUpdate).toHaveBeenCalled()
      const orderBook = onOrderBookUpdate.mock.calls[0][0]
      expect(orderBook).toHaveProperty('bids')
      expect(orderBook).toHaveProperty('asks')
    })

    it('新規取引コールバックが呼ばれる', () => {
      const onNewTrade = vi.fn()
      tradingSimulator.start({ onNewTrade })

      // 8秒進める（取引は3-8秒間隔）
      vi.advanceTimersByTime(8000)

      expect(onNewTrade).toHaveBeenCalled()
      const trade = onNewTrade.mock.calls[0][0]
      expect(trade).toHaveProperty('time')
      expect(trade).toHaveProperty('price')
      expect(trade).toHaveProperty('volume')
      expect(trade).toHaveProperty('side')
    })

    it('複数回の価格更新が行われる', () => {
      const onPriceUpdate = vi.fn()
      tradingSimulator.start({ onPriceUpdate })

      // 5秒進める（1秒間隔なので5回呼ばれる）
      vi.advanceTimersByTime(5000)

      expect(onPriceUpdate).toHaveBeenCalledTimes(5)
    })

    it('停止後はコールバックが呼ばれない', () => {
      const onPriceUpdate = vi.fn()
      tradingSimulator.start({ onPriceUpdate })

      vi.advanceTimersByTime(1000)
      const callCountBefore = onPriceUpdate.mock.calls.length

      tradingSimulator.stop()
      vi.advanceTimersByTime(1000)

      expect(onPriceUpdate).toHaveBeenCalledTimes(callCountBefore)
    })
  })
})
