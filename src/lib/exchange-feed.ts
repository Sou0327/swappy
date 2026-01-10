// 簡易取引所フィード（Binance REST）
// 注意: CORS/レート制限に配慮してください。必要に応じてEdge Function経由に切替を推奨。

import { supabase } from "@/integrations/supabase/client";

export interface DepthLevel { price: number; amount: number }

// レート制限とキャッシュ管理
class APIRateLimiter {
  private lastRequestTime: Record<string, number> = {};
  private cache: Record<string, { data: unknown; timestamp: number }> = {};
  private readonly minInterval = 5000; // 5秒間隔
  private readonly cacheTimeout = 10000; // 10秒キャッシュ

  canMakeRequest(endpoint: string): boolean {
    const now = Date.now();
    const lastTime = this.lastRequestTime[endpoint] || 0;
    return now - lastTime >= this.minInterval;
  }

  getCachedData(endpoint: string): unknown | null {
    const cached = this.cache[endpoint];
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > this.cacheTimeout) {
      delete this.cache[endpoint];
      return null;
    }
    
    return cached.data;
  }

  getRawCachedData(endpoint: string): unknown | null {
    const cached = this.cache[endpoint];
    return cached ? cached.data : null;
  }

  setCachedData(endpoint: string, data: unknown): void {
    this.cache[endpoint] = {
      data,
      timestamp: Date.now()
    };
  }

  recordRequest(endpoint: string): void {
    this.lastRequestTime[endpoint] = Date.now();
  }

  waitTime(endpoint: string): number {
    const now = Date.now();
    const lastTime = this.lastRequestTime[endpoint] || 0;
    const elapsed = now - lastTime;
    return Math.max(0, this.minInterval - elapsed);
  }
}

const rateLimiter = new APIRateLimiter();

// Binanceプロキシの適切なURLを環境に応じて取得
function getBinanceProxyUrl(): string {
  // 優先度1: 明示的な環境変数が設定されている場合はそれを使用
  const explicitProxy = import.meta.env.VITE_BINANCE_PROXY_URL;
  if (explicitProxy) {
    return explicitProxy as string;
  }

  // 優先度2: VITE_SUPABASE_URLから本番プロキシURLを自動構築
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost')) {
    return `${supabaseUrl}/functions/v1/binance-proxy`;
  }

  // 優先度3: ローカル開発環境のデフォルト
  return 'http://127.0.0.1:54321/functions/v1/binance-proxy';
}

