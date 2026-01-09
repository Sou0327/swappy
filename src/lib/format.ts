/**
 * 数値フォーマット用ユーティリティ関数
 *
 * マーケット、取引、価格表示に関する一貫したフォーマットを提供します。
 */

/**
 * 価格を日本語ロケールでフォーマット
 *
 * @param price - フォーマットする価格（数値）
 * @param decimals - 小数点以下の桁数（デフォルト: 2）
 * @returns フォーマットされた価格文字列、または無効値の場合は '—'
 *
 * @example
 * formatPrice(1234.5678, 2) // "1,234.57"
 * formatPrice(null) // "—"
 * formatPrice(50000) // "50,000.00"
 */
export const formatPrice = (
  price: number | null | undefined,
  decimals: number = 2
): string => {
  // null, undefined, 非有限数（NaN, Infinity）のチェック
  if (price === null || price === undefined || !Number.isFinite(price)) {
    return '—';
  }

  return price.toLocaleString('ja-JP', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * 24時間変動率を計算してフォーマット
 *
 * @param currentPrice - 現在の価格
 * @param price24hAgo - 24時間前の価格
 * @returns 変動率の文字列とトレンド方向
 *
 * @example
 * formatChangePercent(105, 100) // { value: "+5.00%", trend: "up" }
 * formatChangePercent(95, 100) // { value: "-5.00%", trend: "down" }
 * formatChangePercent(100, 100) // { value: "0.00%", trend: "neutral" }
 * formatChangePercent(null, 100) // { value: "—", trend: "neutral" }
 */
export const formatChangePercent = (
  currentPrice: number | null | undefined,
  price24hAgo: number | null | undefined
): { value: string; trend: 'up' | 'down' | 'neutral' } => {
  // 無効値または0以下の価格（変動率計算不可）のチェック
  if (
    !currentPrice ||
    !price24hAgo ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(price24hAgo) ||
    price24hAgo <= 0
  ) {
    return { value: '—', trend: 'neutral' };
  }

  // 変動率計算: ((現在価格 - 過去価格) / 過去価格) * 100
  const changePercent = ((currentPrice - price24hAgo) / price24hAgo) * 100;

  // 異常値の検出（±1000%以上の変動）
  if (Math.abs(changePercent) > 1000) {
    console.warn('Abnormal price change detected:', {
      currentPrice,
      price24hAgo,
      changePercent
    });
  }

  // フォーマット
  const formatted = Math.abs(changePercent).toFixed(2);
  const value = changePercent > 0
    ? `+${formatted}%`
    : changePercent < 0
      ? `-${formatted}%`
      : `${formatted}%`;

  // トレンド判定
  const trend = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'neutral';

  return { value, trend };
};

/**
 * 出来高を日本語ロケールでフォーマット
 *
 * @param volume - フォーマットする出来高（数値）
 * @param decimals - 小数点以下の桁数（デフォルト: 4）
 * @returns フォーマットされた出来高文字列、または無効値の場合は '—'
 *
 * @example
 * formatVolume(1234567.89, 2) // "1,234,567.89"
 * formatVolume(0.123456, 6) // "0.123456"
 * formatVolume(null) // "—"
 */
export const formatVolume = (
  volume: number | null | undefined,
  decimals: number = 4
): string => {
  // null, undefined, 非有限数, 負の値のチェック
  if (
    volume === null ||
    volume === undefined ||
    !Number.isFinite(volume) ||
    volume < 0
  ) {
    return '—';
  }

  return volume.toLocaleString('ja-JP', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * 通貨シンボルから暗号通貨アイコンパスを取得
 *
 * @param symbol - 通貨ペアシンボル（例: "BTC/USDT"）
 * @returns アイコンパス、または空文字列
 *
 * @example
 * getCryptoIcon("BTC/USDT") // "/icons/bitcoin.png"
 * getCryptoIcon("ETH/USDT") // "/icons/ethereum.png"
 */
export const getCryptoIcon = (symbol: string): string => {
  const iconMap: Record<string, string> = {
    'BTC': '/icons/bitcoin.png',
    'ETH': '/icons/ethereum.png',
    'USDT': '/icons/tether.png',
    'TRX': '/icons/tron.png',
    'XRP': '/icons/xrp.png',
    'ADA': '/icons/cardano.png',
    'BNB': '/icons/binance.png',
    'SOL': '/icons/solana.png',
  };

  // ペア記号から基本通貨を取得（例: "BTC/USDT" -> "BTC"）
  const baseCurrency = symbol.split('/')[0];
  return iconMap[baseCurrency] || '';
};
