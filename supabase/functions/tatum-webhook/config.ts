// Tatum Webhook Configuration - 設定・環境変数管理

// Deno環境での型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import type { EnvironmentConfig, RetryConfig, RateLimitConfig } from './types.ts';

// サービス情報
export const SERVICE_VERSION = "2.1.0";
export const SERVICE_NAME = "tatum-webhook";
export const ENVIRONMENT = Deno.env.get("ENVIRONMENT") || "development";

// デフォルト確認数設定
export const DEFAULT_REQUIRED_CONFIRMATIONS: Record<string, number> = {
  evm: 12,
  bitcoin: 3,
  btc: 3,
  tron: 19,
  trc: 19,
  cardano: 15,
  ada: 15,
  xrp: 1,
};

// リトライ設定
export const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // ms
  maxDelay: 10000, // ms
  backoffMultiplier: 2,
};

// レート制限設定
export const RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60000, // 1分
  maxRequests: 1000, // 1分間に最大1000リクエスト
};

// メモリ管理設定
export const MEMORY_CONFIG = {
  metricsMaxSize: 1000, // メトリクスの最大蓄積数
  rateLimitCleanupInterval: 60000, // レート制限クリーンアップ間隔（ms）
  memoryCheckInterval: 30000, // メモリチェック間隔（ms）
  maxMemoryUsageMB: 512, // 最大メモリ使用量（MB）
};

// デッドレターキュー設定
export const DEAD_LETTER_CONFIG = {
  maxRetries: 5,
  retryDelayBase: 30000, // 30秒
  maxRetryDelay: 3600000, // 1時間
  cleanupInterval: 86400000, // 24時間
  maxAge: 604800000, // 7日間
};

/**
 * 環境変数をバリデーションし、設定オブジェクトを返す
 */
export function validateEnvironment(): EnvironmentConfig {
  const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = requiredVars.filter(varName => !Deno.env.get(varName));

  if (missing.length > 0) {
    throw new Error(`必須環境変数が不足しています: ${missing.join(', ')}`);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for secure webhook processing. ANON_KEY is not permitted for security reasons.");
  }

  const config: EnvironmentConfig = {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseServiceRoleKey: serviceRoleKey,
    tatumWebhookSecret: Deno.env.get("TATUM_WEBHOOK_SECRET"),
    logLevel: Deno.env.get("LOG_LEVEL") || "INFO",
    enableMetrics: Deno.env.get("ENABLE_METRICS") === "true",
    enableAuditLogging: Deno.env.get("ENABLE_AUDIT_LOGGING") !== "false", // デフォルトON
    enableDistributedRateLimit: Deno.env.get("ENABLE_DISTRIBUTED_RATE_LIMIT") === "true",
  };

  // Deno KV設定（分散レート制限用）
  if (config.enableDistributedRateLimit) {
    config.denokv = {
      url: Deno.env.get("DENOKV_URL"),
      token: Deno.env.get("DENOKV_TOKEN"),
    };
  }

  // 設定検証
  validateConfig(config);

  // 本番環境では署名検証必須
  if (ENVIRONMENT === 'production' && !config.tatumWebhookSecret) {
    throw new Error('本番環境ではTATUM_WEBHOOK_SECRETが必須です。セキュリティ上、署名なしのWebhookは受信できません。');
  }

  return config;
}

/**
 * 設定値の妥当性をチェック
 */
function validateConfig(config: EnvironmentConfig): void {
  // ログレベル検証
  const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
  if (!validLogLevels.includes(config.logLevel.toUpperCase())) {
    console.warn(`Invalid log level: ${config.logLevel}. Using INFO.`);
    config.logLevel = 'INFO';
  }

  // 分散レート制限設定検証
  if (config.enableDistributedRateLimit && !config.denokv?.url) {
    console.warn("分散レート制限が有効ですが、DENOKV_URLが設定されていません。ローカルモードにフォールバックします。");
    config.enableDistributedRateLimit = false;
  }

  // URL検証
  try {
    new URL(config.supabaseUrl);
  } catch {
    throw new Error(`無効なSupabase URL: ${config.supabaseUrl}`);
  }
}

/**
 * 設定のサマリーをログ出力
 */
export function logConfigSummary(config: EnvironmentConfig): void {
  console.log(JSON.stringify({
    level: 'INFO',
    message: 'Tatum Webhook設定読み込み完了',
    config: {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: ENVIRONMENT,
      logLevel: config.logLevel,
      metricsEnabled: config.enableMetrics,
      auditLoggingEnabled: config.enableAuditLogging,
      distributedRateLimitEnabled: config.enableDistributedRateLimit,
      webhookSecretConfigured: !!config.tatumWebhookSecret,
    },
  }));
}