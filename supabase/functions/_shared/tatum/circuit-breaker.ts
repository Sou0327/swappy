/**
 * Tatum API Circuit Breaker - Deno Native Implementation
 *
 * 回路ブレーカーパターンによるレジリエンス機能
 * 障害時の自動復旧とシステム保護機能
 */

import type { CircuitBreakerConfig, CircuitBreakerState, CircuitState } from './types.ts';
import { TatumCircuitBreakerError, TatumErrorHandler } from './errors.ts';
import { logger } from './logger.ts';
import { TimeUtils } from './utils.ts';

// ====================================
// Circuit Breaker Implementation
// ====================================

export class TatumCircuitBreaker {
  private config: Required<CircuitBreakerConfig>;
  private state: CircuitBreakerState;
  private halfOpenAttempts = 0;
  private maxHalfOpenAttempts = 3;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: config.failureThreshold,
      recoveryTime: config.recoveryTime,
      timeout: config.timeout,
      monitor: config.monitor ?? true
    };

    this.state = {
      state: 'CLOSED',
      failures: 0,
      lastFailure: 0,
      nextAttempt: 0
    };

    logger.info('Circuit breaker initialized', {
      failureThreshold: this.config.failureThreshold,
      recoveryTime: this.config.recoveryTime,
      timeout: this.config.timeout,
      monitor: this.config.monitor
    });
  }

  /**
   * 保護された操作の実行
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    // Circuit state check
    this.updateState();

    if (this.state.state === 'OPEN') {
      const timeUntilRetry = this.state.nextAttempt - TimeUtils.nowUnixMs();
      if (timeUntilRetry > 0) {
        throw new TatumCircuitBreakerError(this.state.nextAttempt, {
          operationName,
          currentState: this.state.state,
          failures: this.state.failures
        });
      }
      // Time to try half-open
      this.transitionToHalfOpen();
    }

    const startTime = TimeUtils.nowUnixMs();

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(operation);

      // Success - handle state transitions
      this.onSuccess(operationName);

      return result;

    } catch (error) {
      const duration = TimeUtils.elapsed(startTime);
      this.onFailure(error as Error, operationName, duration);
      throw error;
    }
  }

  /**
   * 現在の状態取得
   */
  getState(): CircuitBreakerState {
    this.updateState();
    return { ...this.state };
  }

  /**
   * 統計情報取得
   */
  getStats(): {
    config: Required<CircuitBreakerConfig>;
    state: CircuitBreakerState;
    halfOpenAttempts: number;
    maxHalfOpenAttempts: number;
    isHealthy: boolean;
    timeUntilRetry: number;
  } {
    this.updateState();

    return {
      config: { ...this.config },
      state: { ...this.state },
      halfOpenAttempts: this.halfOpenAttempts,
      maxHalfOpenAttempts: this.maxHalfOpenAttempts,
      isHealthy: this.state.state === 'CLOSED',
      timeUntilRetry: Math.max(0, this.state.nextAttempt - TimeUtils.nowUnixMs())
    };
  }

  /**
   * 手動リセット
   */
  reset(): void {
    const oldState = this.state.state;

    this.state = {
      state: 'CLOSED',
      failures: 0,
      lastFailure: 0,
      nextAttempt: 0
    };
    this.halfOpenAttempts = 0;

    if (this.config.monitor) {
      logger.logCircuitBreakerReset({
        oldState,
        newState: this.state.state
      });
    }
  }

  /**
   * 設定更新
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    const oldConfig = { ...this.config };

    if (config.failureThreshold !== undefined) {
      this.config.failureThreshold = config.failureThreshold;
    }

    if (config.recoveryTime !== undefined) {
      this.config.recoveryTime = config.recoveryTime;
    }

    if (config.timeout !== undefined) {
      this.config.timeout = config.timeout;
    }

    if (config.monitor !== undefined) {
      this.config.monitor = config.monitor;
    }

    logger.info('Circuit breaker configuration updated', {
      oldConfig,
      newConfig: this.config
    });
  }

  /**
   * 強制的な状態変更
   */
  forceState(newState: CircuitState): void {
    const oldState = this.state.state;
    this.state.state = newState;

    if (newState === 'CLOSED') {
      this.state.failures = 0;
      this.halfOpenAttempts = 0;
    } else if (newState === 'OPEN') {
      this.state.nextAttempt = TimeUtils.futureMs(this.config.recoveryTime);
    }

    logger.info('Circuit breaker state forced', {
      oldState,
      newState,
      forced: true
    });
  }

  // ====================================
  // Private Implementation
  // ====================================

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
    }, this.config.timeout);

    try {
      // Create a promise that rejects on timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutController.signal.addEventListener('abort', () => {
          reject(new Error(`Operation timed out after ${this.config.timeout}ms`));
        });
      });

      // Race between the operation and timeout
      const result = await Promise.race([
        operation(),
        timeoutPromise
      ]);

      return result;

    } finally {
      clearTimeout(timeoutId);
    }
  }

  private updateState(): void {
    if (this.state.state === 'OPEN') {
      const now = TimeUtils.nowUnixMs();
      if (now >= this.state.nextAttempt) {
        this.transitionToHalfOpen();
      }
    }
  }

  private onSuccess(operationName?: string): void {
    if (this.state.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;

      if (this.halfOpenAttempts >= this.maxHalfOpenAttempts) {
        // Enough successful attempts - close the circuit
        this.transitionToClosed();
      }
    } else if (this.state.state === 'CLOSED' && this.state.failures > 0) {
      // Reset failure count on success
      this.state.failures = 0;
    }

    if (this.config.monitor) {
      logger.debug('Circuit breaker operation succeeded', {
        operationName,
        state: this.state.state,
        failures: this.state.failures,
        halfOpenAttempts: this.halfOpenAttempts
      });
    }
  }

  private onFailure(error: Error, operationName?: string, duration?: number): void {
    this.state.failures++;
    this.state.lastFailure = TimeUtils.nowUnixMs();

    if (this.state.state === 'HALF_OPEN') {
      // Failure in half-open state - immediately go to open
      this.transitionToOpen();
    } else if (this.state.state === 'CLOSED') {
      // Check if we should trip the breaker
      if (this.state.failures >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }

    if (this.config.monitor) {
      const errorSeverity = TatumErrorHandler.getSeverity(error);
      const isRetryable = TatumErrorHandler.isRetryable(error);

      logger.error('Circuit breaker operation failed', error, {
        operationName,
        state: this.state.state,
        failures: this.state.failures,
        errorSeverity,
        isRetryable,
        duration
      });
    }
  }

  private transitionToClosed(): void {
    const oldState = this.state.state;

    this.state.state = 'CLOSED';
    this.state.failures = 0;
    this.halfOpenAttempts = 0;
    this.state.nextAttempt = 0;

    if (this.config.monitor) {
      logger.logCircuitBreakerReset({
        oldState,
        newState: this.state.state,
        transition: 'HALF_OPEN -> CLOSED'
      });
    }
  }

  private transitionToOpen(): void {
    const oldState = this.state.state;

    this.state.state = 'OPEN';
    this.state.nextAttempt = TimeUtils.futureMs(this.config.recoveryTime);
    this.halfOpenAttempts = 0;

    if (this.config.monitor) {
      logger.logCircuitBreakerTrip(this.state.failures, {
        oldState,
        newState: this.state.state,
        nextAttempt: this.state.nextAttempt,
        recoveryTime: this.config.recoveryTime
      });
    }
  }

  private transitionToHalfOpen(): void {
    const oldState = this.state.state;

    this.state.state = 'HALF_OPEN';
    this.halfOpenAttempts = 0;

    if (this.config.monitor) {
      logger.logCircuitBreakerHalfOpen({
        oldState,
        newState: this.state.state,
        failures: this.state.failures
      });
    }
  }
}

