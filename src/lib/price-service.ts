// 簡易プライスサービス（CoinGeckoベース）。軽量キャッシュ付き。
// 本番では専用の価格配信/レート制限対策を推奨。

type PriceMap = Record<string, number>; // symbol -> usd price

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  XRP: 'ripple',
  TRX: 'tron',
  ADA: 'cardano',
};

interface CachedPrices {
  ts: number;
  usd: PriceMap;
  usd_jpy?: number; // 1 USD ≈ ? JPY （近似: USDT JPYレートで代替）
}

let cache: CachedPrices | null = null;
const TTL_MS = 300_000; // 5分キャッシュ（レート制限対策）

async function fetchUsdPrices(symbols: string[]): Promise<PriceMap> {
  const ids = Array.from(new Set(symbols
    .map(s => SYMBOL_TO_COINGECKO_ID[s])
    .filter(Boolean)));
  if (ids.length === 0) return {};

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd`;
    const res = await fetch(url);

    // レート制限エラー (429) の場合はデフォルト値を返す
    if (res.status === 429) {
      console.warn('⚠️ [PRICE-SERVICE] CoinGecko APIレート制限エラー。デフォルト値を使用します');
      return getDefaultPrices();
    }

    if (!res.ok) {
      console.error(`❌ [PRICE-SERVICE] Price API error: ${res.status}`);
      return getDefaultPrices();
    }

    const json = await res.json();

    const out: PriceMap = {};
    for (const [symbol, id] of Object.entries(SYMBOL_TO_COINGECKO_ID)) {
      const row = json[id];
      if (row && typeof row.usd === 'number') out[symbol] = row.usd;
    }
    // ステーブルコインは常に1.0に固定（市場の微小変動を無視）
    out['USDT'] = 1.0;
    out['USDC'] = 1.0;
    return out;
  } catch (error) {
    console.error('❌ [PRICE-SERVICE] 価格取得エラー:', error);
    return getDefaultPrices();
  }
}

// デフォルト価格（APIエラー時のフォールバック）
// 2025年9月時点の概算値
function getDefaultPrices(): PriceMap {
  return {
    BTC: 97000,   // 概算値
    ETH: 3800,    // 概算値
    USDT: 1,      // ステーブルコイン
    USDC: 1,      // ステーブルコイン
    XRP: 2.3,     // 概算値
    TRX: 0.23,    // 概算値
    ADA: 0.9,     // 概算値
  };
}

async function fetchUsdJpy(): Promise<number | undefined> {
  try {
    // TetherのJPY価格を利用して 1 USDT ≈ JPY とする
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=jpy`;
    const res = await fetch(url);

    if (res.status === 429) {
      console.warn('⚠️ [PRICE-SERVICE] USD/JPYレート取得でレート制限エラー。デフォルト値150を使用します');
      return 150; // 概算値
    }

    if (!res.ok) {
      console.warn(`⚠️ [PRICE-SERVICE] USD/JPYレート取得エラー: ${res.status}`);
      return 150; // 概算値
    }

    const json = await res.json();
    const jpy = json?.tether?.jpy;
    return typeof jpy === 'number' ? jpy : 150;
  } catch (error) {
    console.error('❌ [PRICE-SERVICE] USD/JPYレート取得エラー:', error);
    return 150; // 概算値
  }
}

export async function getPriceSnapshot(symbols: string[]): Promise<{ usd: PriceMap; usd_jpy?: number }> {
  const now = Date.now();
  if (cache && (now - cache.ts) < TTL_MS) {
    return { usd: cache.usd, usd_jpy: cache.usd_jpy };
  }
  const [usd, usd_jpy] = await Promise.all([
    fetchUsdPrices(symbols),
    fetchUsdJpy(),
  ]);
  cache = { ts: now, usd, usd_jpy };
  return { usd, usd_jpy };
}

export function computePairRate(from: string, to: string, price: { usd: PriceMap; usd_jpy?: number }): number {
  if (from === to) return 1;

  // フィアットJPY対応：USDJPYレートから近似換算
  if (from === 'JPY' && to in price.usd && price.usd_jpy) {
    // 1 JPY → USD = 1 / USDJPY、USD → to = 1 / (usdPrice of to)
    const jpy_to_usd = 1 / price.usd_jpy;
    return jpy_to_usd / (1 / price.usd[to]); // = price.usd[to]^-1 * jpy_to_usd
  }
  if (to === 'JPY' && from in price.usd && price.usd_jpy) {
    // from → USD = price.usd[from]、USD → JPY = USDJPY
    return price.usd[from] * price.usd_jpy;
  }

  // USDCはUSDT扱い
  const fromKey = from === 'USDC' ? 'USDT' : from;
  const toKey = to === 'USDC' ? 'USDT' : to;
  const fromUsd = price.usd[fromKey];
  const toUsd = price.usd[toKey];

  if (typeof fromUsd !== 'number' || typeof toUsd !== 'number' || toUsd === 0) {
    return 0;
  }

  const rate = fromUsd / toUsd;
  return rate;
}

