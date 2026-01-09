/**
 * Tatum API Logger - Deno Native Implementation
 *
 * 構造化ログシステムとメトリクス収集
 * Denoコンソール機能とJSONログ出力対応
 */

import type { LogLevel, LogEntry, LoggerConfig } from './types.ts';
import { tatumConfig } from './config.ts';

// ====================================
// Logger Implementation
// ====================================

export class TatumLogger {
  private static instance: TatumLogger;
  private config: LoggerConfig;
  private requestId?: string;

  private constructor(config?: LoggerConfig) {
    this.config = config || tatumConfig.getLoggerConfig();
  }

  static getInstance(config?: LoggerConfig): TatumLogger {
    if (!TatumLogger.instance) {
      TatumLogger.instance = new TatumLogger(config);
    }
    return TatumLogger.instance;
  }

  /**
   * リクエストIDを設定（トレース用）
   */
  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  /**
   * リクエストIDをクリア
   */
  clearRequestId(): void {
    this.requestId = undefined;
  }

  // ====================================
  // Logging Methods
  // ====================================

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);
  }

  // ====================================
  // Core Logging Logic
  // ====================================

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      context,
      error: error ? this.serializeError(error) : undefined
    };

    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    if (this.config.enableStructured) {
      this.logStructured(entry);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    return levels[level] >= levels[this.config.level];
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const requestId = entry.requestId ? ` [${entry.requestId}]` : '';
    const prefix = `[${timestamp}] ${entry.level.toUpperCase()}${requestId}:`;

    let message = `${prefix} ${entry.message}`;

    // Add context if present
    if (entry.context && Object.keys(entry.context).length > 0) {
      message += ` | Context: ${JSON.stringify(entry.context)}`;
    }

    // Use appropriate console method
    switch (entry.level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        if (entry.error && this.config.includeStack && entry.error.stack) {
          console.error('Stack:', entry.error.stack);
        }
        break;
    }
  }

  private logStructured(entry: LogEntry): void {
    // Output structured JSON log for log aggregation systems
    const structuredLog = {
      '@timestamp': entry.timestamp,
      level: entry.level,
      message: entry.message,
      requestId: entry.requestId,
      service: 'tatum-api',
      ...entry.context,
      ...(entry.error && { error: entry.error })
    };

    // Use console.log for structured output (captured by log collectors)
    console.log(JSON.stringify(structuredLog));
  }

  private serializeError(error: Error): Record<string, unknown> {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message
    };

    if (this.config.includeStack && error.stack) {
      serialized.stack = error.stack;
    }

    // Include additional properties if they exist
    Object.getOwnPropertyNames(error).forEach(key => {
      if (key !== 'name' && key !== 'message' && key !== 'stack') {
        serialized[key] = (error as unknown as Record<string, unknown>)[key];
      }
    });

    return serialized;
  }

  // ====================================
  // Performance Logging
  // ====================================

  /**
   * パフォーマンス測定開始
   */
  startTimer(label: string): PerformanceTimer {
    return new PerformanceTimer(this, label);
  }

  /**
   * リクエスト開始ログ
   */
  logRequestStart(
    method: string,
    endpoint: string,
    context?: Record<string, unknown>
  ): void {
    this.info(`Request started: ${method} ${endpoint}`, {
      method,
      endpoint,
      ...context
    });
  }

  /**
   * リクエスト完了ログ
   */
  logRequestComplete(
    method: string,
    endpoint: string,
    statusCode: number,
    duration: number,
    context?: Record<string, unknown>
  ): void {
    const level = statusCode >= 400 ? 'warn' : 'info';
    this.log(level, `Request completed: ${method} ${endpoint} (${statusCode}) in ${duration}ms`, {
      method,
      endpoint,
      statusCode,
      duration,
      ...context
    });
  }

  /**
   * リクエスト失敗ログ
   */
  logRequestError(
    method: string,
    endpoint: string,
    error: Error,
    duration?: number,
    context?: Record<string, unknown>
  ): void {
    this.error(`Request failed: ${method} ${endpoint}`, error, {
      method,
      endpoint,
      duration,
      ...context
    });
  }

  // ====================================
  // Rate Limiter Logging
  // ====================================

  logRateLimitHit(tokens: number, context?: Record<string, unknown>): void {
    this.warn('Rate limit hit', {
      remainingTokens: tokens,
      ...context
    });
  }

  logRateLimitRecovery(tokens: number, context?: Record<string, unknown>): void {
    this.info('Rate limit recovered', {
      tokens,
      ...context
    });
  }

  // ====================================
  // Circuit Breaker Logging
  // ====================================

  logCircuitBreakerTrip(failures: number, context?: Record<string, unknown>): void {
    this.error('Circuit breaker tripped', undefined, {
      failures,
      ...context
    });
  }

  logCircuitBreakerReset(context?: Record<string, unknown>): void {
    this.info('Circuit breaker reset', context);
  }

  logCircuitBreakerHalfOpen(context?: Record<string, unknown>): void {
    this.info('Circuit breaker half-open', context);
  }

  // ====================================
  // Subscription Logging
  // ====================================

  logSubscriptionCreated(
    subscriptionId: string,
    type: string,
    context?: Record<string, unknown>
  ): void {
    this.info(`Subscription created: ${subscriptionId}`, {
      subscriptionId,
      type,
      ...context
    });
  }

  logSubscriptionDeleted(
    subscriptionId: string,
    context?: Record<string, unknown>
  ): void {
    this.info(`Subscription deleted: ${subscriptionId}`, {
      subscriptionId,
      ...context
    });
  }

  logWebhookReceived(
    subscriptionId: string,
    chain: string,
    context?: Record<string, unknown>
  ): void {
    this.info(`Webhook received for subscription: ${subscriptionId}`, {
      subscriptionId,
      chain,
      ...context
    });
  }
}

// ====================================
// Performance Timer Class
// ====================================

export class PerformanceTimer {
  private startTime: number;
  private label: string;
  private logger: TatumLogger;

  constructor(logger: TatumLogger, label: string) {
    this.logger = logger;
    this.label = label;
    this.startTime = performance.now();
  }

  /**
   * タイマー終了とログ出力
   */
  end(context?: Record<string, unknown>): number {
    const duration = Math.round(performance.now() - this.startTime);

    this.logger.info(`${this.label} completed in ${duration}ms`, {
      duration,
      operation: this.label,
      ...context
    });

    return duration;
  }

  /**
   * 現在の経過時間を取得（終了しない）
   */
  elapsed(): number {
    return Math.round(performance.now() - this.startTime);
  }
}

// ====================================
// Request ID Generator
// ====================================

export class RequestIdGenerator {
  private static counter = 0;

  static generate(): string {
    const timestamp = Date.now().toString(36);
    const counter = (++RequestIdGenerator.counter).toString(36);
    const random = Math.random().toString(36).substring(2, 8);

    return `req_${timestamp}_${counter}_${random}`;
  }
}

// ====================================
// Singleton Exports
// ====================================

export const logger = TatumLogger.getInstance();