// ====================================
// Circuit Breaker Manager
// ====================================

export class CircuitBreakerManager {
  private breakers: Map<string, TatumCircuitBreaker> = new Map();

  /**
   * 回路ブレーカーの作成・取得
   */
  getBreaker(key: string, config: CircuitBreakerConfig): TatumCircuitBreaker {
    if (!this.breakers.has(key)) {
      const breaker = new TatumCircuitBreaker(config);
      this.breakers.set(key, breaker);

      logger.info(`Circuit breaker created for key: ${key}`, {
        key,
        config
      });
    }

    return this.breakers.get(key)!;
  }

  /**
   * 回路ブレーカーの削除
   */
  removeBreaker(key: string): boolean {
    const removed = this.breakers.delete(key);
    if (removed) {
      logger.info(`Circuit breaker removed for key: ${key}`, { key });
    }
    return removed;
  }

  /**
   * 全回路ブレーカーの統計
   */
  getAllStats(): Record<string, ReturnType<TatumCircuitBreaker['getStats']>> {
    const stats: Record<string, ReturnType<TatumCircuitBreaker['getStats']>> = {};

    this.breakers.forEach((breaker, key) => {
      stats[key] = breaker.getStats();
    });

    return stats;
  }

  /**
   * 全回路ブレーカーのリセット
   */
  resetAll(): void {
    this.breakers.forEach(breaker => {
      breaker.reset();
    });

    logger.info('All circuit breakers reset');
  }

