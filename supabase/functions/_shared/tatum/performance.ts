/**
 * Tatum Performance Optimization Module - パフォーマンス最適化版
 *
 * コネクションプール、データ圧縮、キャッシング機能
 * 企業グレードのパフォーマンス最適化実装
 */

import { logger } from './logger.ts';
import { TimeUtils } from './utils.ts';

// ====================================
// Performance Configuration
// ====================================

export interface PerformanceConfig {
  enableConnectionPool: boolean;
  enableCompression: boolean;
  enableResponseCache: boolean;
  enableRequestBatching: boolean;
  connectionPoolSize: number;
  maxConcurrentRequests: number;
  cacheTTL: number; // milliseconds
  cacheMaxSize: number; // entries
  compressionThreshold: number; // bytes
  batchingDelay: number; // milliseconds
  keepAliveTimeout: number; // milliseconds
}

// ====================================
// Connection Pool Manager
// ====================================

interface PooledConnection {
  id: string;
  isActive: boolean;
  lastUsed: number;
  requestCount: number;
  created: number;
  abortController: AbortController;
}

export class TatumConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private config: PerformanceConfig;
  private activeRequests = 0;
  private poolCleanupInterval?: ReturnType<typeof setInterval>;

  constructor(config: PerformanceConfig) {
    this.config = config;

    if (config.enableConnectionPool) {
      this.initializePool();
      this.startCleanupTask();
    }

    logger.info('TatumConnectionPool initialized', {
      poolSize: config.connectionPoolSize,
      maxConcurrent: config.maxConcurrentRequests,
      enabled: config.enableConnectionPool
    });
  }

  /**
   * 接続の取得
   */
  async acquireConnection(): Promise<{
    id: string;
    signal: AbortSignal;
    release: () => void
  }> {
    if (!this.config.enableConnectionPool) {
      // コネクションプール無効時は新しい接続を作成
      const controller = new AbortController();
      return {
        id: crypto.randomUUID(),
        signal: controller.signal,
        release: () => controller.abort()
      };
    }

    // 並行リクエスト数制限
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      throw new Error('Maximum concurrent requests exceeded');
    }

    this.activeRequests++;

    // 利用可能な接続を検索
    let connection = this.findAvailableConnection();

    if (!connection) {
      // 新しい接続を作成
      connection = this.createConnection();
    }

    connection.isActive = true;
    connection.lastUsed = Date.now();
    connection.requestCount++;

    logger.debug('Connection acquired', {
      connectionId: connection.id,
      activeConnections: this.connections.size,
      activeRequests: this.activeRequests
    });

    return {
      id: connection.id,
      signal: connection.abortController.signal,
      release: () => this.releaseConnection(connection!.id)
    };
  }

  /**
   * 接続の解放
   */
  private releaseConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isActive = false;
      connection.lastUsed = Date.now();
    }

    this.activeRequests = Math.max(0, this.activeRequests - 1);

    logger.debug('Connection released', {
      connectionId,
      activeRequests: this.activeRequests
    });
  }

  /**
   * プール統計情報取得
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    activeRequests: number;
    totalRequests: number;
  } {
    const activeConnections = Array.from(this.connections.values())
      .filter(conn => conn.isActive).length;
    const totalRequests = Array.from(this.connections.values())
      .reduce((sum, conn) => sum + conn.requestCount, 0);

    return {
      totalConnections: this.connections.size,
      activeConnections,
      idleConnections: this.connections.size - activeConnections,
      activeRequests: this.activeRequests,
      totalRequests
    };
  }

  /**
   * プールの破棄
   */
  destroy(): void {
    // 全接続を中断
    for (const connection of this.connections.values()) {
      connection.abortController.abort();
    }

    this.connections.clear();
    this.activeRequests = 0;

    if (this.poolCleanupInterval) {
      clearInterval(this.poolCleanupInterval);
    }

    logger.info('Connection pool destroyed');
  }

  private initializePool(): void {
    // 初期接続プールの作成
    for (let i = 0; i < Math.min(this.config.connectionPoolSize, 5); i++) {
      this.createConnection();
    }
  }

  private createConnection(): PooledConnection {
    const connection: PooledConnection = {
      id: crypto.randomUUID(),
      isActive: false,
      lastUsed: Date.now(),
      requestCount: 0,
      created: Date.now(),
      abortController: new AbortController()
    };

    this.connections.set(connection.id, connection);

    logger.debug('New connection created', {
      connectionId: connection.id,
      poolSize: this.connections.size
    });

    return connection;
  }

  private findAvailableConnection(): PooledConnection | null {
    for (const connection of this.connections.values()) {
      if (!connection.isActive) {
        return connection;
      }
    }

    // プールサイズ内で新しい接続を作成可能か
    if (this.connections.size < this.config.connectionPoolSize) {
      return this.createConnection();
    }

    return null;
  }

  private startCleanupTask(): void {
    this.poolCleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000); // 30秒ごとにクリーンアップ
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = this.config.keepAliveTimeout;

    for (const [id, connection] of this.connections.entries()) {
      if (!connection.isActive &&
          (now - connection.lastUsed) > staleThreshold) {

        connection.abortController.abort();
        this.connections.delete(id);

        logger.debug('Stale connection removed', {
          connectionId: id,
          idleTime: now - connection.lastUsed
        });
      }
    }
  }
}

