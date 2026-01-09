// Tatum Webhook Types - 型定義とインターフェース

export interface TatumWebhookPayload {
  type?: string;
  subscriptionType?: string;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface NormalizedEvent {
  address: string;
  chain?: string;
  network?: string;
  asset?: string;
  amount: number;
  rawAmount: string;
  transactionHash: string;
  fromAddress?: string;
  counterAddress?: string;
  memo?: string;
  confirmations: number;
  blockNumber?: number;
  tokenAddress?: string;
  raw: Record<string, unknown>;
}

export interface LogContext {
  correlationId: string;
  timestamp: string;
  service: string;
  version: string;
  environment: string;
}

export interface AuditLogEntry {
  correlationId: string;
  timestamp: string;
  service: string;
  version: string;
  environment: string;
  event: string;
  userId?: string;
  resource?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
}

/**
 * 金融システム用セキュアデポジットアドレス型
 * SQLインジェクション防止のための読み取り専用プロパティ
 */
export interface SecureDepositAddress {
  readonly user_id: string;
  readonly asset: string;
  readonly chain: string;
  readonly network: string;
  readonly destination_tag?: string | null;
  readonly memo?: string | null;
}

/**
 * Memo検証結果型（セキュリティリスク評価付き）
 * 金融システムのゼロトレランス要件に対応
 */
export interface MemoValidationResult {
  readonly isValid: boolean;
  readonly sanitizedValue: string | null;
  readonly securityRisk: 'none' | 'low' | 'medium' | 'high';
  readonly rejectionReason?: string;
}

/**
 * セキュアクエリ実行結果型
 * 監査ログとパフォーマンス追跡機能付き
 */
export interface SecureQueryResult<T> {
  readonly data: T[] | null;
  readonly error: Error | null;
  readonly securityAudit: {
    readonly queryType: string;
    readonly parameterCount: number;
    readonly executionTime: number;
  };
}

export interface MetricPoint {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: string;
}

export interface EnvironmentConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  tatumWebhookSecret?: string;
  logLevel: string;
  enableMetrics: boolean;
  enableAuditLogging: boolean;
  enableDistributedRateLimit: boolean;
  denokv?: {
    url?: string;
    token?: string;
  };
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  environment: string;
  checks: {
    [key: string]: 'ok' | 'warn' | 'error';
  };
  metrics?: {
    memory: NodeJS.MemoryUsage;
    uptime: number;
  };
}

// DeadLetterEvent は後で詳細定義される

export interface WebhookProcessingResult {
  success: boolean;
  eventsProcessed: number;
  eventsSkipped: number;
  eventsFailed: number;
  processingTimeMs: number;
  errors: string[];
}

// Database Types
export type DepositStatus = 'pending' | 'confirmed' | 'rejected';

export interface DepositAddressRecord {
  id: string;
  user_id: string;
  address: string;
  asset: string | null;
  chain: string;
  network: string;
  active: boolean;
  destination_tag?: string | null;
}

export interface DepositRecord {
  id: string;
  user_id: string;
  amount: string;
  currency: string;
  chain: string | null;
  network: string | null;
  status: DepositStatus;
  transaction_hash: string | null;
  confirmations_required: number | null;
  confirmations_observed: number | null;
  confirmed_at: string | null;
}

export type DepositTransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface DepositTransactionRecord {
  id: string;
  user_id: string;
  chain: string;
  network: string;
  status: DepositTransactionStatus;
  confirmations: number | null;
  required_confirmations: number | null;
  block_number: number | null;
  confirmed_at: string | null;
  processed_at: string | null;
}

export interface DepositTransactionParams {
  user_id: string;
  amount: number;
  currency: string | null;
  chain?: string;
  network?: string;
  asset?: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  transaction_hash: string;
  wallet_address: string;
  confirmations_required: number;
  confirmations_observed: number;
}

// Utility Types
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
export type WebhookEventType = 'webhook_event_received' | 'webhook_signature_missing' | 'webhook_signature_invalid' | 'rate_limit_exceeded' | 'deposit_transaction_processed' | 'user_balance_updated';

// Dead Letter Queue Types
export interface DeadLetterEvent {
  id: string;
  webhook_id: string;
  payload: Record<string, unknown>;
  error_message: string;
  error_type: ErrorType;
  retry_count: number;
  max_retries: number;
  next_retry_at: string;
  status: DeadLetterStatus;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export type ErrorType = 'retryable' | 'permanent' | 'rate_limited';
export type DeadLetterStatus = 'pending' | 'retrying' | 'failed' | 'success' | 'expired';

export interface DeadLetterConfig {
  maxRetries: number;
  retryDelayBase: number;
  maxRetryDelay: number;
  cleanupInterval: number;
  maxAge: number;
}

export interface DeadLetterStats {
  totalEvents: number;
  pendingEvents: number;
  retryingEvents: number;
  failedEvents: number;
  successEvents: number;
  expiredEvents: number;
  averageRetries: number;
  oldestEvent: string | null;
}
