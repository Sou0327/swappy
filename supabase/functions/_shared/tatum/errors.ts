/**
 * Tatum API Error Definitions - Deno Native Implementation
 *
 * カスタムエラー階層とエラーハンドリングシステム
 * 構造化エラー情報とデバッグサポート
 */

import type { TatumErrorContext, SupportedChain } from './types.ts';

// ====================================
// Base Error Classes
// ====================================

export abstract class TatumError extends Error {
  public code: string;
  public readonly context: TatumErrorContext;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: string,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date().toISOString();
    this.context = {
      timestamp: this.timestamp,
      ...context
    };

    // Maintain proper stack trace (V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

// ====================================
// API Error Classes
// ====================================

export class TatumApiError extends TatumError {
  public readonly statusCode: number;
  public readonly response?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string = 'API_ERROR',
    context: Partial<TatumErrorContext> = {},
    response?: unknown
  ) {
    super(message, code, { ...context, statusCode });
    this.statusCode = statusCode;
    this.response = response;
  }

  static fromResponse(
    response: Response,
    responseBody: unknown,
    context: Partial<TatumErrorContext> = {}
  ): TatumApiError {
    const statusCode = response.status;
    const statusText = response.statusText;

    let message = `API request failed: ${statusCode} ${statusText}`;
    let code = 'API_ERROR';

    // Specific error codes based on status
    if (statusCode === 401) {
      code = 'API_UNAUTHORIZED';
      message = 'Invalid API key or unauthorized access';
    } else if (statusCode === 403) {
      code = 'API_FORBIDDEN';
      message = 'Access forbidden - insufficient permissions';
    } else if (statusCode === 404) {
      code = 'API_NOT_FOUND';
      message = 'API endpoint not found';
    } else if (statusCode === 429) {
      code = 'API_RATE_LIMITED';
      message = 'Rate limit exceeded';
    } else if (statusCode >= 500) {
      code = 'API_SERVER_ERROR';
      message = 'Tatum API server error';
    }

    return new TatumApiError(message, statusCode, code, context, responseBody);
  }
}

export class TatumNetworkError extends TatumError {
  public readonly cause?: Error;

  constructor(
    message: string,
    cause?: Error,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(message, 'NETWORK_ERROR', context);
    this.cause = cause;
  }

  static fromFetchError(
    error: Error,
    context: Partial<TatumErrorContext> = {}
  ): TatumNetworkError {
    let message = 'Network request failed';

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      message = 'Network connection failed';
    } else if (error.name === 'AbortError') {
      message = 'Request was aborted';
    } else if (error.message.includes('timeout')) {
      message = 'Request timed out';
    }

    return new TatumNetworkError(message, error, context);
  }
}

// ====================================
// Timeout and Response Error Classes
// ====================================

export class TatumTimeoutError extends TatumError {
  constructor(
    timeout: number,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(
      `Request timed out after ${timeout}ms`,
      'REQUEST_TIMEOUT',
      context
    );
  }
}

export class TatumResponseError extends TatumError {
  public readonly responseBody?: string;

  constructor(
    message: string,
    responseBody?: string,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(message, 'RESPONSE_ERROR', context);
    this.responseBody = responseBody;
  }
}

// ====================================
// Configuration Error Classes
// ====================================

export class TatumConfigError extends TatumError {
  constructor(
    message: string,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(message, 'CONFIG_ERROR', context);
  }
}

export class TatumValidationError extends TatumError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(
    message: string,
    field?: string,
    value?: unknown,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(message, 'VALIDATION_ERROR', context);
    this.field = field;
    this.value = value;
  }
}

// ====================================
// Rate Limiting Error Classes
// ====================================

export class TatumRateLimitError extends TatumError {
  public readonly retryAfter: number;

  constructor(
    retryAfter: number,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(
      `Rate limit exceeded. Retry after ${retryAfter}ms`,
      'RATE_LIMIT_EXCEEDED',
      context
    );
    this.retryAfter = retryAfter;
  }
}

// ====================================
// Circuit Breaker Error Classes
// ====================================

export class TatumCircuitBreakerError extends TatumError {
  public readonly nextAttempt: number;

  constructor(
    nextAttempt: number,
    context: Partial<TatumErrorContext> = {}
  ) {
    const nextDate = new Date(nextAttempt).toISOString();
    super(
      `Circuit breaker is open. Next attempt allowed at: ${nextDate}`,
      'CIRCUIT_BREAKER_OPEN',
      context
    );
    this.nextAttempt = nextAttempt;
  }
}

// ====================================
// Subscription Error Classes
// ====================================

