// Tatum Webhook Logger - 構造化ログシステム

import type { LogContext, AuditLogEntry, LogLevel } from './types.ts';
import { SERVICE_NAME, SERVICE_VERSION, ENVIRONMENT } from './config.ts';

/**
 * 構造化ログシステム
 * 金融グレードの監査対応ログを提供
 */
export class Logger {
  private logLevel: string;
  private enableAuditLogging: boolean;

  constructor(logLevel: string, enableAuditLogging: boolean) {
    this.logLevel = logLevel.toUpperCase();
    this.enableAuditLogging = enableAuditLogging;
  }

  private shouldLog(level: string): boolean {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    const currentIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  private log(level: LogLevel, message: string, context: LogContext, extra?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      level,
      message,
      ...context,
      ...extra,
    };

    console.log(JSON.stringify(logEntry));
  }

  debug(message: string, context: LogContext, extra?: Record<string, unknown>) {
    this.log('DEBUG', message, context, extra);
  }

  info(message: string, context: LogContext, extra?: Record<string, unknown>) {
    this.log('INFO', message, context, extra);
  }

  warn(message: string, context: LogContext, extra?: Record<string, unknown>) {
    this.log('WARN', message, context, extra);
  }

  error(message: string, context: LogContext, error?: Error, extra?: Record<string, unknown>) {
    this.log('ERROR', message, context, {
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
      ...extra,
    });
  }

  critical(message: string, context: LogContext, error?: Error, extra?: Record<string, unknown>) {
    this.log('CRITICAL', message, context, {
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
      ...extra,
    });
  }

  /**
   * セキュリティ監査ログを出力
   * 金融システムの監査要件に対応
   */
  async auditLog(entry: AuditLogEntry) {
    if (!this.enableAuditLogging) return;

    const auditEntry = {
      level: 'AUDIT',
      message: `監査ログ: ${entry.event}`,
      audit: entry,
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: ENVIRONMENT,
    };

    console.log(JSON.stringify(auditEntry));
  }
}

/**
 * 相関IDを生成
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * ログコンテキストを作成
 */
export function createLogContext(correlationId: string): LogContext {
  return {
    correlationId,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: ENVIRONMENT,
  };
}

/**
 * リクエスト情報を安全に取得
 */
export function extractRequestInfo(req: Request): {
  clientIp: string;
  userAgent: string;
  method: string;
  url: string;
} {
  return {
    clientIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
    userAgent: req.headers.get("user-agent") || "unknown",
    method: req.method,
    url: req.url,
  };
}

/**
 * エラー情報を安全にシリアライズ
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'Unknown error', raw: String(error) };
}