// ====================================
// Response Compression
// ====================================

export class TatumCompressionHandler {
  private config: PerformanceConfig;

  constructor(config: PerformanceConfig) {
    this.config = config;
  }

  /**
   * レスポンスの圧縮
   */
  async compressResponse(data: string): Promise<Uint8Array | string> {
    if (!this.config.enableCompression ||
        data.length < this.config.compressionThreshold) {
      return data;
    }

    try {
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(data);

      // Gzip圧縮
      const compressionStream = new CompressionStream('gzip');
      const writer = compressionStream.writable.getWriter();
      const reader = compressionStream.readable.getReader();

      writer.write(uint8Array);
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }

      // 圧縮結果の結合
      const compressedSize = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const compressed = new Uint8Array(compressedSize);
      let offset = 0;

      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }

      const compressionRatio = (data.length - compressed.length) / data.length * 100;

      logger.debug('Response compressed', {
        originalSize: data.length,
        compressedSize: compressed.length,
        compressionRatio: Math.round(compressionRatio * 100) / 100
      });

      return compressed;

    } catch (error) {
      logger.warn('Compression failed, returning original data', { error: error.message });
      return data;
    }
  }

  /**
   * レスポンスの展開
   */
  async decompressResponse(compressedData: Uint8Array): Promise<string> {
    if (!this.config.enableCompression) {
      const decoder = new TextDecoder();
      return decoder.decode(compressedData);
    }

    try {
      const decompressionStream = new DecompressionStream('gzip');
      const writer = decompressionStream.writable.getWriter();
      const reader = decompressionStream.readable.getReader();

      writer.write(compressedData);
      writer.close();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          chunks.push(value);
        }
      }

      const decompressedSize = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const decompressed = new Uint8Array(decompressedSize);
      let offset = 0;

      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }

      const decoder = new TextDecoder();
      return decoder.decode(decompressed);

    } catch (error) {
      logger.error('Decompression failed', error as Error);
      throw new Error('Failed to decompress response');
    }
  }
}

// ====================================
// Response Cache
// ====================================

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

