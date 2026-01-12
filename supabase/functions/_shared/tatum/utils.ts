/**
 * Tatum API Utilities - Deno Native Implementation
 *
 * Fetch APIラッパーとDenoネイティブユーティリティ
 * Web標準API活用による高パフォーマンス実装
 */

import type { TatumRequestConfig, TatumApiResponse } from './types.ts';
import { TatumNetworkError, TatumApiError, TatumErrorFactory } from './errors.ts';
import { logger, RequestIdGenerator } from './logger.ts';

// ====================================
// HTTP Client Utilities
// ====================================

export class TatumHttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;

  constructor(
    baseUrl: string,
    apiKey: string,
    defaultTimeout: number = 30000
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.defaultTimeout = defaultTimeout;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'User-Agent': 'Swappy-Tatum-Client/1.0.0'
    };
  }

  /**
   * HTTP リクエスト実行
   */
  async request<T = unknown>(config: TatumRequestConfig): Promise<TatumApiResponse<T>> {
    const requestId = RequestIdGenerator.generate();
    logger.setRequestId(requestId);

    const startTime = performance.now();
    const url = this.buildUrl(config.endpoint, config.params);
    const requestConfig = this.buildRequestConfig(config);

    logger.logRequestStart(config.method, config.endpoint, {
      url: url.toString(),
      hasBody: !!config.body
    });

    try {
      const response = await this.executeRequest(url, requestConfig);
      const responseData = await this.parseResponse(response);
      const duration = Math.round(performance.now() - startTime);

      logger.logRequestComplete(
        config.method,
        config.endpoint,
        response.status,
        duration,
        { responseSize: JSON.stringify(responseData).length }
      );

      if (!response.ok) {
        const apiError = TatumErrorFactory.createFromResponse(response, responseData, {
          endpoint: config.endpoint,
          method: config.method,
          requestId
        });
        throw apiError;
      }

      return {
        success: true,
        data: responseData as T,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const duration = Math.round(performance.now() - startTime);

      if (error instanceof TatumApiError) {
        logger.logRequestError(config.method, config.endpoint, error, duration);
        throw error;
      }

      const networkError = TatumErrorFactory.createFromFetchError(error as Error, {
        endpoint: config.endpoint,
        method: config.method,
        requestId
      });

      logger.logRequestError(config.method, config.endpoint, networkError, duration);
      throw networkError;

    } finally {
      logger.clearRequestId();
    }
  }

  /**
   * GET リクエスト
   */
  async get<T = unknown>(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.request<T>({
      method: 'GET',
      endpoint,
      params,
      ...config
    });
  }

  /**
   * POST リクエスト
   */
  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      endpoint,
      body,
      ...config
    });
  }

  /**
   * PUT リクエスト
   */
  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      endpoint,
      body,
      ...config
    });
  }

  /**
   * DELETE リクエスト
   */
  async delete<T = unknown>(
    endpoint: string,
    config?: Partial<TatumRequestConfig>
  ): Promise<TatumApiResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      endpoint,
      ...config
    });
  }

  // ====================================
  // Private Implementation
  // ====================================

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean>): URL {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    return url;
  }

  private buildRequestConfig(config: TatumRequestConfig): RequestInit {
    const headers = new Headers(this.defaultHeaders);

    // Add custom headers
    if (config.headers) {
      Object.entries(config.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    const requestConfig: RequestInit = {
      method: config.method,
      headers,
      signal: config.signal
    };

    // Add body for POST/PUT requests
    if (config.body && (config.method === 'POST' || config.method === 'PUT')) {
      requestConfig.body = JSON.stringify(config.body);
    }

    return requestConfig;
  }

  private async executeRequest(url: URL, config: RequestInit): Promise<Response> {
    const timeout = this.defaultTimeout;

    // Create abort controller for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    try {
      // Combine user signal with timeout signal
      const combinedSignal = this.combineAbortSignals([
        config.signal,
        timeoutController.signal
      ].filter(Boolean) as AbortSignal[]);

      const response = await fetch(url.toString(), {
        ...config,
        signal: combinedSignal
      });

      return response;

    } finally {
      clearTimeout(timeoutId);
    }
  }

  private combineAbortSignals(signals: AbortSignal[]): AbortSignal {
    if (signals.length === 0) {
      return new AbortController().signal;
    }

    if (signals.length === 1) {
      return signals[0];
    }

    const controller = new AbortController();

    const onAbort = () => {
      controller.abort();
    };

    signals.forEach(signal => {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', onAbort);
      }
    });

    return controller.signal;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  }
}

