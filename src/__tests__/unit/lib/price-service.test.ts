/**
 * 価格サービスのユニットテスト
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getPriceSnapshot, computePairRate } from '../../../lib/price-service'

describe('PriceService', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>
  let testStartTime = 10000000 // 大きな初期値から開始

  beforeEach(() => {
    // 各テストで異なる時刻を設定してキャッシュを無効化
    // テスト内でvi.advanceTimersByTime()を呼ぶ可能性を考慮して大きめの値
    testStartTime += 600000 // TTL(300000ms)を十分に超える時間を進める
    vi.useFakeTimers({ now: testStartTime })
    fetchMock = vi.spyOn(global, 'fetch')
  })

  afterEach(() => {
    vi.useRealTimers()
    fetchMock.mockRestore()
  })

  describe('getPriceSnapshot', () => {
    it('正常にUSD価格を取得できる', async () => {
      // CoinGecko APIのレスポンスをモック
      fetchMock.mockImplementation((url) => {
        const urlStr = url.toString()

        if (urlStr.includes('simple/price') && urlStr.includes('vs_currencies=usd')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              bitcoin: { usd: 97000 },
              ethereum: { usd: 3800 },
              ripple: { usd: 2.3 },
              tether: { usd: 1.0 }
            })
          } as Response)
        }

        if (urlStr.includes('tether') && urlStr.includes('vs_currencies=jpy')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              tether: { jpy: 150 }
            })
          } as Response)
        }

        return Promise.reject(new Error('Unexpected URL'))
      })

      const result = await getPriceSnapshot(['BTC', 'ETH', 'XRP', 'USDT'])

      expect(result.usd).toHaveProperty('BTC')
      expect(result.usd).toHaveProperty('ETH')
      expect(result.usd).toHaveProperty('XRP')
      expect(result.usd.USDT).toBe(1.0) // ステーブルコインは常に1.0
      expect(result.usd.USDC).toBe(1.0) // ステーブルコインは常に1.0
      expect(result.usd_jpy).toBe(150)
    })

    it('キャッシュが有効な場合は再取得しない', async () => {
      fetchMock.mockImplementation((url) => {
        const urlStr = url.toString()

        if (urlStr.includes('vs_currencies=usd')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              bitcoin: { usd: 97000 }
            })
          } as Response)
        }

        if (urlStr.includes('vs_currencies=jpy')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              tether: { jpy: 150 }
            })
          } as Response)
        }

        return Promise.reject(new Error('Unexpected URL'))
      })

      // 1回目の取得
      await getPriceSnapshot(['BTC'])
      const firstCallCount = fetchMock.mock.calls.length

      // 2回目の取得（キャッシュTTL内）
      vi.advanceTimersByTime(60000) // 1分進める（TTLは5分なのでまだ有効）
      await getPriceSnapshot(['BTC'])

      // fetchは1回目だけ呼ばれる
      expect(fetchMock.mock.calls.length).toBe(firstCallCount)
    })

    it('キャッシュTTL超過後は再取得する', async () => {
      fetchMock.mockImplementation((url) => {
        const urlStr = url.toString()

        if (urlStr.includes('vs_currencies=usd')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              bitcoin: { usd: 97000 }
            })
          } as Response)
        }

        if (urlStr.includes('vs_currencies=jpy')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              tether: { jpy: 150 }
            })
          } as Response)
        }

        return Promise.reject(new Error('Unexpected URL'))
      })

      // 1回目の取得
      await getPriceSnapshot(['BTC'])
      const firstCallCount = fetchMock.mock.calls.length

      // TTLを超過（5分以上）
      vi.advanceTimersByTime(301000) // 5分1秒進める

      // 2回目の取得
      await getPriceSnapshot(['BTC'])

      // fetchが再度呼ばれる
      expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCallCount)
    })

    it('レート制限エラー（429）時はデフォルト値を返す', async () => {
      // 前のテストのキャッシュを無効化するため、十分に未来の時刻を設定
      vi.setSystemTime(testStartTime + 999999999)

      fetchMock.mockImplementation((url) => {
        const urlStr = url.toString()

        if (urlStr.includes('vs_currencies=usd')) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: async () => ({})
          } as Response)
        }

        if (urlStr.includes('vs_currencies=jpy')) {
          return Promise.resolve({
            ok: false,
            status: 429,
            json: async () => ({})
          } as Response)
        }

        return Promise.reject(new Error('Unexpected URL'))
      })

      const result = await getPriceSnapshot(['BTC', 'ETH'])

      // デフォルト値が返される
      expect(result.usd.BTC).toBe(97000)
      expect(result.usd.ETH).toBe(3800)
      expect(result.usd.USDT).toBe(1)
      expect(result.usd_jpy).toBe(150)
    })

    it('API エラー時はデフォルト値を返す', async () => {
      fetchMock.mockImplementation((url) => {
        const urlStr = url.toString()

        if (urlStr.includes('vs_currencies=usd')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({})
          } as Response)
        }

        if (urlStr.includes('vs_currencies=jpy')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({})
          } as Response)
        }

        return Promise.reject(new Error('Unexpected URL'))
      })

      const result = await getPriceSnapshot(['BTC'])

      expect(result.usd.BTC).toBe(97000) // デフォルト値
      expect(result.usd_jpy).toBe(150) // デフォルト値
    })

    it('ネットワークエラー時はデフォルト値を返す', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'))

      const result = await getPriceSnapshot(['BTC', 'ETH'])

      // デフォルト値が返される
      expect(result.usd.BTC).toBe(97000)
      expect(result.usd.ETH).toBe(3800)
      expect(result.usd_jpy).toBe(150)
    })

    it('ステーブルコイン（USDT/USDC）は常に1.0に固定', async () => {
      fetchMock.mockImplementation((url) => {
        const urlStr = url.toString()

        if (urlStr.includes('vs_currencies=usd')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              tether: { usd: 0.9999 }, // 実際の市場価格
              'usd-coin': { usd: 1.0001 } // 実際の市場価格
            })
          } as Response)
        }

        if (urlStr.includes('vs_currencies=jpy')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              tether: { jpy: 150 }
            })
          } as Response)
        }

        return Promise.reject(new Error('Unexpected URL'))
      })

      const result = await getPriceSnapshot(['USDT', 'USDC'])

      // 市場の微小変動を無視して1.0に固定
      expect(result.usd.USDT).toBe(1.0)
      expect(result.usd.USDC).toBe(1.0)
    })

    it('空の配列でも正常に動作する', async () => {
      // 前のテストのキャッシュを無効化
      vi.setSystemTime(testStartTime + 1999999999)

      fetchMock.mockImplementation((url) => {
        const urlStr = url.toString()

        if (urlStr.includes('vs_currencies=jpy')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              tether: { jpy: 150 }
            })
          } as Response)
        }

        return Promise.reject(new Error('Unexpected URL'))
      })

      const result = await getPriceSnapshot([])

      // 空の配列の場合、fetchUsdPrices()は早期リターンで{}を返す
      expect(result.usd).toEqual({})
      expect(result.usd_jpy).toBe(150)
    })
  })

  describe('computePairRate', () => {
    const mockPrices = {
      usd: {
        BTC: 97000,
        ETH: 3800,
        USDT: 1.0,
        USDC: 1.0,
        XRP: 2.3,
        TRX: 0.23,
        ADA: 0.9
      },
      usd_jpy: 150
    }

    it('同じ通貨ペアのレートは1', () => {
      const rate = computePairRate('BTC', 'BTC', mockPrices)
      expect(rate).toBe(1)
    })

    it('BTC-USDTのレートを正しく計算できる', () => {
      const rate = computePairRate('BTC', 'USDT', mockPrices)
      expect(rate).toBe(97000) // 97000 USD / 1 USD
    })

    it('ETH-BTCのレートを正しく計算できる', () => {
      const rate = computePairRate('ETH', 'BTC', mockPrices)
      const expected = 3800 / 97000
      expect(rate).toBeCloseTo(expected, 10)
    })

    it('USDT-USDCのレートは1（ステーブルコイン同士）', () => {
      const rate = computePairRate('USDT', 'USDC', mockPrices)
      expect(rate).toBe(1)
    })

    it('USDCをUSDT扱いとして計算する', () => {
      const rate = computePairRate('BTC', 'USDC', mockPrices)
      expect(rate).toBe(97000) // USDCはUSDTと同じ扱い
    })

    it('JPY → 暗号通貨のレート計算', () => {
      const rate = computePairRate('JPY', 'BTC', mockPrices)
      // 1 JPY → USD = 1/150、USD → BTC = 1/97000
      const expected = (1 / 150) / (1 / 97000) // = 97000 / 150
      expect(rate).toBeCloseTo(expected, 10)
    })

    it('暗号通貨 → JPYのレート計算', () => {
      const rate = computePairRate('BTC', 'JPY', mockPrices)
      // BTC → USD = 97000、USD → JPY = 150
      const expected = 97000 * 150
      expect(rate).toBe(expected)
    })

    it('ETH → JPYのレート計算', () => {
      const rate = computePairRate('ETH', 'JPY', mockPrices)
      const expected = 3800 * 150
      expect(rate).toBe(expected)
    })

    it('JPY → JPYのレートは1', () => {
      const rate = computePairRate('JPY', 'JPY', mockPrices)
      expect(rate).toBe(1)
    })

    it('存在しない通貨ペアは0を返す', () => {
      const rate = computePairRate('UNKNOWN', 'BTC', mockPrices)
      expect(rate).toBe(0)
    })

    it('toが存在しない通貨の場合は0を返す', () => {
      const rate = computePairRate('BTC', 'UNKNOWN', mockPrices)
      expect(rate).toBe(0)
    })

    it('toの価格が0の場合は0を返す', () => {
      const pricesWithZero = {
        usd: {
          BTC: 97000,
          ZERO: 0
        },
        usd_jpy: 150
      }
      const rate = computePairRate('BTC', 'ZERO', pricesWithZero)
      expect(rate).toBe(0)
    })

    it('usd_jpyが未定義の場合でも暗号通貨ペアは計算できる', () => {
      const pricesWithoutJpy = {
        usd: {
          BTC: 97000,
          ETH: 3800
        }
      }
      const rate = computePairRate('BTC', 'ETH', pricesWithoutJpy)
      const expected = 97000 / 3800
      expect(rate).toBeCloseTo(expected, 10)
    })

    it('XRP-TRXのマイナー通貨ペアも計算できる', () => {
      const rate = computePairRate('XRP', 'TRX', mockPrices)
      const expected = 2.3 / 0.23
      expect(rate).toBe(expected)
    })

    it('少数の通貨ペア計算（TRX-ADA）', () => {
      const rate = computePairRate('TRX', 'ADA', mockPrices)
      const expected = 0.23 / 0.9
      expect(rate).toBeCloseTo(expected, 10)
    })
  })

  describe('統合テスト', () => {
    it('価格取得とペア計算を連携できる', async () => {
      // 前のテストのキャッシュを無効化
      vi.setSystemTime(testStartTime + 2999999999)

      fetchMock.mockImplementation((url) => {
        const urlStr = url.toString()

        if (urlStr.includes('vs_currencies=usd')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              bitcoin: { usd: 97000 },
              ethereum: { usd: 3800 }
            })
          } as Response)
        }

        if (urlStr.includes('vs_currencies=jpy')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              tether: { jpy: 150 }
            })
          } as Response)
        }

        return Promise.reject(new Error('Unexpected URL'))
      })

      const prices = await getPriceSnapshot(['BTC', 'ETH'])
      const btcEthRate = computePairRate('BTC', 'ETH', prices)
      const btcJpyRate = computePairRate('BTC', 'JPY', prices)

      expect(btcEthRate).toBeCloseTo(97000 / 3800, 10)
      expect(btcJpyRate).toBe(97000 * 150)
    })
  })
})
