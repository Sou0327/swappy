/**
 * Tatum API Rate Limiter - Deno Native Implementation
 *
 * トークンバケット式レート制限機能
 * Web標準タイマーAPIとDenoネイティブ実装
 */

// Deno global type definitions
declare global {
  function setInterval(callback: () => void, delay: number): number;
  function clearInterval(id: number): void;
}

import type { RateLimiterConfig, RateLimiterState } from './types.ts';
import { TatumRateLimitError } from './errors.ts';
import { logger } from './logger.ts';
import { TimeUtils } from './utils.ts';

// ====================================
// Token Bucket Rate Limiter
// ====================================

export class TatumRateLimiter {
  protected config: Required<RateLimiterConfig>;
  private state: RateLimiterState;
  private refillTimer?: number;

  constructor(config: RateLimiterConfig) {
    this.config = {
      tokensPerSecond: config.tokensPerSecond,
      bucketSize: config.bucketSize,
      initialTokens: config.initialTokens ?? config.bucketSize
    };

    this.state = {
      tokens: this.config.initialTokens,
      lastRefill: TimeUtils.nowUnixMs(),
      isBlocked: false
    };

    this.startRefillTimer();
    logger.info('Rate limiter initialized', {
      tokensPerSecond: this.config.tokensPerSecond,
      bucketSize: this.config.bucketSize,
      initialTokens: this.config.initialTokens
    });
  }

  /**
   * トークン取得試行
   */
  async acquireToken(): Promise<void> {
    this.refillTokens();

    if (this.state.tokens >= 1) {
      this.state.tokens -= 1;

      if (this.state.isBlocked) {
        this.state.isBlocked = false;
        logger.logRateLimitRecovery(this.state.tokens);
      }

      return;
    }

    // Rate limit exceeded
    if (!this.state.isBlocked) {
      this.state.isBlocked = true;
      logger.logRateLimitHit(this.state.tokens, {
        tokensPerSecond: this.config.tokensPerSecond,
        bucketSize: this.config.bucketSize
      });
    }

    const retryAfter = this.calculateRetryAfter();
    throw new TatumRateLimitError(retryAfter, {
      tokensPerSecond: this.config.tokensPerSecond,
      bucketSize: this.config.bucketSize,
      currentTokens: this.state.tokens
    });
  }

  /**
   * 複数トークン取得試行
   */
  async acquireTokens(count: number): Promise<void> {
    if (count <= 0) {
      throw new Error('Token count must be positive');
    }

    if (count > this.config.bucketSize) {
      throw new Error(`Requested tokens (${count}) exceeds bucket size (${this.config.bucketSize})`);
    }

    this.refillTokens();

    if (this.state.tokens >= count) {
      this.state.tokens -= count;

      if (this.state.isBlocked) {
        this.state.isBlocked = false;
        logger.logRateLimitRecovery(this.state.tokens);
      }

      return;
    }

    // Rate limit exceeded
    if (!this.state.isBlocked) {
      this.state.isBlocked = true;
      logger.logRateLimitHit(this.state.tokens, {
        tokensPerSecond: this.config.tokensPerSecond,
        bucketSize: this.config.bucketSize,
        requestedTokens: count
      });
    }

    const retryAfter = this.calculateRetryAfterForTokens(count);
    throw new TatumRateLimitError(retryAfter, {
      tokensPerSecond: this.config.tokensPerSecond,
      bucketSize: this.config.bucketSize,
      currentTokens: this.state.tokens,
      requestedTokens: count
    });
  }

  /**
   * トークン数確認（取得しない）
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.state.tokens);
  }

  /**
   * レート制限状態確認
   */
  isBlocked(): boolean {
    this.refillTokens();
    return this.state.isBlocked;
  }

  /**
   * 設定変更
   */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    const oldConfig = { ...this.config };

    if (config.tokensPerSecond !== undefined) {
      this.config.tokensPerSecond = config.tokensPerSecond;
    }

    if (config.bucketSize !== undefined) {
      this.config.bucketSize = config.bucketSize;
      // Adjust current tokens if bucket size decreased
      this.state.tokens = Math.min(this.state.tokens, this.config.bucketSize);
    }

    logger.info('Rate limiter configuration updated', {
      oldConfig,
      newConfig: this.config
    });

