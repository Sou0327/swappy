/**
 * トレーディングシステム設定
 *
 * 指値注文監視、Binance API接続、リトライポリシー等の設定を管理します。
 * 環境変数から設定を読み込み、デフォルト値を提供します。
 */

import {
  DEFAULT_WEBSOCKET_CONFIG,
  type WebSocketConfig,
} from '../lib/binance/websocket';
import {
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from '../lib/binance/rest';

/**
 * 指値注文監視設定
 */
export interface LimitOrderMonitorConfig {
  /** 監視サイクル間隔（ミリ秒） */
  monitorCycleMs: number;
  /** 価格チェック頻度（ミリ秒） */
  priceCheckIntervalMs: number;
  /** 監視タイムアウト（ミリ秒） */
  monitorTimeoutMs: number;
  /** WebSocket優先モード（falseの場合RESTのみ使用） */
  preferWebSocket: boolean;
  /** REST APIフォールバック有効化 */
  enableRestFallback: boolean;
  /** 約定実行時の最大リトライ回数 */
  executionMaxRetries: number;
  /** 並列監視する最大市場数 */
  maxConcurrentMarkets: number;
}

/**
 * Binance API設定
 */
export interface BinanceApiConfig {
  /** WebSocket URL */
  wsUrl: string;
  /** REST API URL */
  restApiUrl: string;
  /** API キー（認証が必要な場合） */
  apiKey?: string;
  /** API シークレット（認証が必要な場合） */
  apiSecret?: string;
}

/**
 * 環境変数から設定を読み込む
 */
function getEnvVar(key: string, defaultValue: string = ''): string {
  // Deno環境
  if (typeof Deno !== 'undefined') {
    return Deno.env.get(key) || defaultValue;
  }
  // Node.js/Browser環境
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  // import.meta.env (Vite環境)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env as Record<string, string>)[key] || defaultValue;
  }
  return defaultValue;
}

/**
 * 環境変数から数値を読み込む
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = getEnvVar(key);
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * 環境変数からブール値を読み込む
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = getEnvVar(key).toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return defaultValue;
}

/**
 * デフォルトの指値注文監視設定
 */
export const DEFAULT_LIMIT_ORDER_MONITOR_CONFIG: LimitOrderMonitorConfig = {
  monitorCycleMs: getEnvNumber('LIMIT_ORDER_MONITOR_CYCLE_MS', 10000), // 10秒
  priceCheckIntervalMs: getEnvNumber('LIMIT_ORDER_PRICE_CHECK_MS', 1000), // 1秒
  monitorTimeoutMs: getEnvNumber('LIMIT_ORDER_MONITOR_TIMEOUT_MS', 120000), // 2分
  preferWebSocket: getEnvBoolean('LIMIT_ORDER_PREFER_WEBSOCKET', true),
  enableRestFallback: getEnvBoolean('LIMIT_ORDER_REST_FALLBACK', true),
  executionMaxRetries: getEnvNumber('LIMIT_ORDER_EXECUTION_RETRIES', 3),
  maxConcurrentMarkets: getEnvNumber('LIMIT_ORDER_MAX_MARKETS', 20),
};

/**
 * デフォルトのBinance API設定
 */
export const DEFAULT_BINANCE_API_CONFIG: BinanceApiConfig = {
  wsUrl: getEnvVar('BINANCE_WS_URL', 'wss://stream.binance.com:9443'),
  restApiUrl: getEnvVar('BINANCE_API_URL', 'https://api.binance.com'),
  apiKey: getEnvVar('BINANCE_API_KEY'),
  apiSecret: getEnvVar('BINANCE_API_SECRET'),
};

/**
 * WebSocket設定（環境変数から上書き可能）
 */
export const WEBSOCKET_CONFIG: WebSocketConfig = {
  ...DEFAULT_WEBSOCKET_CONFIG,
  maxReconnectAttempts: getEnvNumber(
    'BINANCE_WS_MAX_RECONNECT',
    DEFAULT_WEBSOCKET_CONFIG.maxReconnectAttempts
  ),
  initialReconnectDelayMs: getEnvNumber(
    'BINANCE_WS_INITIAL_DELAY_MS',
    DEFAULT_WEBSOCKET_CONFIG.initialReconnectDelayMs
  ),
  maxReconnectDelayMs: getEnvNumber(
    'BINANCE_WS_MAX_DELAY_MS',
    DEFAULT_WEBSOCKET_CONFIG.maxReconnectDelayMs
  ),
  connectionTimeoutMs: getEnvNumber(
    'BINANCE_WS_CONNECTION_TIMEOUT_MS',
    DEFAULT_WEBSOCKET_CONFIG.connectionTimeoutMs
  ),
  pingTimeoutMs: getEnvNumber(
    'BINANCE_WS_PING_TIMEOUT_MS',
    DEFAULT_WEBSOCKET_CONFIG.pingTimeoutMs
  ),
};

