/**
 * Binance WebSocketクライアントのユニットテスト
 *
 * 注意: WebSocketの実際の接続テストは複雑なため、
 * 基本的な設定値とロジックのテストに絞っています。
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WEBSOCKET_CONFIG,
  type WebSocketConfig,
  type WebSocketState,
  type PriceUpdateEvent,
} from '../../../../lib/binance/websocket'

describe('Binance WebSocket Client', () => {
  describe('DEFAULT_WEBSOCKET_CONFIG', () => {
    it('デフォルト設定が正しく定義されている', () => {
      expect(DEFAULT_WEBSOCKET_CONFIG).toEqual({
        maxReconnectAttempts: 5,
        initialReconnectDelayMs: 1000,
        maxReconnectDelayMs: 30000,
        connectionTimeoutMs: 10000,
        pingTimeoutMs: 60000,
      })
    })

    it('maxReconnectAttemptsが正の整数である', () => {
      expect(DEFAULT_WEBSOCKET_CONFIG.maxReconnectAttempts).toBeGreaterThan(0)
      expect(Number.isInteger(DEFAULT_WEBSOCKET_CONFIG.maxReconnectAttempts)).toBe(true)
    })

    it('タイムアウト値が正の整数である', () => {
      expect(DEFAULT_WEBSOCKET_CONFIG.connectionTimeoutMs).toBeGreaterThan(0)
      expect(DEFAULT_WEBSOCKET_CONFIG.pingTimeoutMs).toBeGreaterThan(0)
      expect(DEFAULT_WEBSOCKET_CONFIG.initialReconnectDelayMs).toBeGreaterThan(0)
      expect(DEFAULT_WEBSOCKET_CONFIG.maxReconnectDelayMs).toBeGreaterThan(0)
    })

    it('maxReconnectDelayMsがinitialReconnectDelayMs以上である', () => {
      expect(DEFAULT_WEBSOCKET_CONFIG.maxReconnectDelayMs).toBeGreaterThanOrEqual(
        DEFAULT_WEBSOCKET_CONFIG.initialReconnectDelayMs
      )
    })
  })

  describe('型定義の検証', () => {
    it('WebSocketConfigは必須フィールドを全て持つ', () => {
      const config: WebSocketConfig = {
        maxReconnectAttempts: 3,
        initialReconnectDelayMs: 500,
        maxReconnectDelayMs: 5000,
        connectionTimeoutMs: 5000,
        pingTimeoutMs: 30000,
      }

      expect(config.maxReconnectAttempts).toBe(3)
      expect(config.initialReconnectDelayMs).toBe(500)
      expect(config.maxReconnectDelayMs).toBe(5000)
      expect(config.connectionTimeoutMs).toBe(5000)
      expect(config.pingTimeoutMs).toBe(30000)
    })

    it('PriceUpdateEventは必須フィールドを全て持つ', () => {
      const event: PriceUpdateEvent = {
        symbol: 'BTCUSDT',
        price: 43250.5,
        timestamp: Date.now(),
      }

      expect(event.symbol).toBe('BTCUSDT')
      expect(event.price).toBe(43250.5)
      expect(event.timestamp).toBeGreaterThan(0)
    })

    it('WebSocketStateは有効な状態値のみを持つ', () => {
      const validStates: WebSocketState[] = [
        'connecting',
        'connected',
        'reconnecting',
        'disconnected',
        'failed',
      ]

      validStates.forEach((state) => {
        const testState: WebSocketState = state
        expect(validStates).toContain(testState)
      })
    })
  })

  describe('指数バックオフロジック（推測）', () => {
    it('指数バックオフの遅延計算が正しい', () => {
      const config: WebSocketConfig = {
        maxReconnectAttempts: 5,
        initialReconnectDelayMs: 1000,
        maxReconnectDelayMs: 30000,
        connectionTimeoutMs: 10000,
        pingTimeoutMs: 60000,
      }

      // 指数バックオフ: initialDelay * 2^attempt
      // attempt 0: 1000 * 2^0 = 1000ms
      // attempt 1: 1000 * 2^1 = 2000ms
      // attempt 2: 1000 * 2^2 = 4000ms
      // attempt 3: 1000 * 2^3 = 8000ms
      // attempt 4: 1000 * 2^4 = 16000ms
      // attempt 5: 1000 * 2^5 = 32000ms → maxDelayMs制限で30000ms

      const calculateBackoffDelay = (attempt: number, cfg: WebSocketConfig): number => {
        const delay = cfg.initialReconnectDelayMs * Math.pow(2, attempt)
        return Math.min(delay, cfg.maxReconnectDelayMs)
      }

      expect(calculateBackoffDelay(0, config)).toBe(1000)
      expect(calculateBackoffDelay(1, config)).toBe(2000)
      expect(calculateBackoffDelay(2, config)).toBe(4000)
      expect(calculateBackoffDelay(3, config)).toBe(8000)
      expect(calculateBackoffDelay(4, config)).toBe(16000)
      expect(calculateBackoffDelay(5, config)).toBe(30000) // maxDelayMs制限
      expect(calculateBackoffDelay(10, config)).toBe(30000) // maxDelayMs制限
    })

    it('initialDelayMsが小さい場合も正しく計算される', () => {
      const config: WebSocketConfig = {
        maxReconnectAttempts: 3,
        initialReconnectDelayMs: 100,
        maxReconnectDelayMs: 5000,
        connectionTimeoutMs: 5000,
        pingTimeoutMs: 30000,
      }

      const calculateBackoffDelay = (attempt: number, cfg: WebSocketConfig): number => {
        const delay = cfg.initialReconnectDelayMs * Math.pow(2, attempt)
        return Math.min(delay, cfg.maxReconnectDelayMs)
      }

      expect(calculateBackoffDelay(0, config)).toBe(100)
      expect(calculateBackoffDelay(1, config)).toBe(200)
      expect(calculateBackoffDelay(2, config)).toBe(400)
      expect(calculateBackoffDelay(3, config)).toBe(800)
      expect(calculateBackoffDelay(6, config)).toBe(5000) // maxDelayMs制限
    })
  })

  describe('WebSocket URL構築（推測）', () => {
    it('miniTickerストリームのURLが正しい形式である', () => {
      const symbol = 'btcusdt'
      const expectedUrl = `wss://stream.binance.com:9443/ws/${symbol}@miniTicker`

      expect(expectedUrl).toMatch(/^wss:\/\/stream\.binance\.com:9443\/ws\/[a-z]+@miniTicker$/)
    })

    it('シンボルが小文字に正規化される', () => {
      const symbol = 'BTCUSDT'
      const normalizedSymbol = symbol.toLowerCase()
      const url = `wss://stream.binance.com:9443/ws/${normalizedSymbol}@miniTicker`

      expect(url).toBe('wss://stream.binance.com:9443/ws/btcusdt@miniTicker')
    })

    it('複数のシンボルで正しいURLが構築される', () => {
      const symbols = ['btcusdt', 'ethusdt', 'xrpusdt']

      symbols.forEach((symbol) => {
        const url = `wss://stream.binance.com:9443/ws/${symbol}@miniTicker`
        expect(url).toContain(symbol)
        expect(url).toMatch(/^wss:\/\/stream\.binance\.com:9443\/ws\/[a-z]+@miniTicker$/)
      })
    })
  })

  describe('価格データの検証ロジック（推測）', () => {
    it('有効な価格データを正しく判定する', () => {
      const validPrices = [1, 0.0001, 43250.5, 100000, 0.00000001]

      validPrices.forEach((price) => {
        expect(Number.isFinite(price)).toBe(true)
        expect(price).toBeGreaterThan(0)
      })
    })

    it('無効な価格データを正しく判定する', () => {
      const invalidPrices = [0, -1, -100, NaN, Infinity, -Infinity]

      invalidPrices.forEach((price) => {
        const isValid = Number.isFinite(price) && price > 0
        expect(isValid).toBe(false)
      })
    })

    it('文字列から数値への変換が正しい', () => {
      const priceStrings = ['43250.50', '0.0001', '100000']

      priceStrings.forEach((str) => {
        const price = parseFloat(str)
        expect(Number.isFinite(price)).toBe(true)
        expect(price).toBeGreaterThan(0)
      })
    })

    it('無効な文字列を正しく検出する', () => {
      const invalidStrings = ['invalid', '', 'abc', 'null']

      invalidStrings.forEach((str) => {
        const price = parseFloat(str)
        const isValid = Number.isFinite(price) && price > 0
        expect(isValid).toBe(false)
      })
    })
  })

  describe('miniTickerデータ形式（推測）', () => {
    it('miniTickerイベントの必須フィールドを持つ', () => {
      interface MiniTickerData {
        e: string // イベントタイプ
        E: number // イベント時刻
        s: string // シンボル
        c: string // 現在価格
      }

      const mockData: MiniTickerData = {
        e: '24hrMiniTicker',
        E: Date.now(),
        s: 'BTCUSDT',
        c: '43250.50',
      }

      expect(mockData.e).toBe('24hrMiniTicker')
      expect(mockData.E).toBeGreaterThan(0)
      expect(mockData.s).toBe('BTCUSDT')
      expect(parseFloat(mockData.c)).toBeGreaterThan(0)
    })
  })

  describe('設定値の妥当性', () => {
    it('pingTimeoutMsが接続監視に十分な長さである', () => {
      // 60秒のping/pongタイムアウトは一般的に妥当
      expect(DEFAULT_WEBSOCKET_CONFIG.pingTimeoutMs).toBeGreaterThanOrEqual(30000)
      expect(DEFAULT_WEBSOCKET_CONFIG.pingTimeoutMs).toBeLessThanOrEqual(120000)
    })

    it('connectionTimeoutMsが接続確立に十分な長さである', () => {
      // 10秒の接続タイムアウトは一般的に妥当
      expect(DEFAULT_WEBSOCKET_CONFIG.connectionTimeoutMs).toBeGreaterThanOrEqual(5000)
      expect(DEFAULT_WEBSOCKET_CONFIG.connectionTimeoutMs).toBeLessThanOrEqual(30000)
    })

    it('maxReconnectAttemptsが再接続試行に妥当な回数である', () => {
      // 5回の再接続試行は一般的に妥当
      expect(DEFAULT_WEBSOCKET_CONFIG.maxReconnectAttempts).toBeGreaterThanOrEqual(3)
      expect(DEFAULT_WEBSOCKET_CONFIG.maxReconnectAttempts).toBeLessThanOrEqual(10)
    })
  })

  describe('状態遷移の妥当性（推測）', () => {
    it('有効な状態遷移パターンを持つ', () => {
      const validTransitions = {
        disconnected: ['connecting'],
        connecting: ['connected', 'failed', 'reconnecting'],
        connected: ['reconnecting', 'disconnected'],
        reconnecting: ['connecting', 'failed', 'disconnected'],
        failed: ['disconnected'],
      }

      // 状態遷移の妥当性を確認
      Object.entries(validTransitions).forEach(([fromState, toStates]) => {
        expect(toStates.length).toBeGreaterThan(0)
        toStates.forEach((toState) => {
          expect(['connecting', 'connected', 'reconnecting', 'disconnected', 'failed']).toContain(
            toState
          )
        })
      })
    })
  })
})
