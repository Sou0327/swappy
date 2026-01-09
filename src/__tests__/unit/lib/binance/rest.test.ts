/**
 * Binance REST APIクライアントのユニットテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchTickerPrice,
  fetch24hrTicker,
  fetchMultiplePrices,
  checkApiHealth,
  fetchServerTime,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig
} from '../../../../lib/binance/rest'

describe('Binance REST API Client', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchMock = vi.spyOn(global, 'fetch')
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    fetchMock.mockReset()
    fetchMock.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('デフォルト設定が正しく定義されている', () => {
      expect(DEFAULT_RETRY_CONFIG).toEqual({
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        timeoutMs: 10000
      })
    })
  })

  describe('fetchTickerPrice', () => {
    it('正常に価格を取得できる', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ symbol: 'BTCUSDT', price: '43250.50' })
      } as Response)

      const price = await fetchTickerPrice('BTCUSDT')

      expect(price).toBe(43250.50)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/ticker/price?symbol=BTCUSDT'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json'
          })
        })
      )
    })

    it('無効な価格（負の値）の場合はエラーをスローする', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ symbol: 'BTCUSDT', price: '-100' })
      } as Response)

      const promise = fetchTickerPrice('BTCUSDT')

      await expect(promise).rejects.toThrow('Invalid price received: -100')
    })

    it('無効な価格（0）の場合はエラーをスローする', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ symbol: 'BTCUSDT', price: '0' })
      } as Response)

      const promise = fetchTickerPrice('BTCUSDT')

      await expect(promise).rejects.toThrow('Invalid price received: 0')
    })

    it('無効な価格（NaN）の場合はエラーをスローする', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ symbol: 'BTCUSDT', price: 'invalid' })
      } as Response)

      const promise = fetchTickerPrice('BTCUSDT')

      await expect(promise).rejects.toThrow('Invalid price received: invalid')
    })


    it('カスタムリトライ設定を使用できる', async () => {
      const customConfig: RetryConfig = {
        maxRetries: 1,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        timeoutMs: 5000
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ symbol: 'BTCUSDT', price: '43250.50' })
      } as Response)

      const promise = fetchTickerPrice('BTCUSDT', customConfig)
      const price = await promise

      expect(price).toBe(43250.50)
    })
  })

  describe('fetch24hrTicker', () => {
    it('正常に24時間ティッカー情報を取得できる', async () => {
      const mockTicker = {
        symbol: 'BTCUSDT',
        lastPrice: '43250.50',
        priceChange: '1250.00',
        priceChangePercent: '2.98',
        volume: '12345.67',
        quoteVolume: '500000000'
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTicker
      } as Response)

      const promise = fetch24hrTicker('BTCUSDT')
      const ticker = await promise

      expect(ticker).toEqual(mockTicker)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/ticker/24hr?symbol=BTCUSDT'),
        expect.any(Object)
      )
    })
  })

  describe('fetchMultiplePrices', () => {
    it('複数のシンボルの価格を一括取得できる', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ symbol: 'BTCUSDT', price: '43250.50' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ symbol: 'ETHUSDT', price: '2300.75' })
        } as Response)

      const promise = fetchMultiplePrices(['BTCUSDT', 'ETHUSDT'])
      const prices = await promise

      expect(prices.size).toBe(2)
      expect(prices.get('BTCUSDT')).toBe(43250.50)
      expect(prices.get('ETHUSDT')).toBe(2300.75)
    })

    it('空配列を渡すと空のMapを返す', async () => {
      const promise = fetchMultiplePrices([])
      const prices = await promise

      expect(prices.size).toBe(0)
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('checkApiHealth', () => {
    it('APIが正常な場合はtrueを返す', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response)

      const promise = checkApiHealth()
      const isHealthy = await promise

      expect(isHealthy).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/ping'),
        expect.any(Object)
      )
    })

    it('APIエラーの場合はfalseを返す', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500
      } as Response)

      const promise = checkApiHealth()
      const isHealthy = await promise

      expect(isHealthy).toBe(false)
    })

    it('ネットワークエラーの場合はfalseを返す', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))

      const promise = checkApiHealth()
      const isHealthy = await promise

      expect(isHealthy).toBe(false)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Binance REST] Health check failed'),
        expect.any(Error)
      )
    })
  })

  describe('fetchServerTime', () => {
    it('サーバー時刻を取得できる', async () => {
      const mockTime = 1704067200000 // 2024-01-01 00:00:00 UTC

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ serverTime: mockTime })
      } as Response)

      const promise = fetchServerTime()
      const serverTime = await promise

      expect(serverTime).toBe(mockTime)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/time'),
        expect.any(Object)
      )
    })

    it('エラー時はエラーをスローする', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))

      const promise = fetchServerTime()

      await expect(promise).rejects.toThrow('Network error')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Binance REST] Failed to fetch server time'),
        expect.any(Error)
      )
    })
  })

  describe('リトライロジック', () => {
    it('レート制限エラー（429）の場合はリトライする', async () => {
      const config: RetryConfig = {
        maxRetries: 2,
        initialDelayMs: 1,
        maxDelayMs: 10,
        timeoutMs: 5000
      }

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers(),
          text: async () => 'Rate limit exceeded'
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ symbol: 'BTCUSDT', price: '43250.50' })
        } as Response)

      const promise = fetchTickerPrice('BTCUSDT', config)
      const price = await promise

      expect(price).toBe(43250.50)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Binance REST] Rate limit hit (429)')
      )
    })

    it('Retry-Afterヘッダーがある場合はそれに従う', async () => {
      const config: RetryConfig = {
        maxRetries: 1,
        initialDelayMs: 1,
        maxDelayMs: 10,
        timeoutMs: 5000
      }

      const headers = new Headers()
      headers.set('Retry-After', '0') // 即座にリトライ（テスト用）

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers,
          text: async () => 'Rate limit exceeded'
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ symbol: 'BTCUSDT', price: '43250.50' })
        } as Response)

      const promise = fetchTickerPrice('BTCUSDT', config)
      const price = await promise

      expect(price).toBe(43250.50)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Binance REST] Rate limit hit (429)')
      )
    })

    it('すべてのリトライが失敗した場合はエラーをスローする', async () => {
      const config: RetryConfig = {
        maxRetries: 2,
        initialDelayMs: 1,
        maxDelayMs: 10,
        timeoutMs: 5000
      }

      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error'
      } as Response)

      const promise = fetchTickerPrice('BTCUSDT', config)

      await expect(promise).rejects.toThrow('Binance API request failed after 3 attempts')
      expect(fetchMock).toHaveBeenCalledTimes(3) // 初回 + 2回リトライ
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2)
    })

    it('指数バックオフで遅延時間が増加する', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1,
        maxDelayMs: 100,
        timeoutMs: 5000
      }

      fetchMock.mockRejectedValue(new Error('Network error'))

      await expect(fetchTickerPrice('BTCUSDT', config)).rejects.toThrow()

      // 指数バックオフ: 1ms, 2ms, 4ms
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('Retrying after 1ms')
      )
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('Retrying after 2ms')
      )
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('Retrying after 4ms')
      )
    })

    it('maxDelayMsを超える遅延時間は制限される', async () => {
      const config: RetryConfig = {
        maxRetries: 5,
        initialDelayMs: 1,
        maxDelayMs: 5, // 最大5ms
        timeoutMs: 5000
      }

      fetchMock.mockRejectedValue(new Error('Network error'))

      await expect(fetchTickerPrice('BTCUSDT', config)).rejects.toThrow()

      // 指数バックオフ: 1, 2, 4, 8 → 5 (制限), 16 → 5 (制限)
      const warnings = consoleWarnSpy.mock.calls.map(call => call[0])
      expect(warnings.some(w => w.includes('Retrying after 5ms'))).toBe(true)
    })
  })

})