  /**
   * ヘルスチェック
   */
  getHealthStatus(): {
    healthy: number;
    halfOpen: number;
    open: number;
    total: number;
    details: Record<string, CircuitState>;
  } {
    let healthy = 0;
    let halfOpen = 0;
    let open = 0;
    const details: Record<string, CircuitState> = {};

    this.breakers.forEach((breaker, key) => {
      const state = breaker.getState().state;
      details[key] = state;

      switch (state) {
        case 'CLOSED':
          healthy++;
          break;
        case 'HALF_OPEN':
          halfOpen++;
          break;
        case 'OPEN':
          open++;
          break;
      }
    });

    return {
      healthy,
      halfOpen,
      open,
      total: this.breakers.size,
      details
    };
  }
}

// ====================================
// Composite Breaker
// ====================================

export class CompositeCircuitBreaker {
  private breakers: Map<string, TatumCircuitBreaker> = new Map();
  private strategy: 'ALL_CLOSED' | 'ANY_CLOSED' | 'MAJORITY_CLOSED' = 'ALL_CLOSED';

  constructor(strategy: 'ALL_CLOSED' | 'ANY_CLOSED' | 'MAJORITY_CLOSED' = 'ALL_CLOSED') {
    this.strategy = strategy;
  }

  /**
   * ブレーカー追加
   */
  addBreaker(name: string, breaker: TatumCircuitBreaker): void {
    this.breakers.set(name, breaker);
  }

  /**
   * ブレーカー削除
   */
  removeBreaker(name: string): boolean {
    return this.breakers.delete(name);
  }

  /**
   * 複合保護された操作の実行
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    if (!this.shouldAllow()) {
      throw new TatumCircuitBreakerError(TimeUtils.futureMs(5000), {
        operationName,
        currentState: 'OPEN',
        compositeStrategy: this.strategy
      });
    }

    // Execute through the first available breaker
    const availableBreaker = this.getAvailableBreaker();
    if (!availableBreaker) {
      throw new TatumCircuitBreakerError(TimeUtils.futureMs(5000), {
        operationName,
        currentState: 'OPEN',
        reason: 'No available circuit breakers'
      });
    }

    return availableBreaker.execute(operation, operationName);
  }

  /**
   * 複合状態取得
   */
  getCompositeState(): {
    allowOperation: boolean;
    strategy: string;
    breakerStates: Record<string, CircuitState>;
    summary: ReturnType<CircuitBreakerManager['getHealthStatus']>;
  } {
    const breakerStates: Record<string, CircuitState> = {};
    let healthy = 0;
    let halfOpen = 0;
    let open = 0;

    this.breakers.forEach((breaker, name) => {
      const state = breaker.getState().state;
      breakerStates[name] = state;

      switch (state) {
        case 'CLOSED':
          healthy++;
          break;
        case 'HALF_OPEN':
          halfOpen++;
          break;
        case 'OPEN':
          open++;
          break;
      }
    });

    return {
      allowOperation: this.shouldAllow(),
      strategy: this.strategy,
      breakerStates,
      summary: {
        healthy,
        halfOpen,
        open,
        total: this.breakers.size,
        details: breakerStates
      }
    };
  }

  private shouldAllow(): boolean {
    const states = Array.from(this.breakers.values()).map(b => b.getState().state);

    switch (this.strategy) {
      case 'ALL_CLOSED':
        return states.every(state => state === 'CLOSED');

      case 'ANY_CLOSED':
        return states.some(state => state === 'CLOSED' || state === 'HALF_OPEN');

      case 'MAJORITY_CLOSED': {
        const closedCount = states.filter(state => state === 'CLOSED' || state === 'HALF_OPEN').length;
        return closedCount > states.length / 2;
      }

      default:
        return false;
    }
  }

  private getAvailableBreaker(): TatumCircuitBreaker | null {
    for (const breaker of this.breakers.values()) {
      const state = breaker.getState().state;
      if (state === 'CLOSED' || state === 'HALF_OPEN') {
        return breaker;
      }
    }
    return null;
  }
}

// ====================================
// Singleton Export
// ====================================

export const circuitBreakerManager = new CircuitBreakerManager();