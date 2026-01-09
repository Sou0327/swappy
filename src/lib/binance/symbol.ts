/**
 * Binanceシンボルマッピングユーティリティ
 *
 * システム内の市場表記（例: BTC/USDT）とBinance APIのシンボル形式（例: BTCUSDT）を相互変換します。
 */

/**
 * サポート対象の市場定義
 */
export const SUPPORTED_MARKETS = [
  'BTC/USDT',
  'ETH/USDT',
  'BNB/USDT',
  'XRP/USDT',
  'ADA/USDT',
  'SOL/USDT',
  'DOT/USDT',
  'DOGE/USDT',
  'MATIC/USDT',
  'LTC/USDT',
] as const;

export type SupportedMarket = typeof SUPPORTED_MARKETS[number];

/**
 * 市場名をBinanceシンボル形式に変換
 *
 * @param market - システム内の市場名（例: "BTC/USDT"）
 * @returns Binanceシンボル（例: "BTCUSDT"）
 * @throws {Error} 無効な市場名の場合
 *
 * @example
 * marketToBinanceSymbol("BTC/USDT") // "BTCUSDT"
 * marketToBinanceSymbol("ETH/USDT") // "ETHUSDT"
 */
export function marketToBinanceSymbol(market: string): string {
  if (!market || typeof market !== 'string') {
    throw new Error('Invalid market: must be a non-empty string');
  }

  // スラッシュを除去してBinanceシンボル形式に変換
  const symbol = market.replace('/', '').toUpperCase();

  // 基本的な形式検証
  if (!/^[A-Z]{6,12}$/.test(symbol)) {
    throw new Error(`Invalid market format: ${market}. Expected format: "BASE/QUOTE" (e.g., "BTC/USDT")`);
  }

  return symbol;
}

/**
 * BinanceシンボルをシステムのマーケットID形式に変換
 *
 * @param symbol - Binanceシンボル（例: "BTCUSDT"）
 * @returns 市場名（例: "BTC/USDT"）
 *
 * @example
 * binanceSymbolToMarket("BTCUSDT") // "BTC/USDT"
 * binanceSymbolToMarket("ETHUSDT") // "ETH/USDT"
 */
export function binanceSymbolToMarket(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Invalid symbol: must be a non-empty string');
  }

  const upperSymbol = symbol.toUpperCase();

  // USDTペアの場合（最も一般的）
  if (upperSymbol.endsWith('USDT')) {
    const base = upperSymbol.slice(0, -4);
    return `${base}/USDT`;
  }

  // その他のクォート通貨（将来的な拡張用）
  if (upperSymbol.endsWith('BUSD')) {
    const base = upperSymbol.slice(0, -4);
    return `${base}/BUSD`;
  }

  if (upperSymbol.endsWith('BTC')) {
    const base = upperSymbol.slice(0, -3);
    return `${base}/BTC`;
  }

  if (upperSymbol.endsWith('ETH')) {
    const base = upperSymbol.slice(0, -3);
    return `${base}/ETH`;
  }

  // デフォルト: 最後の4文字をクォート通貨として扱う
  const base = upperSymbol.slice(0, -4);
  const quote = upperSymbol.slice(-4);
  return `${base}/${quote}`;
}

/**
 * 市場名が有効かどうかを検証
 *
 * @param market - 検証する市場名
 * @returns 有効な場合true
 *
 * @example
 * validateMarket("BTC/USDT") // true
 * validateMarket("INVALID") // false
 */
export function validateMarket(market: string): boolean {
  if (!market || typeof market !== 'string') {
    return false;
  }

  // スラッシュが含まれているかチェック
  if (!market.includes('/')) {
    return false;
  }

  const parts = market.split('/');
  if (parts.length !== 2) {
    return false;
  }

  const [base, quote] = parts;

  // ベース通貨とクォート通貨が有効な形式か検証
  if (!/^[A-Z0-9]{2,10}$/.test(base) || !/^[A-Z]{3,6}$/.test(quote)) {
    return false;
  }

  return true;
}

/**
 * サポート対象の市場かどうかを確認
 *
 * @param market - 確認する市場名
 * @returns サポート対象の場合true
 *
 * @example
 * isSupportedMarket("BTC/USDT") // true
 * isSupportedMarket("UNKNOWN/USDT") // false
 */
export function isSupportedMarket(market: string): market is SupportedMarket {
  return SUPPORTED_MARKETS.includes(market as SupportedMarket);
}

/**
 * 複数の市場をBinanceシンボルに一括変換
 *
 * @param markets - 市場名の配列
 * @returns Binanceシンボルの配列
 *
 * @example
 * marketsToBinanceSymbols(["BTC/USDT", "ETH/USDT"]) // ["BTCUSDT", "ETHUSDT"]
 */
export function marketsToBinanceSymbols(markets: string[]): string[] {
  return markets.map(market => {
    try {
      return marketToBinanceSymbol(market);
    } catch (error) {
      console.error(`Failed to convert market ${market}:`, error);
      return null;
    }
  }).filter((symbol): symbol is string => symbol !== null);
}

/**
 * 市場名からベース通貨とクォート通貨を抽出
 *
 * @param market - 市場名（例: "BTC/USDT"）
 * @returns ベース通貨とクォート通貨のオブジェクト
 *
 * @example
 * parseMarket("BTC/USDT") // { base: "BTC", quote: "USDT" }
 */
export function parseMarket(market: string): { base: string; quote: string } {
  if (!validateMarket(market)) {
    throw new Error(`Invalid market format: ${market}`);
  }

  const [base, quote] = market.split('/');
  return { base, quote };
}
