// @ts-expect-error: Deno deploy
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// 拡張CORS設定
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-request-id",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=5",
};

// レート制限設定（IP別）
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const RATE_LIMITS = {
  windowMs: 60000, // 1分間
  maxRequests: 120, // 最大120リクエスト/分
};

// グローバルキャッシュとレート制限ストレージ
type GlobalState = {
  __BINANCE_CACHE__?: Map<string, { ts: number; status: number; text: string; size: number }>;
  __RATE_LIMITS__?: Map<string, RateLimitEntry>;
};

function initializeGlobalState(): GlobalState {
  const global = globalThis as unknown as GlobalState;
  global.__BINANCE_CACHE__ = global.__BINANCE_CACHE__ || new Map();
  global.__RATE_LIMITS__ = global.__RATE_LIMITS__ || new Map();
  return global;
}

function getClientIP(req: Request): string {
  // Cloudflare/Supabase環境での実IPアドレス取得
  return req.headers.get('cf-connecting-ip') ||
         req.headers.get('x-forwarded-for')?.split(',')[0] ||
         req.headers.get('x-real-ip') ||
         'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetTime: number } {
  const global = initializeGlobalState();
  const rateLimits = global.__RATE_LIMITS__!;
  const now = Date.now();

  const entry = rateLimits.get(ip);

  if (!entry || now > entry.resetTime) {
    // 新しいウィンドウまたは期限切れ
    rateLimits.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMITS.windowMs
    });
    return {
      allowed: true,
      remaining: RATE_LIMITS.maxRequests - 1,
      resetTime: now + RATE_LIMITS.windowMs
    };
  }

  if (entry.count >= RATE_LIMITS.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: RATE_LIMITS.maxRequests - entry.count,
    resetTime: entry.resetTime
  };
}

function validateSymbol(symbol: string): boolean {
  // Binance symbol validation (基本的なチェック)
  return /^[A-Z0-9]{2,20}$/.test(symbol) && symbol.length >= 6;
}

function validateLimit(limit: string): number {
  const num = parseInt(limit);
  if (isNaN(num) || num < 1 || num > 5000) {
    return 100; // デフォルト値
  }
  return num;
}

async function cleanupCache() {
  const global = initializeGlobalState();
  const cache = global.__BINANCE_CACHE__!;
  const now = Date.now();
  const maxCacheSize = 1000; // 最大キャッシュエントリ数

  // 期限切れエントリの削除
  for (const [key, entry] of cache.entries()) {
    if (now - entry.ts > 300000) { // 5分以上古い
      cache.delete(key);
    }
  }

  // キャッシュサイズ制限
  if (cache.size > maxCacheSize) {
    const entries = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts);
    const deleteCount = cache.size - Math.floor(maxCacheSize * 0.8);
    for (let i = 0; i < deleteCount; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

serve(async (req) => {
  const { method } = req;
  const clientIP = getClientIP(req);
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...CORS_HEADERS,
        'X-Request-ID': requestId,
      },
      status: 204
    });
  }

  // メソッド検証
  if (method !== 'GET') {
    return new Response(JSON.stringify({
      error: 'Method not allowed',
      requestId,
      allowed: ['GET', 'OPTIONS']
    }), {
      headers: {
        ...CORS_HEADERS,
        'X-Request-ID': requestId,
      },
      status: 405
    });
  }

  // レート制限チェック
  const rateLimitResult = checkRateLimit(clientIP);
  if (!rateLimitResult.allowed) {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded',
      requestId,
      retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
    }), {
      headers: {
        ...CORS_HEADERS,
        'X-Request-ID': requestId,
        'X-RateLimit-Limit': RATE_LIMITS.maxRequests.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
        'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
      },
      status: 429
    });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint') || 'trades';
    const symbol = url.searchParams.get('symbol');
    const limitParam = url.searchParams.get('limit') || '100';
    const ttlParam = url.searchParams.get('ttl');

    // パラメータ検証
    if (!symbol) {
      return new Response(JSON.stringify({
        error: 'Missing required parameter: symbol',
        requestId,
        example: '?symbol=BTCUSDT&endpoint=trades&limit=100'
      }), {
        headers: {
          ...CORS_HEADERS,
          'X-Request-ID': requestId,
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
        status: 400
      });
    }

    if (!validateSymbol(symbol)) {
      return new Response(JSON.stringify({
        error: 'Invalid symbol format',
        requestId,
        symbol,
        format: 'Must be 6-20 uppercase alphanumeric characters (e.g., BTCUSDT)'
      }), {
        headers: {
          ...CORS_HEADERS,
          'X-Request-ID': requestId,
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
        status: 400
      });
    }

    if (!['trades', 'depth', 'ticker'].includes(endpoint)) {
      return new Response(JSON.stringify({
        error: 'Invalid endpoint',
        requestId,
        endpoint,
        supported: ['trades', 'depth', 'ticker']
      }), {
        headers: {
          ...CORS_HEADERS,
          'X-Request-ID': requestId,
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
        status: 400
      });
    }

    const limit = validateLimit(limitParam);

    // APIエンドポイント構築
    let apiUrl = '';
    let defaultTTL = 10000; // 10秒

    switch (endpoint) {
      case 'depth':
        apiUrl = `https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
        defaultTTL = 3000; // 3秒
        break;
      case 'ticker':
        apiUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
        defaultTTL = 5000; // 5秒
        break;
      default: // trades
        apiUrl = `https://api.binance.com/api/v3/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
        defaultTTL = 10000; // 10秒
    }

    // キャッシュチェック
    const global = initializeGlobalState();
    const cache = global.__BINANCE_CACHE__!;
    const cacheKey = `${endpoint}:${symbol}:${limit}`;
    const now = Date.now();
    const ttl = Math.max(1000, Math.min(60000, parseInt(ttlParam || String(defaultTTL)) || defaultTTL));

    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < ttl) {
      return new Response(cached.text, {
        headers: {
          ...CORS_HEADERS,
          'X-Request-ID': requestId,
          'X-Cache': 'HIT',
          'X-Cache-Age': Math.floor((now - cached.ts) / 1000).toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
        status: cached.status
      });
    }

    // Binance API呼び出し
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Swappy-Binance-Proxy/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      // キャッシュに保存
      cache.set(cacheKey, {
        ts: now,
        status: response.status,
        text: responseText,
        size: responseText.length
      });

      // キャッシュクリーンアップ（非同期）
      if (Math.random() < 0.1) { // 10%の確率で実行
        cleanupCache().catch(console.error);
      }

      return new Response(responseText, {
        headers: {
          ...CORS_HEADERS,
          'X-Request-ID': requestId,
          'X-Cache': 'MISS',
          'X-Binance-Status': response.status.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
        status: response.status
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({
          error: 'Request timeout',
          requestId,
          timeout: '10s'
        }), {
          headers: {
            ...CORS_HEADERS,
            'X-Request-ID': requestId,
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          },
          status: 504
        });
      }

      throw fetchError;
    }

  } catch (error) {
    console.error(`[binance-proxy] Error for ${clientIP}:`, error);

    return new Response(JSON.stringify({
      error: 'Internal server error',
      requestId,
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      headers: {
        ...CORS_HEADERS,
        'X-Request-ID': requestId,
        'X-RateLimit-Remaining': rateLimitResult?.remaining?.toString() || '0',
      },
      status: 500
    });
  }
});
