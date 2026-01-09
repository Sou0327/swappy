/**
 * Binanceシンボルマッピングユーティリティのユニットテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  marketToBinanceSymbol,
  binanceSymbolToMarket,
  validateMarket,
  isSupportedMarket,
  marketsToBinanceSymbols,
  parseMarket,
  SUPPORTED_MARKETS
} from '../../../../lib/binance/symbol'

describe('Binance Symbol Utils', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('marketToBinanceSymbol', () => {
    it('正常な市場名をBinanceシンボルに変換できる', () => {
      expect(marketToBinanceSymbol('BTC/USDT')).toBe('BTCUSDT')
      expect(marketToBinanceSymbol('ETH/USDT')).toBe('ETHUSDT')
      expect(marketToBinanceSymbol('XRP/USDT')).toBe('XRPUSDT')
    })

    it('小文字の市場名を大文字に変換する', () => {
      expect(marketToBinanceSymbol('btc/usdt')).toBe('BTCUSDT')
      expect(marketToBinanceSymbol('eth/usdt')).toBe('ETHUSDT')
    })

    it('混在したケースを大文字に変換する', () => {
      expect(marketToBinanceSymbol('Btc/Usdt')).toBe('BTCUSDT')
      expect(marketToBinanceSymbol('BtC/UsDt')).toBe('BTCUSDT')
    })

    it('様々なペアを正しく変換できる', () => {
      expect(marketToBinanceSymbol('BNB/USDT')).toBe('BNBUSDT')
      expect(marketToBinanceSymbol('ADA/USDT')).toBe('ADAUSDT')
      expect(marketToBinanceSymbol('SOL/USDT')).toBe('SOLUSDT')
    })

    it('空文字列の場合はエラーをスローする', () => {
      expect(() => marketToBinanceSymbol('')).toThrow('Invalid market: must be a non-empty string')
    })

    it('nullの場合はエラーをスローする', () => {
      // @ts-expect-error - テストのため意図的にnullを渡す
      expect(() => marketToBinanceSymbol(null)).toThrow('Invalid market: must be a non-empty string')
    })

    it('undefinedの場合はエラーをスローする', () => {
      // @ts-expect-error - テストのため意図的にundefinedを渡す
      expect(() => marketToBinanceSymbol(undefined)).toThrow('Invalid market: must be a non-empty string')
    })

    it('数値の場合はエラーをスローする', () => {
      // @ts-expect-error - テストのため意図的に数値を渡す
      expect(() => marketToBinanceSymbol(123)).toThrow('Invalid market: must be a non-empty string')
    })

    it('スラッシュがない場合でも長さが適切ならエラーにならない', () => {
      // 実装上、スラッシュの有無を必須要件としていないため
      // 'BTCUSDT'は8文字で正規表現 /^[A-Z]{6,12}$/ を通過する
      expect(() => marketToBinanceSymbol('BTCUSDT')).not.toThrow()
      expect(marketToBinanceSymbol('BTCUSDT')).toBe('BTCUSDT')
    })

    it('シンボルが短すぎる場合はエラーをスローする', () => {
      expect(() => marketToBinanceSymbol('B/U')).toThrow('Invalid market format')
    })

    it('シンボルが長すぎる場合はエラーをスローする', () => {
      expect(() => marketToBinanceSymbol('VERYLONGNAME/USDT')).toThrow('Invalid market format')
    })

    it('無効な文字を含む場合はエラーをスローする', () => {
      expect(() => marketToBinanceSymbol('BTC-USDT')).toThrow('Invalid market format')
      expect(() => marketToBinanceSymbol('BTC_USDT')).toThrow('Invalid market format')
    })
  })

  describe('binanceSymbolToMarket', () => {
    it('USDTペアを正しく変換できる', () => {
      expect(binanceSymbolToMarket('BTCUSDT')).toBe('BTC/USDT')
      expect(binanceSymbolToMarket('ETHUSDT')).toBe('ETH/USDT')
      expect(binanceSymbolToMarket('XRPUSDT')).toBe('XRP/USDT')
    })

    it('BUSDペアを正しく変換できる', () => {
      expect(binanceSymbolToMarket('BTCBUSD')).toBe('BTC/BUSD')
      expect(binanceSymbolToMarket('ETHBUSD')).toBe('ETH/BUSD')
    })

    it('BTCペアを正しく変換できる', () => {
      expect(binanceSymbolToMarket('ETHBTC')).toBe('ETH/BTC')
      expect(binanceSymbolToMarket('XRPBTC')).toBe('XRP/BTC')
    })

    it('ETHペアを正しく変換できる', () => {
      expect(binanceSymbolToMarket('ADAETH')).toBe('ADA/ETH')
      expect(binanceSymbolToMarket('XRPETH')).toBe('XRP/ETH')
    })

    it('小文字のシンボルを大文字に変換する', () => {
      expect(binanceSymbolToMarket('btcusdt')).toBe('BTC/USDT')
      expect(binanceSymbolToMarket('ethusdt')).toBe('ETH/USDT')
    })

    it('混在したケースを正しく処理する', () => {
      expect(binanceSymbolToMarket('BtcUsdt')).toBe('BTC/USDT')
      expect(binanceSymbolToMarket('EtHuSdT')).toBe('ETH/USDT')
    })

    it('デフォルトの4文字クォート通貨を正しく処理する', () => {
      // USDTやBUSD以外の4文字クォート通貨
      expect(binanceSymbolToMarket('BTCTUSD')).toBe('BTC/TUSD')
    })

    it('空文字列の場合はエラーをスローする', () => {
      expect(() => binanceSymbolToMarket('')).toThrow('Invalid symbol: must be a non-empty string')
    })

    it('nullの場合はエラーをスローする', () => {
      // @ts-expect-error - テストのため意図的にnullを渡す
      expect(() => binanceSymbolToMarket(null)).toThrow('Invalid symbol: must be a non-empty string')
    })

    it('undefinedの場合はエラーをスローする', () => {
      // @ts-expect-error - テストのため意図的にundefinedを渡す
      expect(() => binanceSymbolToMarket(undefined)).toThrow('Invalid symbol: must be a non-empty string')
    })
  })

  describe('validateMarket', () => {
    it('有効な市場名を検証できる', () => {
      expect(validateMarket('BTC/USDT')).toBe(true)
      expect(validateMarket('ETH/USDT')).toBe(true)
      expect(validateMarket('XRP/USDT')).toBe(true)
    })

    it('様々な有効な形式を受け入れる', () => {
      expect(validateMarket('BNB/USDT')).toBe(true)
      expect(validateMarket('ADA/BUSD')).toBe(true)
      expect(validateMarket('ETH/BTC')).toBe(true)
    })

    it('数字を含むベース通貨を受け入れる', () => {
      expect(validateMarket('1INCH/USDT')).toBe(true)
    })

    it('スラッシュがない市場名は無効', () => {
      expect(validateMarket('BTCUSDT')).toBe(false)
    })

    it('空文字列は無効', () => {
      expect(validateMarket('')).toBe(false)
    })

    it('nullは無効', () => {
      // @ts-expect-error - テストのため意図的にnullを渡す
      expect(validateMarket(null)).toBe(false)
    })

    it('undefinedは無効', () => {
      // @ts-expect-error - テストのため意図的にundefinedを渡す
      expect(validateMarket(undefined)).toBe(false)
    })

    it('スラッシュが複数ある場合は無効', () => {
      expect(validateMarket('BTC/USD/T')).toBe(false)
    })

    it('ベース通貨が短すぎる場合は無効', () => {
      expect(validateMarket('B/USDT')).toBe(false)
    })

    it('ベース通貨が長すぎる場合は無効', () => {
      expect(validateMarket('VERYLONGNAME/USDT')).toBe(false)
    })

    it('クォート通貨が短すぎる場合は無効', () => {
      expect(validateMarket('BTC/US')).toBe(false)
    })

    it('クォート通貨が長すぎる場合は無効', () => {
      expect(validateMarket('BTC/VERYLONG')).toBe(false)
    })

    it('小文字の市場名は無効（大文字のみ受け入れ）', () => {
      expect(validateMarket('btc/usdt')).toBe(false)
    })

    it('クォート通貨に数字が含まれる場合は無効', () => {
      expect(validateMarket('BTC/USD1')).toBe(false)
    })
  })

  describe('isSupportedMarket', () => {
    it('サポート対象の市場を正しく識別できる', () => {
      expect(isSupportedMarket('BTC/USDT')).toBe(true)
      expect(isSupportedMarket('ETH/USDT')).toBe(true)
      expect(isSupportedMarket('XRP/USDT')).toBe(true)
    })

    it('SUPPORTED_MARKETSの全要素がサポート対象として認識される', () => {
      SUPPORTED_MARKETS.forEach(market => {
        expect(isSupportedMarket(market)).toBe(true)
      })
    })

    it('サポート対象外の市場を正しく識別できる', () => {
      expect(isSupportedMarket('UNKNOWN/USDT')).toBe(false)
      expect(isSupportedMarket('FAKE/USDT')).toBe(false)
    })

    it('似ているが異なる市場名は非サポート', () => {
      expect(isSupportedMarket('BTC/BUSD')).toBe(false) // USDTではなくBUSD
      expect(isSupportedMarket('btc/usdt')).toBe(false) // 小文字
    })

    it('空文字列は非サポート', () => {
      expect(isSupportedMarket('')).toBe(false)
    })
  })

  describe('marketsToBinanceSymbols', () => {
    it('複数の市場を一括変換できる', () => {
      const markets = ['BTC/USDT', 'ETH/USDT', 'XRP/USDT']
      const symbols = marketsToBinanceSymbols(markets)

      expect(symbols).toEqual(['BTCUSDT', 'ETHUSDT', 'XRPUSDT'])
    })

    it('空配列を渡すと空配列を返す', () => {
      expect(marketsToBinanceSymbols([])).toEqual([])
    })

    it('無効な市場が含まれる場合はフィルタリングする', () => {
      // 'A/B'は4文字で正規表現 /^[A-Z]{6,12}$/ を通過しない
      const markets = ['BTC/USDT', 'A/B', 'ETH/USDT']
      const symbols = marketsToBinanceSymbols(markets)

      expect(symbols).toEqual(['BTCUSDT', 'ETHUSDT'])
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to convert market A/B'),
        expect.any(Error)
      )
    })

    it('すべての市場が無効な場合は空配列を返す', () => {
      // 4文字以下のシンボルは正規表現を通過しない
      const markets = ['A/B', 'X/Y']
      const symbols = marketsToBinanceSymbols(markets)

      expect(symbols).toEqual([])
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
    })

    it('nullが含まれる場合はフィルタリングする', () => {
      // @ts-expect-error - テストのため意図的にnullを含める
      const markets = ['BTC/USDT', null, 'ETH/USDT']
      const symbols = marketsToBinanceSymbols(markets)

      expect(symbols).toEqual(['BTCUSDT', 'ETHUSDT'])
    })

    it('様々な有効な市場を変換できる', () => {
      const markets = SUPPORTED_MARKETS.slice(0, 5) as string[]
      const symbols = marketsToBinanceSymbols(markets)

      expect(symbols.length).toBe(5)
      expect(symbols).toEqual(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT'])
    })
  })

  describe('parseMarket', () => {
    it('市場名をベース通貨とクォート通貨に分割できる', () => {
      const result = parseMarket('BTC/USDT')

      expect(result).toEqual({ base: 'BTC', quote: 'USDT' })
    })

    it('様々な市場名を正しくパースできる', () => {
      expect(parseMarket('ETH/USDT')).toEqual({ base: 'ETH', quote: 'USDT' })
      expect(parseMarket('XRP/USDT')).toEqual({ base: 'XRP', quote: 'USDT' })
      expect(parseMarket('BNB/BUSD')).toEqual({ base: 'BNB', quote: 'BUSD' })
    })

    it('数字を含むベース通貨を正しくパースできる', () => {
      expect(parseMarket('1INCH/USDT')).toEqual({ base: '1INCH', quote: 'USDT' })
    })

    it('無効な市場名の場合はエラーをスローする', () => {
      expect(() => parseMarket('INVALID')).toThrow('Invalid market format: INVALID')
      expect(() => parseMarket('BTC-USDT')).toThrow('Invalid market format')
    })

    it('空文字列の場合はエラーをスローする', () => {
      expect(() => parseMarket('')).toThrow('Invalid market format')
    })

    it('スラッシュのみの場合はエラーをスローする', () => {
      expect(() => parseMarket('/')).toThrow('Invalid market format')
    })

    it('小文字の市場名はエラーをスローする', () => {
      expect(() => parseMarket('btc/usdt')).toThrow('Invalid market format')
    })
  })

  describe('SUPPORTED_MARKETS', () => {
    it('定義されたサポート市場が期待通りである', () => {
      expect(SUPPORTED_MARKETS).toContain('BTC/USDT')
      expect(SUPPORTED_MARKETS).toContain('ETH/USDT')
      expect(SUPPORTED_MARKETS).toContain('XRP/USDT')
    })

    it('サポート市場の数が正しい', () => {
      expect(SUPPORTED_MARKETS.length).toBe(10)
    })

    it('すべてのサポート市場が有効な形式である', () => {
      SUPPORTED_MARKETS.forEach(market => {
        expect(validateMarket(market)).toBe(true)
      })
    })

    it('すべてのサポート市場がBinanceシンボルに変換できる', () => {
      SUPPORTED_MARKETS.forEach(market => {
        expect(() => marketToBinanceSymbol(market)).not.toThrow()
      })
    })
  })
})