    // Restart timer with new configuration
    this.stopRefillTimer();
    this.startRefillTimer();
  }

  /**
   * 統計情報取得
   */
  getStats(): {
    config: Required<RateLimiterConfig>;
    state: RateLimiterState;
    nextRefill: number;
  } {
    this.refillTokens();

    return {
      config: { ...this.config },
      state: { ...this.state },
      nextRefill: this.calculateNextRefillTime()
    };
  }

  /**
   * リセット
   */
  reset(): void {
    this.state = {
      tokens: this.config.bucketSize,
      lastRefill: TimeUtils.nowUnixMs(),
      isBlocked: false
    };

    logger.info('Rate limiter reset', {
      tokens: this.state.tokens,
      bucketSize: this.config.bucketSize
    });
  }

  /**
   * リソース解放
   */
  destroy(): void {
    this.stopRefillTimer();
    logger.info('Rate limiter destroyed');
  }

  // ====================================
  // Private Implementation
  // ====================================

  private refillTokens(): void {
    const now = TimeUtils.nowUnixMs();
    const timePassed = now - this.state.lastRefill;

    if (timePassed <= 0) {
      return;
    }

    // Calculate tokens to add based on time passed
    const tokensToAdd = (timePassed / 1000) * this.config.tokensPerSecond;
    const newTokens = Math.min(
      this.state.tokens + tokensToAdd,
      this.config.bucketSize
    );

    if (newTokens > this.state.tokens) {
      this.state.tokens = newTokens;
      this.state.lastRefill = now;

      logger.debug('Tokens refilled', {
        tokensAdded: tokensToAdd,
        currentTokens: this.state.tokens,
        timePassed
      });
    }
  }

  private calculateRetryAfter(): number {
    // Time needed to get 1 token
    const timePerToken = 1000 / this.config.tokensPerSecond;
    const tokensNeeded = 1 - this.state.tokens;
    return Math.ceil(tokensNeeded * timePerToken);
  }

  private calculateRetryAfterForTokens(tokensRequired: number): number {
    // Time needed to get required tokens
    const timePerToken = 1000 / this.config.tokensPerSecond;
    const tokensNeeded = tokensRequired - this.state.tokens;
    return Math.ceil(tokensNeeded * timePerToken);
  }

  private calculateNextRefillTime(): number {
    const timePerToken = 1000 / this.config.tokensPerSecond;
    return this.state.lastRefill + timePerToken;
  }

  private startRefillTimer(): void {
    // Periodic refill to handle clock adjustments and ensure consistency
    const refillInterval = Math.max(100, 1000 / this.config.tokensPerSecond / 10);

    this.refillTimer = setInterval(() => {
      this.refillTokens();
    }, refillInterval);
  }

  private stopRefillTimer(): void {
    if (this.refillTimer !== undefined) {
      clearInterval(this.refillTimer);
      this.refillTimer = undefined;
    }
  }
}

// ====================================
// Rate Limiter Manager
// ====================================

export class RateLimiterManager {
  private limiters: Map<string, TatumRateLimiter> = new Map();

  /**
   * レート制限器の作成・取得
   */
  getLimiter(key: string, config: RateLimiterConfig): TatumRateLimiter {
    if (!this.limiters.has(key)) {
      const limiter = new TatumRateLimiter(config);
      this.limiters.set(key, limiter);

      logger.info(`Rate limiter created for key: ${key}`, {
        key,
        config
      });
    }

    return this.limiters.get(key)!;
  }

  /**
   * レート制限器の削除
   */
  removeLimiter(key: string): boolean {
    const limiter = this.limiters.get(key);
    if (limiter) {
      limiter.destroy();
      this.limiters.delete(key);

      logger.info(`Rate limiter removed for key: ${key}`, { key });
      return true;
    }
    return false;
  }

  /**
   * 全レート制限器の統計
   */
  getAllStats(): Record<string, ReturnType<TatumRateLimiter['getStats']>> {
    const stats: Record<string, ReturnType<TatumRateLimiter['getStats']>> = {};

    this.limiters.forEach((limiter, key) => {
      stats[key] = limiter.getStats();
    });

    return stats;
  }

  /**
   * 全レート制限器のリセット
   */
  resetAll(): void {
    this.limiters.forEach(limiter => {
      limiter.reset();
    });

    logger.info('All rate limiters reset');
  }

  /**
   * 全レート制限器の破棄
   */
  destroyAll(): void {
    this.limiters.forEach(limiter => {
      limiter.destroy();
    });
    this.limiters.clear();

    logger.info('All rate limiters destroyed');
  }
}

// ====================================
// Adaptive Rate Limiter
// ====================================

export class AdaptiveRateLimiter extends TatumRateLimiter {
  private successCount = 0;
  private errorCount = 0;
  private adaptationInterval = 60000; // 1 minute
  private lastAdaptation = TimeUtils.nowUnixMs();
  private minTokensPerSecond: number;
  private maxTokensPerSecond: number;

  constructor(
    config: RateLimiterConfig,
    minTokensPerSecond: number = 1,
    maxTokensPerSecond: number = 100
  ) {
    super(config);
    this.minTokensPerSecond = minTokensPerSecond;
    this.maxTokensPerSecond = maxTokensPerSecond;
  }

  /**
   * 成功通知
   */
  recordSuccess(): void {
    this.successCount++;
    this.adaptRateIfNeeded();
  }

  /**
   * エラー通知
   */
  recordError(): void {
    this.errorCount++;
    this.adaptRateIfNeeded();
  }

  /**
   * 統計リセット
   */
  resetStats(): void {
    this.successCount = 0;
    this.errorCount = 0;
    this.lastAdaptation = TimeUtils.nowUnixMs();
  }

  private adaptRateIfNeeded(): void {
    const now = TimeUtils.nowUnixMs();
    if (now - this.lastAdaptation < this.adaptationInterval) {
      return;
    }

    const totalRequests = this.successCount + this.errorCount;
    if (totalRequests === 0) {
      return;
    }

    const errorRate = this.errorCount / totalRequests;
    const currentRate = this.config.tokensPerSecond;

    let newRate = currentRate;

    if (errorRate > 0.1) {
      // High error rate - decrease rate
      newRate = Math.max(this.minTokensPerSecond, currentRate * 0.8);
      logger.info('Adaptive rate limiter: decreasing rate due to high error rate', {
        oldRate: currentRate,
        newRate,
        errorRate,
        totalRequests
      });
    } else if (errorRate < 0.05 && this.successCount > 10) {
      // Low error rate and good success count - increase rate
      newRate = Math.min(this.maxTokensPerSecond, currentRate * 1.2);
      logger.info('Adaptive rate limiter: increasing rate due to low error rate', {
        oldRate: currentRate,
        newRate,
        errorRate,
        totalRequests
      });
    }

    if (newRate !== currentRate) {
      this.updateConfig({ tokensPerSecond: newRate });
    }

    this.resetStats();
  }
}

// ====================================
// Singleton Export
// ====================================

export const rateLimiterManager = new RateLimiterManager();