/**
 * REST API設定（環境変数から上書き可能）
 */
export const REST_API_CONFIG: RetryConfig = {
  ...DEFAULT_RETRY_CONFIG,
  maxRetries: getEnvNumber(
    'BINANCE_REST_MAX_RETRIES',
    DEFAULT_RETRY_CONFIG.maxRetries
  ),
  initialDelayMs: getEnvNumber(
    'BINANCE_REST_INITIAL_DELAY_MS',
    DEFAULT_RETRY_CONFIG.initialDelayMs
  ),
  maxDelayMs: getEnvNumber(
    'BINANCE_REST_MAX_DELAY_MS',
    DEFAULT_RETRY_CONFIG.maxDelayMs
  ),
  timeoutMs: getEnvNumber(
    'BINANCE_REST_TIMEOUT_MS',
    DEFAULT_RETRY_CONFIG.timeoutMs
  ),
};

/**
 * すべての設定をエクスポート
 */
export const tradingConfig = {
  limitOrderMonitor: DEFAULT_LIMIT_ORDER_MONITOR_CONFIG,
  binanceApi: DEFAULT_BINANCE_API_CONFIG,
  websocket: WEBSOCKET_CONFIG,
  restApi: REST_API_CONFIG,
} as const;

/**
 * 設定をログ出力（デバッグ用、シークレットは除外）
 */
export function logConfig(): void {
  console.log('[Trading Config] Limit Order Monitor:', {
    ...DEFAULT_LIMIT_ORDER_MONITOR_CONFIG,
  });
  console.log('[Trading Config] Binance API:', {
    wsUrl: DEFAULT_BINANCE_API_CONFIG.wsUrl,
    restApiUrl: DEFAULT_BINANCE_API_CONFIG.restApiUrl,
    apiKeyConfigured: !!DEFAULT_BINANCE_API_CONFIG.apiKey,
    apiSecretConfigured: !!DEFAULT_BINANCE_API_CONFIG.apiSecret,
  });
  console.log('[Trading Config] WebSocket:', WEBSOCKET_CONFIG);
  console.log('[Trading Config] REST API:', REST_API_CONFIG);
}

/**
 * 設定の妥当性を検証
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 監視設定の検証
  if (DEFAULT_LIMIT_ORDER_MONITOR_CONFIG.monitorCycleMs < 1000) {
    errors.push('monitorCycleMs must be at least 1000ms');
  }

  if (DEFAULT_LIMIT_ORDER_MONITOR_CONFIG.priceCheckIntervalMs < 100) {
    errors.push('priceCheckIntervalMs must be at least 100ms');
  }

  if (DEFAULT_LIMIT_ORDER_MONITOR_CONFIG.maxConcurrentMarkets < 1) {
    errors.push('maxConcurrentMarkets must be at least 1');
  }

  if (DEFAULT_LIMIT_ORDER_MONITOR_CONFIG.maxConcurrentMarkets > 100) {
    errors.push('maxConcurrentMarkets should not exceed 100 for performance');
  }

  // WebSocket設定の検証
  if (WEBSOCKET_CONFIG.maxReconnectAttempts < 0) {
    errors.push('WebSocket maxReconnectAttempts must be non-negative');
  }

  if (WEBSOCKET_CONFIG.initialReconnectDelayMs < 100) {
    errors.push('WebSocket initialReconnectDelayMs must be at least 100ms');
  }

  // REST API設定の検証
  if (REST_API_CONFIG.maxRetries < 0) {
    errors.push('REST API maxRetries must be non-negative');
  }

  if (REST_API_CONFIG.timeoutMs < 1000) {
    errors.push('REST API timeoutMs must be at least 1000ms');
  }

  // URL検証
  try {
    new URL(DEFAULT_BINANCE_API_CONFIG.wsUrl);
  } catch {
    errors.push('Invalid WebSocket URL');
  }

  try {
    new URL(DEFAULT_BINANCE_API_CONFIG.restApiUrl);
  } catch {
    errors.push('Invalid REST API URL');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