// ====================================
// Retry Utilities
// ====================================

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true
};

export class RetryManager {
  /**
   * リトライ実行機能
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: Error) => boolean,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === retryConfig.maxAttempts || !shouldRetry(lastError)) {
          throw lastError;
        }

        const delay = this.calculateDelay(attempt, retryConfig);
        logger.info(`Retrying operation after ${delay}ms (attempt ${attempt}/${retryConfig.maxAttempts})`);

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private static calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, config.maxDelay);

    if (config.jitter) {
      // Add ±10% jitter
      const jitterFactor = 0.1;
      const jitter = (Math.random() - 0.5) * 2 * jitterFactor;
      delay = Math.floor(delay * (1 + jitter));
    }

    return Math.max(0, delay);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ====================================
// URL Utilities
// ====================================

export class UrlUtils {
  /**
   * クエリパラメータの安全な追加
   */
  static addParams(
    baseUrl: string,
    params: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(baseUrl);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    return url.toString();
  }

  /**
   * URLパスの結合
   */
  static joinPaths(...paths: string[]): string {
    return paths
      .map(path => path.replace(/^\/+|\/+$/g, ''))
      .filter(path => path.length > 0)
      .join('/');
  }

  /**
   * URLの検証
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

// ====================================
// JSON Utilities
// ====================================

export class JsonUtils {
  /**
   * 安全なJSON parse
   */
  static safeParse<T = unknown>(json: string, defaultValue?: T): T | undefined {
    try {
      return JSON.parse(json);
    } catch {
      return defaultValue;
    }
  }

  /**
   * 安全なJSON stringify
   */
  static safeStringify(
    obj: unknown,
    replacer?: (key: string, value: unknown) => unknown,
    space?: number
  ): string {
    try {
      return JSON.stringify(obj, replacer, space);
    } catch {
      return '{}';
    }
  }

  /**
   * オブジェクトのディープクローン
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

// ====================================
// Validation Utilities
// ====================================

export class ValidationUtils {
  /**
   * 必須フィールドの検証
   */
  static validateRequired<T extends Record<string, unknown>>(
    obj: T,
    requiredFields: (keyof T)[]
  ): string[] {
    const errors: string[] = [];

    requiredFields.forEach(field => {
      const value = obj[field];
      if (value === undefined || value === null || value === '') {
        errors.push(`Field '${String(field)}' is required`);
      }
    });

    return errors;
  }

  /**
   * 文字列の長さ検証
   */
  static validateStringLength(
    value: unknown,
    minLength: number,
    maxLength: number,
    fieldName: string
  ): string[] {
    const errors: string[] = [];

    if (typeof value !== 'string') {
      errors.push(`${fieldName} must be a string`);
      return errors;
    }

    if (value.length < minLength) {
      errors.push(`${fieldName} must be at least ${minLength} characters long`);
    }

    if (value.length > maxLength) {
      errors.push(`${fieldName} must be no more than ${maxLength} characters long`);
    }

    return errors;
  }

  /**
   * 数値範囲の検証
   */
  static validateNumberRange(
    value: unknown,
    min: number,
    max: number,
    fieldName: string
  ): string[] {
    const errors: string[] = [];

    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`${fieldName} must be a valid number`);
      return errors;
    }

    if (value < min) {
      errors.push(`${fieldName} must be at least ${min}`);
    }

    if (value > max) {
      errors.push(`${fieldName} must be no more than ${max}`);
    }

    return errors;
  }
}

// ====================================
// Time Utilities
// ====================================

export class TimeUtils {
  /**
   * 現在のUnixタイムスタンプ（秒）
   */
  static nowUnix(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * 現在のUnixタイムスタンプ（ミリ秒）
   */
  static nowUnixMs(): number {
    return Date.now();
  }

  /**
   * ISO 8601形式の現在時刻
   */
  static nowIso(): string {
    return new Date().toISOString();
  }

  /**
   * 指定ミリ秒後のタイムスタンプ
   */
  static futureMs(ms: number): number {
    return Date.now() + ms;
  }

  /**
   * 経過時間の計算
   */
  static elapsed(startTime: number): number {
    return Date.now() - startTime;
  }
}