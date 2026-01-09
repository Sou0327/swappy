/**
 * Binance REST APIクライアント
 *
 * WebSocketが利用できない場合のフォールバックとして、
 * REST APIから価格情報を取得します。
 *
 * 主な機能：
 * - Ticker価格の取得
 * - 指数バックオフによるリトライ
 * - タイムアウト制御
 * - エラーハンドリング
 */

import { PLATFORM_NAME } from '@/config/branding';

/**
 * REST APIのレスポンス型定義
 */
interface TickerPriceResponse {
  symbol: string;
  price: string;
}

interface Ticker24hrResponse {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
}

/**
 * リトライ設定
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

/**
 * デフォルトのリトライ設定
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  timeoutMs: 10000,
};

/**
 * Binance REST APIのベースURL
 */
const BINANCE_API_BASE = 'https://api.binance.com';

/**
 * 指数バックオフでの遅延時間を計算
 *
 * @param attempt - 現在の試行回数（0から開始）
 * @param config - リトライ設定
 * @returns 遅延時間（ミリ秒）
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(2, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * 指定時間待機するPromise
 *
 * @param ms - 待機時間（ミリ秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * タイムアウト付きfetch
 *
 * @param url - リクエストURL
 * @param timeoutMs - タイムアウト時間（ミリ秒）
 * @returns fetchのレスポンス
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': `${PLATFORM_NAME}-Limit-Order-Monitor/1.0`,
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * リトライロジック付きでBinance APIを呼び出す
 *
 * @param url - API URL
 * @param config - リトライ設定
 * @returns APIレスポンス
 */
async function fetchWithRetry(
  url: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, config.timeoutMs);

      // 成功レスポンス
      if (response.ok) {
        return response;
      }

      // レート制限エラー（429）の場合は特別扱い
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : calculateBackoffDelay(attempt, config);

        console.warn(
          `[Binance REST] Rate limit hit (429). Retrying after ${delayMs}ms...`
        );

        if (attempt < config.maxRetries) {
          await sleep(delayMs);
          continue;
        }
      }

      // その他のHTTPエラー
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Binance API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 最後の試行でない場合はリトライ
      if (attempt < config.maxRetries) {
        const delayMs = calculateBackoffDelay(attempt, config);
        console.warn(
          `[Binance REST] Attempt ${attempt + 1}/${config.maxRetries + 1} failed: ${
            lastError.message
          }. Retrying after ${delayMs}ms...`
        );
        await sleep(delayMs);
      }
    }
  }

  // すべてのリトライが失敗
  throw new Error(
    `Binance API request failed after ${config.maxRetries + 1} attempts: ${
      lastError?.message || 'Unknown error'
    }`
  );
}

/**
 * シンボルの現在価格を取得（シンプル版）
 *
 * @param symbol - Binanceシンボル（例: "BTCUSDT"）
 * @param config - リトライ設定（オプション）
 * @returns 現在価格
 *
 * @example
 * const price = await fetchTickerPrice("BTCUSDT");
 * console.log(price); // 43250.50
 */
export async function fetchTickerPrice(
  symbol: string,
  config?: RetryConfig
): Promise<number> {
  const url = `${BINANCE_API_BASE}/api/v3/ticker/price?symbol=${encodeURIComponent(
    symbol
  )}`;

  try {
    const response = await fetchWithRetry(url, config);
    const data: TickerPriceResponse = await response.json();

    const price = parseFloat(data.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Invalid price received: ${data.price}`);
    }

    return price;
  } catch (error) {
    console.error(`[Binance REST] Failed to fetch ticker price for ${symbol}:`, error);
    throw error;
  }
}

/**
 * 24時間ティッカー情報を取得（詳細版）
 *
 * @param symbol - Binanceシンボル（例: "BTCUSDT"）
 * @param config - リトライ設定（オプション）
 * @returns 24時間ティッカー情報
 *
 * @example
 * const ticker = await fetch24hrTicker("BTCUSDT");
 * console.log(ticker.lastPrice); // "43250.50"
 */
export async function fetch24hrTicker(
  symbol: string,
  config?: RetryConfig
): Promise<Ticker24hrResponse> {
  const url = `${BINANCE_API_BASE}/api/v3/ticker/24hr?symbol=${encodeURIComponent(
    symbol
  )}`;

  try {
    const response = await fetchWithRetry(url, config);
    const data: Ticker24hrResponse = await response.json();
    return data;
  } catch (error) {
    console.error(`[Binance REST] Failed to fetch 24hr ticker for ${symbol}:`, error);
    throw error;
  }
}

/**
 * 複数シンボルの価格を一括取得
 *
 * @param symbols - Binanceシンボルの配列
 * @param config - リトライ設定（オプション）
 * @returns シンボルと価格のマップ
 *
 * @example
 * const prices = await fetchMultiplePrices(["BTCUSDT", "ETHUSDT"]);
 * console.log(prices.get("BTCUSDT")); // 43250.50
 */
export async function fetchMultiplePrices(
  symbols: string[],
  config?: RetryConfig
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  // 並列リクエストで一括取得（レート制限に注意）
  const results = await Promise.allSettled(
    symbols.map(symbol => fetchTickerPrice(symbol, config))
  );

  symbols.forEach((symbol, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') {
      priceMap.set(symbol, result.value);
    } else {
      console.error(`Failed to fetch price for ${symbol}:`, result.reason);
    }
  });

  return priceMap;
}

/**
 * APIヘルスチェック
 *
 * @returns Binance APIが正常に応答する場合true
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${BINANCE_API_BASE}/api/v3/ping`,
      5000
    );
    return response.ok;
  } catch (error) {
    console.error('[Binance REST] Health check failed:', error);
    return false;
  }
}

/**
 * サーバー時刻を取得（デバッグ用）
 *
 * @returns Binanceサーバー時刻（UNIXタイムスタンプ）
 */
export async function fetchServerTime(): Promise<number> {
  const url = `${BINANCE_API_BASE}/api/v3/time`;

  try {
    const response = await fetchWithTimeout(url, 5000);
    const data: { serverTime: number } = await response.json();
    return data.serverTime;
  } catch (error) {
    console.error('[Binance REST] Failed to fetch server time:', error);
    throw error;
  }
}