export class TatumResponseCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private config: PerformanceConfig;
  private currentSize = 0;
  private cacheCleanupInterval?: ReturnType<typeof setInterval>;

  constructor(config: PerformanceConfig) {
    this.config = config;

    if (config.enableResponseCache) {
      this.startCleanupTask();
    }

    logger.info('TatumResponseCache initialized', {
      maxSize: config.cacheMaxSize,
      ttl: config.cacheTTL,
      enabled: config.enableResponseCache
    });
  }

  /**
   * キャッシュからデータ取得
   */
  get<T = unknown>(key: string): T | null {
    if (!this.config.enableResponseCache) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      this.currentSize--;
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = now;

    logger.debug('Cache hit', {
      key: this.hashKey(key),
      accessCount: entry.accessCount
    });

    return entry.data as T;
  }

  /**
   * キャッシュにデータ保存
   */
  set<T = unknown>(key: string, data: T): void {
    if (!this.config.enableResponseCache) {
      return;
    }

    // キャッシュサイズ制限チェック
    if (this.currentSize >= this.config.cacheMaxSize && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    const now = Date.now();
    const dataSize = this.estimateSize(data);

    const entry: CacheEntry = {
      data,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
      size: dataSize
    };

    if (!this.cache.has(key)) {
      this.currentSize++;
    }

    this.cache.set(key, entry);

    logger.debug('Cache set', {
      key: this.hashKey(key),
      size: dataSize,
      totalEntries: this.currentSize
    });
  }

  /**
   * キャッシュキーの生成
   */
  generateKey(method: string, endpoint: string, params?: Record<string, unknown>): string {
    const paramsStr = params ? JSON.stringify(params) : '';
    return `${method}:${endpoint}:${this.hashString(paramsStr)}`;
  }

  /**
   * キャッシュ統計情報取得
   */
  getStats(): {
    entries: number;
    maxEntries: number;
    hitRate: number;
    totalAccesses: number;
    memoryUsage: number;
  } {
    const totalAccesses = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);
    const memoryUsage = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.size, 0);

    return {
      entries: this.currentSize,
      maxEntries: this.config.cacheMaxSize,
      hitRate: totalAccesses > 0 ? (this.currentSize / totalAccesses) * 100 : 0,
      totalAccesses,
      memoryUsage
    };
  }

  /**
   * キャッシュクリア
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;

    logger.info('Response cache cleared');
  }

  /**
   * キャッシュ破棄
   */
  destroy(): void {
    this.clear();

    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }

    logger.info('Response cache destroyed');
  }

  private startCleanupTask(): void {
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, Math.min(this.config.cacheTTL / 4, 60000)); // TTLの1/4間隔またはmax 1分
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheTTL) {
        this.cache.delete(key);
        this.currentSize--;
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cache cleanup completed', {
        cleanedEntries: cleanedCount,
        remainingEntries: this.currentSize
      });
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.currentSize--;

      logger.debug('LRU eviction', {
        evictedKey: this.hashKey(oldestKey),
        age: Date.now() - oldestTime
      });
    }
  }

  private estimateSize(data: unknown): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate
    } catch {
      return 1000; // Default size
    }
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private hashKey(key: string): string {
    return key.length > 20 ? key.substring(0, 10) + '...' + key.substring(key.length - 10) : key;
  }
}

// ====================================
// Request Batching
// ====================================

interface BatchedRequest<T = unknown> {
  id: string;
  method: string;
  endpoint: string;
  params?: Record<string, unknown>;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class TatumRequestBatcher {
  private pendingRequests: BatchedRequest<unknown>[] = [];
  private batchTimeout?: ReturnType<typeof setTimeout>;
  private config: PerformanceConfig;

  constructor(config: PerformanceConfig) {
    this.config = config;

    logger.info('TatumRequestBatcher initialized', {
      batchingDelay: config.batchingDelay,
      enabled: config.enableRequestBatching
    });
  }

  /**
   * リクエストのバッチ処理
   */
  async batchRequest<T>(
    method: string,
    endpoint: string,
    params?: Record<string, unknown>,
    executor?: (requests: BatchedRequest<T>[]) => Promise<T[]>
  ): Promise<T> {
    if (!this.config.enableRequestBatching || !executor) {
      throw new Error('Request batching is disabled or no executor provided');
    }

    return new Promise((resolve, reject) => {
      const request: BatchedRequest<T> = {
        id: crypto.randomUUID(),
        method,
        endpoint,
        params,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.pendingRequests.push(request);

      // 最初のリクエストの場合、バッチ処理をスケジュール
      if (this.pendingRequests.length === 1) {
        this.scheduleBatchExecution(executor);
      }
    });
  }

  /**
   * 即座にバッチ実行
   */
  async flushBatch<T>(executor: (requests: BatchedRequest<T>[]) => Promise<T[]>): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }

    await this.executeBatch(executor);
  }

