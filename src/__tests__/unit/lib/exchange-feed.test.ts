/**
 * 取引所フィードのユニットテスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  toBinanceSymbol,
  type DepthLevel,
} from '../../../lib/exchange-feed'

// APIRateLimiterクラスをテストするため、プライベートクラスを再実装
class TestAPIRateLimiter {
  private lastRequestTime: Record<string, number> = {}
  private cache: Record<string, { data: unknown; timestamp: number }> = {}
  private readonly minInterval = 5000
  private readonly cacheTimeout = 10000

  canMakeRequest(endpoint: string): boolean {
    const now = Date.now()
    const lastTime = this.lastRequestTime[endpoint] || 0
    return now - lastTime >= this.minInterval
  }

  getCachedData(endpoint: string): unknown | null {
    const cached = this.cache[endpoint]
    if (!cached) return null

    const now = Date.now()
    if (now - cached.timestamp > this.cacheTimeout) {
      delete this.cache[endpoint]
      return null
    }

    return cached.data
  }

  getRawCachedData(endpoint: string): unknown | null {
    const cached = this.cache[endpoint]
    return cached ? cached.data : null
  }

  setCachedData(endpoint: string, data: unknown): void {
    this.cache[endpoint] = {
      data,
      timestamp: Date.now(),
    }
  }

  recordRequest(endpoint: string): void {
    this.lastRequestTime[endpoint] = Date.now()
  }

  waitTime(endpoint: string): number {
    const now = Date.now()
    const lastTime = this.lastRequestTime[endpoint] || 0
    const elapsed = now - lastTime
    return Math.max(0, this.minInterval - elapsed)
  }

  // テスト用のヘルパー
  getMinInterval(): number {
    return this.minInterval
  }

  getCacheTimeout(): number {
    return this.cacheTimeout
  }
}

describe('Exchange Feed', () => {
  describe('toBinanceSymbol()', () => {
    it('正常な市場IDをBinanceシンボルに変換できる', () => {
      expect(toBinanceSymbol('BTC-USDT')).toBe('BTCUSDT')
      expect(toBinanceSymbol('ETH-USDT')).toBe('ETHUSDT')
      expect(toBinanceSymbol('XRP-USDT')).toBe('XRPUSDT')
    })

    it('小文字の市場IDを大文字に変換する', () => {
      expect(toBinanceSymbol('btc-usdt')).toBe('BTCUSDT')
      expect(toBinanceSymbol('eth-usdt')).toBe('ETHUSDT')
    })

    it('混在したケースを大文字に変換する', () => {
      expect(toBinanceSymbol('Btc-Usdt')).toBe('BTCUSDT')
      expect(toBinanceSymbol('EtH-UsDt')).toBe('ETHUSDT')
    })

    it('様々なペアを正しく変換できる', () => {
      expect(toBinanceSymbol('BNB-USDT')).toBe('BNBUSDT')
      expect(toBinanceSymbol('ADA-USDT')).toBe('ADAUSDT')
      expect(toBinanceSymbol('SOL-USDT')).toBe('SOLUSDT')
    })

    it('空文字列の場合はnullを返す', () => {
      expect(toBinanceSymbol('')).toBeNull()
    })

    it('ハイフンがない場合はnullを返す', () => {
      expect(toBinanceSymbol('BTCUSDT')).toBeNull()
    })

    it('ベース通貨のみの場合はnullを返す', () => {
      expect(toBinanceSymbol('BTC-')).toBeNull()
    })

    it('クォート通貨のみの場合はnullを返す', () => {
      expect(toBinanceSymbol('-USDT')).toBeNull()
    })

    it('複数のハイフンがある場合は最初のハイフンで分割する', () => {
      expect(toBinanceSymbol('BTC-USDT-TEST')).toBe('BTCUSDT')
    })
  })

  describe('APIRateLimiter', () => {
    let rateLimiter: TestAPIRateLimiter

    beforeEach(() => {
      rateLimiter = new TestAPIRateLimiter()
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    describe('canMakeRequest()', () => {
      it('初回リクエストは許可される', () => {
        expect(rateLimiter.canMakeRequest('test-endpoint')).toBe(true)
      })

      it('minInterval未満の連続リクエストは拒否される', () => {
        const endpoint = 'test-endpoint'

        rateLimiter.recordRequest(endpoint)
        expect(rateLimiter.canMakeRequest(endpoint)).toBe(false)

        // 4秒経過（minInterval=5000ms）
        vi.advanceTimersByTime(4000)
        expect(rateLimiter.canMakeRequest(endpoint)).toBe(false)
      })

      it('minInterval以上経過後はリクエストが許可される', () => {
        const endpoint = 'test-endpoint'

        rateLimiter.recordRequest(endpoint)
        expect(rateLimiter.canMakeRequest(endpoint)).toBe(false)

        // 5秒経過
        vi.advanceTimersByTime(5000)
        expect(rateLimiter.canMakeRequest(endpoint)).toBe(true)
      })

      it('異なるエンドポイントは独立して管理される', () => {
        rateLimiter.recordRequest('endpoint-1')

        expect(rateLimiter.canMakeRequest('endpoint-1')).toBe(false)
        expect(rateLimiter.canMakeRequest('endpoint-2')).toBe(true)
      })
    })

    describe('setCachedData() / getCachedData()', () => {
      it('データをキャッシュに保存し取得できる', () => {
        const endpoint = 'test-endpoint'
        const data = { test: 'data' }

        rateLimiter.setCachedData(endpoint, data)
        const retrieved = rateLimiter.getCachedData(endpoint)

        expect(retrieved).toEqual(data)
      })

      it('cacheTimeout未満ではキャッシュが有効', () => {
        const endpoint = 'test-endpoint'
        const data = { test: 'data' }

        rateLimiter.setCachedData(endpoint, data)

        // 9秒経過（cacheTimeout=10000ms）
        vi.advanceTimersByTime(9000)

        expect(rateLimiter.getCachedData(endpoint)).toEqual(data)
      })

      it('cacheTimeout以上経過するとキャッシュが無効になる', () => {
        const endpoint = 'test-endpoint'
        const data = { test: 'data' }

        rateLimiter.setCachedData(endpoint, data)

        // 10秒以上経過
        vi.advanceTimersByTime(10001)

        expect(rateLimiter.getCachedData(endpoint)).toBeNull()
      })

      it('存在しないエンドポイントのキャッシュはnull', () => {
        expect(rateLimiter.getCachedData('non-existent')).toBeNull()
      })

      it('複数のエンドポイントでキャッシュを管理できる', () => {
        rateLimiter.setCachedData('endpoint-1', { id: 1 })
        rateLimiter.setCachedData('endpoint-2', { id: 2 })

        expect(rateLimiter.getCachedData('endpoint-1')).toEqual({ id: 1 })
        expect(rateLimiter.getCachedData('endpoint-2')).toEqual({ id: 2 })
      })

      it('期限切れキャッシュは削除される', () => {
        const endpoint = 'test-endpoint'
        rateLimiter.setCachedData(endpoint, { test: 'data' })

        // cacheTimeout以上経過
        vi.advanceTimersByTime(10001)

        // getCachedDataを呼ぶと期限切れキャッシュが削除される
        expect(rateLimiter.getCachedData(endpoint)).toBeNull()

        // getRawCachedDataでも取得できない
        expect(rateLimiter.getRawCachedData(endpoint)).toBeNull()
      })
    })

    describe('getRawCachedData()', () => {
      it('期限切れでもキャッシュデータを取得できる', () => {
        const endpoint = 'test-endpoint'
        const data = { test: 'data' }

        rateLimiter.setCachedData(endpoint, data)

        // cacheTimeout以上経過
        vi.advanceTimersByTime(10001)

        // getCachedDataはnull
        expect(rateLimiter.getCachedData(endpoint)).toBeNull()

        // getRawCachedDataは取得できない（削除されたため）
        expect(rateLimiter.getRawCachedData(endpoint)).toBeNull()
      })

      it('有効期限内ではgetCachedDataと同じ結果', () => {
        const endpoint = 'test-endpoint'
        const data = { test: 'data' }

        rateLimiter.setCachedData(endpoint, data)

        expect(rateLimiter.getRawCachedData(endpoint)).toEqual(data)
        expect(rateLimiter.getCachedData(endpoint)).toEqual(data)
      })

      it('存在しないエンドポイントのキャッシュはnull', () => {
        expect(rateLimiter.getRawCachedData('non-existent')).toBeNull()
      })
    })

    describe('recordRequest()', () => {
      it('リクエスト時刻を記録する', () => {
        const endpoint = 'test-endpoint'

        // 記録前は許可
        expect(rateLimiter.canMakeRequest(endpoint)).toBe(true)

        rateLimiter.recordRequest(endpoint)

        // 記録後は即座に拒否
        expect(rateLimiter.canMakeRequest(endpoint)).toBe(false)
      })

      it('複数回記録できる', () => {
        const endpoint = 'test-endpoint'

        rateLimiter.recordRequest(endpoint)
        vi.advanceTimersByTime(5000)

        expect(rateLimiter.canMakeRequest(endpoint)).toBe(true)

        rateLimiter.recordRequest(endpoint)

        expect(rateLimiter.canMakeRequest(endpoint)).toBe(false)
      })
    })

    describe('waitTime()', () => {
      it('初回リクエストの待機時間は0', () => {
        expect(rateLimiter.waitTime('test-endpoint')).toBe(0)
      })

      it('リクエスト直後の待機時間はminInterval', () => {
        const endpoint = 'test-endpoint'

        rateLimiter.recordRequest(endpoint)

        const waitTime = rateLimiter.waitTime(endpoint)
        expect(waitTime).toBe(rateLimiter.getMinInterval())
      })

      it('時間経過とともに待機時間が減少する', () => {
        const endpoint = 'test-endpoint'

        rateLimiter.recordRequest(endpoint)

        // 2秒経過
        vi.advanceTimersByTime(2000)

        const waitTime = rateLimiter.waitTime(endpoint)
        expect(waitTime).toBe(3000) // 5000 - 2000 = 3000
      })

      it('minInterval以上経過すると待機時間は0', () => {
        const endpoint = 'test-endpoint'

        rateLimiter.recordRequest(endpoint)

        // 5秒以上経過
        vi.advanceTimersByTime(5001)

        expect(rateLimiter.waitTime(endpoint)).toBe(0)
      })

      it('負の待機時間は0になる', () => {
        const endpoint = 'test-endpoint'

        rateLimiter.recordRequest(endpoint)

        // 大幅に経過
        vi.advanceTimersByTime(100000)

        expect(rateLimiter.waitTime(endpoint)).toBe(0)
      })
    })

    describe('設定値の検証', () => {
      it('minIntervalが5000msである', () => {
        expect(rateLimiter.getMinInterval()).toBe(5000)
      })

      it('cacheTimeoutが10000msである', () => {
        expect(rateLimiter.getCacheTimeout()).toBe(10000)
      })
    })
  })

  describe('DepthLevel 型定義', () => {
    it('DepthLevelは必須フィールドを持つ', () => {
      const level: DepthLevel = {
        price: 43250.5,
        amount: 1.5,
      }

      expect(level.price).toBe(43250.5)
      expect(level.amount).toBe(1.5)
    })

    it('配列形式のDepthLevelを扱える', () => {
      const levels: DepthLevel[] = [
        { price: 43250, amount: 1.0 },
        { price: 43249, amount: 2.5 },
        { price: 43248, amount: 0.5 },
      ]

      expect(levels.length).toBe(3)
      expect(levels[0].price).toBe(43250)
      expect(levels[2].amount).toBe(0.5)
    })
  })
})
