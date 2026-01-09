/**
 * Tatum API Type Definitions - Deno Native Implementation
 *
 * 厳密型定義によるTatum API完全対応
 * Web標準API準拠のDenoネイティブ実装
 */

// ====================================
// Core Chain Types
// ====================================

export type SupportedChain =
  | 'ETH' | 'ETH_SEPOLIA'           // Ethereum
  | 'BTC' | 'BTC_TESTNET'           // Bitcoin
  | 'TRX' | 'TRX_SHASTA'            // Tron
  | 'XRP' | 'XRP_TESTNET'           // XRP
  | 'ADA';                          // Cardano

export type UndefinedChain = 'evm' | 'btc' | 'trc' | 'xrp' | 'ada';
export type UndefinedNetwork = 'mainnet' | 'testnet' | 'ethereum' | 'sepolia' | 'nile' | 'shasta';
export type UndefinedAsset = 'ETH' | 'BTC' | 'TRX' | 'XRP' | 'ADA' | 'USDT';

// ====================================
// Subscription Types
// ====================================

export type SubscriptionType =
  | 'ADDRESS_TRANSACTION'           // アドレストランザクション通知
  | 'ACCOUNT_BALANCE'               // 残高変更通知
  | 'TOKEN_TRANSFER'                // トークン転送通知
  | 'CONTRACT_LOG_EVENT'            // コントラクトイベント通知
  | 'BLOCK_MINED'                   // ブロック生成通知
  | 'PENDING_TRANSACTION';          // 保留トランザクション通知

export interface SubscriptionAttributes {
  address?: string;                 // 監視対象アドレス
  chain: SupportedChain;           // ブロックチェーン
  url: string;                     // Webhook URL
  contractAddress?: string;         // スマートコントラクトアドレス
  event?: string;                  // イベント名
  from?: number;                   // 開始ブロック
  to?: number;                     // 終了ブロック
}

export interface CreateSubscriptionRequest {
  type: SubscriptionType;
  attr: SubscriptionAttributes;
}

export interface SubscriptionResponse {
  id: string;                      // サブスクリプションID
  type: SubscriptionType;
  attr: SubscriptionAttributes;
  active: boolean;
  created: string;                 // ISO 8601 timestamp
}

export interface SubscriptionListResponse {
  data: SubscriptionResponse[];
  pagination?: {
    pageNumber: number;
    pageSize: number;
    totalCount: number;
  };
}

// ====================================
// API Response Types
// ====================================

export interface TatumApiSuccess<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

export interface TatumApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export type TatumApiResponse<T = unknown> = TatumApiSuccess<T> | TatumApiError;

// ====================================
// HTTP Client Types
// ====================================

export interface TatumRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  body?: unknown;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  timeout?: number;                // milliseconds
  retries?: number;
  signal?: AbortSignal;           // Deno Native AbortController
}

export interface TatumClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  rateLimitPerSecond?: number;
  circuitBreakerThreshold?: number;
  debug?: boolean;
}

// ====================================
// Rate Limiter Types
// ====================================

export interface RateLimiterConfig {
  tokensPerSecond: number;
  bucketSize: number;
  initialTokens?: number;
}

export interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  isBlocked: boolean;
}

// ====================================
// Circuit Breaker Types
// ====================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;        // 失敗回数閾値
  recoveryTime: number;           // 回復時間（ミリ秒）
  timeout: number;                // タイムアウト（ミリ秒）
  monitor?: boolean;              // 監視モード
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  nextAttempt: number;
}

// ====================================
// Logger Types
// ====================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Record<string, unknown>;
  duration?: number;
  requestId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStructured: boolean;
  includeStack: boolean;
}

// ====================================
// Webhook Types
// ====================================

export interface WebhookPayload {
  subscriptionId: string;
  type: SubscriptionType;
  data: {
    address: string;
    chain: SupportedChain;
    txId: string;
    blockNumber: number;
    amount?: string;
    currency?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

// ====================================
// Chain Mapping Utilities
// ====================================

export interface ChainMapping {
  undefined: {
    chain: UndefinedChain;
    network: UndefinedNetwork;
    asset: UndefinedAsset;
  };
  tatum: SupportedChain;
}

// ====================================
// Error Types
// ====================================

export interface TatumErrorContext {
  endpoint?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  timestamp: string;
  chain?: SupportedChain;
  address?: string;
  operationName?: string;
  subscriptionId?: string;
  tokensPerSecond?: number;
  bucketSize?: number;
  currentTokens?: number;
  requestedTokens?: number;
  currentState?: string;
  failures?: number;
  compositeStrategy?: string;
  reason?: string;
}

// ====================================
// Metrics Types
// ====================================

export interface MetricsData {
  requests: {
    total: number;
    successful: number;
    failed: number;
    rateLimited: number;
  };
  performance: {
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  circuitBreaker: {
    state: CircuitState;
    failures: number;
    trips: number;
  };
  rateLimiter: {
    tokens: number;
    blocked: number;
    requests: number;
  };
  timestamp: string;
}

// ====================================
// Configuration Validation
// ====================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Type guards for runtime validation
export const isSubscriptionType = (value: unknown): value is SubscriptionType => {
  return typeof value === 'string' && [
    'ADDRESS_TRANSACTION',
    'ACCOUNT_BALANCE',
    'TOKEN_TRANSFER',
    'CONTRACT_LOG_EVENT',
    'BLOCK_MINED',
    'PENDING_TRANSACTION'
  ].includes(value);
};

export const isSupportedChain = (value: unknown): value is SupportedChain => {
  return typeof value === 'string' && [
    'ETH', 'ETH_SEPOLIA',
    'BTC', 'BTC_TESTNET',
    'TRX', 'TRX_SHASTA',
    'XRP', 'XRP_TESTNET',
    'ADA'
  ].includes(value);
};

export const isUndefinedChain = (value: unknown): value is UndefinedChain => {
  return typeof value === 'string' && ['evm', 'btc', 'trc', 'xrp', 'ada'].includes(value);
};