  private scheduleBatchExecution<T>(executor: (requests: BatchedRequest<T>[]) => Promise<T[]>): void {
    this.batchTimeout = setTimeout(async () => {
      await this.executeBatch(executor);
    }, this.config.batchingDelay);
  }

  private async executeBatch<T>(executor: (requests: BatchedRequest<T>[]) => Promise<T[]>): Promise<void> {
    if (this.pendingRequests.length === 0) {
      return;
    }

    const requestsToProcess = [...this.pendingRequests];
    this.pendingRequests = [];

    logger.debug('Executing batch', {
      requestCount: requestsToProcess.length
    });

    try {
      const results = await executor(requestsToProcess);

      // 結果をリクエストに対応付け
      requestsToProcess.forEach((request, index) => {
        if (index < results.length) {
          request.resolve(results[index]);
        } else {
          request.reject(new Error('Batch execution failed - insufficient results'));
        }
      });

    } catch (error) {
      // バッチ全体が失敗した場合、全リクエストを拒否
      requestsToProcess.forEach(request => {
        request.reject(error as Error);
      });
    }
  }
}

// ====================================
// Default Performance Configuration
// ====================================

export const defaultPerformanceConfig: PerformanceConfig = {
  enableConnectionPool: true,
  enableCompression: true,
  enableResponseCache: true,
  enableRequestBatching: false, // デフォルトでは無効
  connectionPoolSize: 10,
  maxConcurrentRequests: 50,
  cacheTTL: 300000, // 5分
  cacheMaxSize: 1000,
  compressionThreshold: 1024, // 1KB
  batchingDelay: 100, // 100ms
  keepAliveTimeout: 300000 // 5分
};

// ====================================
// Performance Manager
// ====================================

export class TatumPerformanceManager {
  private connectionPool: TatumConnectionPool;
  private compressionHandler: TatumCompressionHandler;
  private responseCache: TatumResponseCache;
  private requestBatcher: TatumRequestBatcher;
  private config: PerformanceConfig;

  constructor(config?: Partial<PerformanceConfig>) {
    this.config = {
      ...defaultPerformanceConfig,
      ...config
    };

    this.connectionPool = new TatumConnectionPool(this.config);
    this.compressionHandler = new TatumCompressionHandler(this.config);
    this.responseCache = new TatumResponseCache(this.config);
    this.requestBatcher = new TatumRequestBatcher(this.config);

    logger.info('TatumPerformanceManager initialized', {
      connectionPool: this.config.enableConnectionPool,
      compression: this.config.enableCompression,
      caching: this.config.enableResponseCache,
      batching: this.config.enableRequestBatching
    });
  }

  /**
   * パフォーマンス統計取得
   */
  getPerformanceStats(): {
    connectionPool: ReturnType<TatumConnectionPool['getStats']>;
    cache: ReturnType<TatumResponseCache['getStats']>;
    config: PerformanceConfig;
  } {
    return {
      connectionPool: this.connectionPool.getStats(),
      cache: this.responseCache.getStats(),
      config: this.config
    };
  }

  /**
   * 各コンポーネントのアクセサー
   */
  get pool() { return this.connectionPool; }
  get compression() { return this.compressionHandler; }
  get cache() { return this.responseCache; }
  get batcher() { return this.requestBatcher; }

  /**
   * リソース解放
   */
  destroy(): void {
    this.connectionPool.destroy();
    this.responseCache.destroy();

    logger.info('TatumPerformanceManager destroyed');
  }
}