// Supabase認証ヘッダーを取得するヘルパー関数
function getSupabaseHeaders(): Record<string, string> {
  // Supabase publishable keyを環境変数から取得（プロジェクト標準の環境変数名を使用）
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  return {
    'Authorization': `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
}

export function toBinanceSymbol(marketId: string): string | null {
  // e.g. BTC-USDT -> BTCUSDT
  if (!marketId) return null;
  const [base, quote] = marketId.split('-');
  if (!base || !quote) return null;
  return `${base}${quote}`.toUpperCase();
}

export async function fetchBinanceOrderBook(symbol: string, limit: number = 10): Promise<{ bids: DepthLevel[]; asks: DepthLevel[] }> {
  const endpointKey = `depth_${symbol}_${limit}`;
  
  // キャッシュチェック
  const cached = rateLimiter.getCachedData(endpointKey);
  if (cached) {
    return cached as { bids: DepthLevel[]; asks: DepthLevel[] };
  }
  
  // レート制限チェック
  if (!rateLimiter.canMakeRequest(endpointKey)) {
    const waitTime = rateLimiter.waitTime(endpointKey);

    // キャッシュがある場合は古いデータを返す
    const oldCached = rateLimiter.getRawCachedData(endpointKey);
    if (oldCached) {
      return oldCached as { bids: DepthLevel[]; asks: DepthLevel[] };
    }
    
    // 待機して再実行
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  const proxy = getBinanceProxyUrl();
  const url = proxy
    ? `${proxy}?endpoint=depth&symbol=${encodeURIComponent(symbol)}&limit=${limit}&ttl=${encodeURIComponent(String((import.meta as { env?: { VITE_BINANCE_PROXY_TTL_MS_DEPTH?: string } }).env?.VITE_BINANCE_PROXY_TTL_MS_DEPTH || 3000))}`
    : `https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  
  try {
    rateLimiter.recordRequest(endpointKey);
    const fetchOptions = proxy ? { headers: getSupabaseHeaders() } : {};
    const res = await fetch(url, fetchOptions);
    
    if (!res.ok) {
      throw new Error(`Binance depth error: ${res.status}`);
    }
    
    const json = await res.json();
    const result = {
      bids: (json.bids || []).map((r: [string, string]) => ({ price: Number(r[0]), amount: Number(r[1]) })),
      asks: (json.asks || []).map((r: [string, string]) => ({ price: Number(r[0]), amount: Number(r[1]) }))
    };
    
    // 成功時にキャッシュ
    rateLimiter.setCachedData(endpointKey, result);

    return result;
  } catch (error) {
    console.error(`[Rate Limiter] Error fetching orderbook for ${symbol}:`, error);
    
    // エラー時は古いキャッシュがあれば使用
    const fallbackCached = rateLimiter.getRawCachedData(endpointKey);
    if (fallbackCached) {
      return fallbackCached as { bids: DepthLevel[]; asks: DepthLevel[] };
    }
    
    throw error;
  }
}

export interface Binance24hrTicker {
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
}

export async function fetchBinance24hrTicker(symbol: string): Promise<Binance24hrTicker> {
  const endpointKey = `ticker24hr_${symbol}`;

  // キャッシュチェック
  const cached = rateLimiter.getCachedData(endpointKey);
  if (cached) {
    return cached as Binance24hrTicker;
  }

  // レート制限チェック
  if (!rateLimiter.canMakeRequest(endpointKey)) {
    const waitTime = rateLimiter.waitTime(endpointKey);

    // キャッシュがある場合は古いデータを返す
    const oldCached = rateLimiter.getRawCachedData(endpointKey);
    if (oldCached) {
      return oldCached as Binance24hrTicker;
    }

    // 待機して再実行
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  const proxy = getBinanceProxyUrl();
  const url = proxy
    ? `${proxy}?endpoint=ticker&symbol=${encodeURIComponent(symbol)}&ttl=${encodeURIComponent(String((import.meta as { env?: { VITE_BINANCE_PROXY_TTL_MS_TICKER?: string } }).env?.VITE_BINANCE_PROXY_TTL_MS_TICKER || 60000))}`
    : `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;

  try {
    rateLimiter.recordRequest(endpointKey);
    const fetchOptions = proxy ? { headers: getSupabaseHeaders() } : {};
    const res = await fetch(url, fetchOptions);

    if (!res.ok) {
      throw new Error(`Binance 24hr ticker error: ${res.status}`);
    }

    const json = await res.json();
    const result: Binance24hrTicker = {
      lastPrice: Number(json.lastPrice),
      priceChange: Number(json.priceChange),
      priceChangePercent: Number(json.priceChangePercent),
      volume: Number(json.volume),
      quoteVolume: Number(json.quoteVolume)
    };

    // 成功時にキャッシュ
    rateLimiter.setCachedData(endpointKey, result);

    return result;
  } catch (error) {
    console.error(`[Rate Limiter] Error fetching 24hr ticker for ${symbol}:`, error);

    // エラー時は古いキャッシュがあれば使用
    const fallbackCached = rateLimiter.getRawCachedData(endpointKey);
    if (fallbackCached) {
      return fallbackCached as Binance24hrTicker;
    }

    throw error;
  }
}

export async function fetchBinanceRecentTrades(symbol: string, limit: number = 200): Promise<Array<{ time: string; price: number; volume: number }>> {
  const endpointKey = `trades_${symbol}_${limit}`;
  
  // キャッシュチェック
  const cached = rateLimiter.getCachedData(endpointKey);
  if (cached) {
    return cached as Array<{ time: string; price: number; volume: number }>;
  }
  
  // レート制限チェック
  if (!rateLimiter.canMakeRequest(endpointKey)) {
    const waitTime = rateLimiter.waitTime(endpointKey);

    // キャッシュがある場合は古いデータを返す
    const oldCached = rateLimiter.getRawCachedData(endpointKey);
    if (oldCached) {
      return oldCached as Array<{ time: string; price: number; volume: number }>;
    }

    // 待機して再実行
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  const proxy = getBinanceProxyUrl();
  const url = proxy
    ? `${proxy}?endpoint=trades&symbol=${encodeURIComponent(symbol)}&limit=${limit}&ttl=${encodeURIComponent(String((import.meta as { env?: { VITE_BINANCE_PROXY_TTL_MS_TRADES?: string } }).env?.VITE_BINANCE_PROXY_TTL_MS_TRADES || 10000))}`
    : `https://api.binance.com/api/v3/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  
  try {
    rateLimiter.recordRequest(endpointKey);
    const fetchOptions = proxy ? { headers: getSupabaseHeaders() } : {};
    const res = await fetch(url, fetchOptions);
    
    if (!res.ok) {
      throw new Error(`Binance trades error: ${res.status}`);
    }
    
    const json = await res.json();
    const result = (json || []).map((t: { time: number; price: string; qty: string }) => ({ 
      time: new Date(t.time).toLocaleTimeString(), 
      price: Number(t.price), 
      volume: Number(t.qty) 
    }));
    
    // 成功時にキャッシュ
    rateLimiter.setCachedData(endpointKey, result);

    return result;
  } catch (error) {
    console.error(`[Rate Limiter] Error fetching trades for ${symbol}:`, error);

    // エラー時は古いキャッシュがあれば使用
    const fallbackCached = rateLimiter.getRawCachedData(endpointKey);
    if (fallbackCached) {
      return fallbackCached as Array<{ time: string; price: number; volume: number }>;
    }
    
    throw error;
  }
}