export class TatumSubscriptionError extends TatumError {
  public readonly subscriptionId?: string;

  constructor(
    message: string,
    subscriptionId?: string,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(message, 'SUBSCRIPTION_ERROR', context);
    this.subscriptionId = subscriptionId;
  }
}

export class TatumSubscriptionNotFoundError extends TatumSubscriptionError {
  constructor(
    subscriptionId: string,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(
      `Subscription not found: ${subscriptionId}`,
      subscriptionId,
      { ...context, subscriptionId }
    );
    this.code = 'SUBSCRIPTION_NOT_FOUND';
  }
}

// ====================================
// Chain Error Classes
// ====================================

export class TatumChainError extends TatumError {
  public readonly chain?: SupportedChain;

  constructor(
    message: string,
    chain?: SupportedChain,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(message, 'CHAIN_ERROR', { ...context, chain });
    this.chain = chain;
  }
}

export class TatumUnsupportedChainError extends TatumChainError {
  constructor(
    chain: string,
    context: Partial<TatumErrorContext> = {}
  ) {
    super(
      `Unsupported chain: ${chain}`,
      undefined,
      context
    );
    this.code = 'UNSUPPORTED_CHAIN';
  }
}

// ====================================
// Error Utilities
// ====================================

export class TatumErrorHandler {
  /**
   * Retry可能なエラーかどうかを判定
   */
  static isRetryable(error: Error): boolean {
    if (error instanceof TatumNetworkError) {
      return true;
    }

    if (error instanceof TatumApiError) {
      // 5xx server errors and 429 rate limits are retryable
      return error.statusCode >= 500 || error.statusCode === 429;
    }

    if (error instanceof TatumRateLimitError) {
      return true;
    }

    // Circuit breaker errors are not immediately retryable
    if (error instanceof TatumCircuitBreakerError) {
      return false;
    }

    return false;
  }

  /**
   * エラーの重要度を判定
   */
  static getSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
    if (error instanceof TatumConfigError) {
      return 'critical';
    }

    if (error instanceof TatumApiError) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        return 'high';
      }
      if (error.statusCode >= 500) {
        return 'medium';
      }
      return 'low';
    }

    if (error instanceof TatumNetworkError) {
      return 'medium';
    }

    if (error instanceof TatumValidationError) {
      return 'high';
    }

    if (error instanceof TatumRateLimitError || error instanceof TatumCircuitBreakerError) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * エラーを構造化されたデータに変換
   */
  static serialize(error: Error): Record<string, unknown> {
    if (error instanceof TatumError) {
      return error.toJSON();
    }

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * エラーからHTTPステータスコードを取得
   */
  static getHttpStatus(error: Error): number {
    if (error instanceof TatumApiError) {
      return error.statusCode;
    }

    if (error instanceof TatumValidationError) {
      return 400;
    }

    if (error instanceof TatumConfigError) {
      return 500;
    }

    if (error instanceof TatumRateLimitError) {
      return 429;
    }

    if (error instanceof TatumCircuitBreakerError) {
      return 503;
    }

    if (error instanceof TatumNetworkError) {
      return 502;
    }

    return 500;
  }

  /**
   * エラーから再試行遅延時間を計算
   */
  static getRetryDelay(error: Error, attempt: number): number {
    if (error instanceof TatumRateLimitError) {
      return error.retryAfter;
    }

    if (error instanceof TatumCircuitBreakerError) {
      return Math.max(0, error.nextAttempt - Date.now());
    }

    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const jitter = Math.random() * 0.1; // 10% jitter

    const delay = Math.min(
      baseDelay * Math.pow(2, attempt - 1),
      maxDelay
    );

    return Math.floor(delay * (1 + jitter));
  }
}

// ====================================
// Error Factory
// ====================================

export class TatumErrorFactory {
  static createFromFetchError(
    error: Error,
    context: Partial<TatumErrorContext> = {}
  ): TatumError {
    return TatumNetworkError.fromFetchError(error, context);
  }

  static createFromResponse(
    response: Response,
    responseBody: unknown,
    context: Partial<TatumErrorContext> = {}
  ): TatumError {
    return TatumApiError.fromResponse(response, responseBody, context);
  }

  static createValidationError(
    message: string,
    field?: string,
    value?: unknown,
    context: Partial<TatumErrorContext> = {}
  ): TatumValidationError {
    return new TatumValidationError(message, field, value, context);
  }

  static createConfigError(
    message: string,
    context: Partial<TatumErrorContext> = {}
  ): TatumConfigError {
    return new TatumConfigError(message, context);
  }
}