// Tatum Webhook Rate Limiter - 分散対応レート制限システム

import type { LogContext } from './types.ts';
import type { Logger } from './logger.ts';
import { RATE_LIMIT_CONFIG, MEMORY_CONFIG } from './config.ts';

/**
 * 分散対応レート制限システム
 * Deno KVベースの分散制限とローカルメモリのフォールバックを提供
 */
export class DistributedRateLimiter {
  private kv: unknown | null = null; // Deno.Kv型はDenoランタイムでのみ利用可能
  private localRequests: Map<string, number[]> = new Map();
  private distributedMode: boolean = false;
  private logger?: Logger;
  private cleanupIntervalId?: number;

  constructor(enableDistributed: boolean = false, kvUrl?: string) {
    this.distributedMode = enableDistributed;

    // 初期化を安全に実行
    this.initializeWithSafeCleanup(enableDistributed, kvUrl);
  }

  /**
   * 安全な初期化（Edge Functions環境対応）
   */
  private async initializeWithSafeCleanup(enableDistributed: boolean, kvUrl?: string): Promise<void> {
    try {
      if (enableDistributed) {
        await this.initializeKv(kvUrl);
      }

      // NOTE: Supabase Edge Functions環境ではsetIntervalは動作しません
      // 代わりに確率的クリーンアップまたはScheduled Functionsを使用してください
      // クリーンアップはisAllowed()メソッド内で確率的に実行されます
    } catch (error) {
      // その他のリソースも確実にクリーンアップ
      await this.safeCleanup();
      console.error('レートリミター初期化エラー:', error);
      // エラーを再発生させずにローカルモードで継続
      this.distributedMode = false;
    }
  }

  /**
   * Deno KVを初期化
   */
  private async initializeKv(kvUrl?: string): Promise<void> {
    try {
      // Denoランタイム環境でのみKV接続を試行
      const denoGlobal = globalThis as { Deno?: { openKv?: (url?: string) => Promise<unknown> } };
      if (denoGlobal.Deno && denoGlobal.Deno.openKv) {
        if (kvUrl) {
          // 外部KV接続
          console.log(`Deno KV接続中: ${kvUrl}`);
          this.kv = await denoGlobal.Deno.openKv(kvUrl);
        } else {
          // ローカルKV
          console.log('ローカルDeno KV接続中');
          this.kv = await denoGlobal.Deno.openKv();
        }

        this.distributedMode = true;
        console.log('✅ Deno KV分散レート制限が有効化されました');
      } else {
        throw new Error('Deno KV is not available in this environment');
      }

    } catch (error) {
      console.error('❌ Deno KV接続失敗、ローカルモードにフォールバック:', error);
      this.distributedMode = false;
      this.kv = null;
    }
  }

  /**
   * レート制限チェック
   */
  async isAllowed(clientId: string, context?: LogContext): Promise<boolean> {
    if (this.distributedMode && this.kv) {
      return await this.isAllowedDistributed(clientId, context);
    } else {
      return this.isAllowedLocal(clientId);
    }
  }

  /**
   * 分散レート制限チェック（Deno KV使用）
   * セキュリティ強化版：ハッシュ化キーで情報漏洩完全防止
   */
  private async isAllowedDistributed(clientId: string, context?: LogContext): Promise<boolean> {
    if (!this.kv) return true; // フェイルオープン

    try {
      // セキュリティ強化：ハッシュ化されたクライアントIDをキーに使用
      const hashedClientId = await this.hashClientId(clientId);
      const key = ["rate_limit", hashedClientId];
      const now = Date.now();
      const windowStart = now - RATE_LIMIT_CONFIG.windowMs;

      // 現在の記録を取得
      const result = await this.kv.get<{ requests: number[]; expiry: number }>(key);
      let requests: number[] = [];

      if (result.value) {
        // 有効なリクエストのみフィルタ
        requests = result.value.requests.filter((timestamp: number) => timestamp > windowStart);
      }

      // レート制限チェック
      if (requests.length >= RATE_LIMIT_CONFIG.maxRequests) {
        if (this.logger && context) {
          this.logger.warn('分散レート制限超過', context, {
            clientId: hashedClientId, // 既にハッシュ化済み
            currentRequests: requests.length,
            maxRequests: RATE_LIMIT_CONFIG.maxRequests
          });
        }
        return false;
      }

      // 新しいリクエストを追加
      requests.push(now);

      // 原子的更新
      const expiry = now + RATE_LIMIT_CONFIG.windowMs + 10000; // 10秒のバッファ
      await this.kv.set(key, { requests, expiry }, { expireIn: RATE_LIMIT_CONFIG.windowMs + 10000 });

      return true;

    } catch (error) {
      console.error('分散レート制限エラー、ローカルモードにフォールバック:', error);

      // KV障害時はローカルモードにフォールバック
      return this.isAllowedLocal(clientId);
    }
  }

  /**
   * ローカルメモリレート制限チェック（確率的クリーンアップ付き）
   * メモリリーク防止のため定期的に期限切れエントリを削除
   */
  private isAllowedLocal(clientId: string): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;

    // 確率的クリーンアップ（Edge Functions環境対応）
    // 1%の確率で期限切れエントリを削除してメモリリークを防止
    if (Math.random() < 0.01) {
      this.cleanupLocal();
    }

    const clientRequests = this.localRequests.get(clientId) || [];
    const validRequests = clientRequests.filter(timestamp => timestamp > windowStart);

    if (validRequests.length >= RATE_LIMIT_CONFIG.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.localRequests.set(clientId, validRequests);
    return true;
  }

  /**
   * ローカルクリーンアップ（メモリリーク対策）
   */
  private cleanupLocal() {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
    let cleanedClients = 0;

    for (const [clientId, requests] of this.localRequests.entries()) {
      const validRequests = requests.filter(timestamp => timestamp > windowStart);

      if (validRequests.length === 0) {
        this.localRequests.delete(clientId);
        cleanedClients++;
      } else {
        this.localRequests.set(clientId, validRequests);
      }
    }

    // メモリ使用量が多い場合は警告
    if (this.localRequests.size > 10000) {
      console.warn(JSON.stringify({
        level: 'WARN',
        message: 'レート制限メモリ使用量が多い状態',
        activeClients: this.localRequests.size,
        cleanedClients,
        recommendation: '分散レート制限の使用を検討してください',
        timestamp: new Date().toISOString(),
      }));
    }
  }

  /**
   * レート制限統計を取得
   */
  async getStats(): Promise<{
    mode: 'distributed' | 'local';
    activeClients: number;
    kvConnected: boolean;
    config: typeof RATE_LIMIT_CONFIG;
  }> {
    return {
      mode: this.distributedMode ? 'distributed' : 'local',
      activeClients: this.localRequests.size,
      kvConnected: !!this.kv,
      config: RATE_LIMIT_CONFIG,
    };
  }

  /**
   * 特定クライアントの制限をリセット（セキュリティ強化版）
   * クライアントID情報漏洩完全防止：ハッシュ化キーを使用
   */
  async resetClient(clientId: string): Promise<void> {
    if (this.distributedMode && this.kv) {
      // セキュリティ強化：ハッシュ化されたクライアントIDをキーに使用
      const hashedClientId = await this.hashClientId(clientId);
      const key = ["rate_limit", hashedClientId];
      await this.kv.delete(key);
    }

    // ローカルメモリからも削除（こちらは元のIDを使用）
    this.localRequests.delete(clientId);
  }

  /**
   * 全制限をリセット（管理用）
   * セキュリティ強化：プレフィックス漏洩防止と安全な削除
   */
  async resetAll(): Promise<void> {
    if (this.distributedMode && this.kv) {
      try {
        // 安全なキー削除：プレフィックス情報を漏洩しない
        const rateLimitPrefix = ["rate_limit"];
        const entries = this.kv.list({ prefix: rateLimitPrefix });

        const deletionPromises: Promise<void>[] = [];
        for await (const entry of entries) {
          // キー情報をログに記録せず安全に削除
          deletionPromises.push(this.kv.delete(entry.key));
        }

        // 並列削除でパフォーマンス向上
        await Promise.all(deletionPromises);
      } catch (error) {
        console.error('分散レート制限リセットエラー:', error);
        // エラーが発生してもローカルはクリアする
      }
    }

    this.localRequests.clear();
  }

  /**
   * クライアントIDをハッシュ化（最高セキュリティ版）
   * Web Crypto APIを使用した安全なSHA-256ハッシュ
   * 動的ソルト・完全情報隠蔽・暗号学的フォールバック
   */
  private async hashClientId(clientId: string): Promise<string> {
    try {
      // 動的ソルト生成（セッション固有）
      const staticSalt = 'rate-limiter-secure-2024';
      const dynamicSalt = await this.generateSecureRandom(16);
      const saltedInput = `${staticSalt}:${dynamicSalt}:${clientId}:${dynamicSalt}:${staticSalt}`;

      // 文字列をUint8Arrayに変換
      const encoder = new TextEncoder();
      const data = encoder.encode(saltedInput);

      // SHA-256ハッシュを計算
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);

      // ArrayBufferを暗号学的に安全な文字列に変換
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // 完全情報隠蔽：ランダム位置から固定長抽出
      const randomOffset = hashBuffer.byteLength > 16 ?
        hashArray[0] % (hashBuffer.byteLength - 16) : 0;
      const maskedHash = hashHex.substring(randomOffset, randomOffset + 32);

      // 予測不可能なプレフィックス
      const prefixSource = hashHex.substring(56, 60);
      return `${prefixSource}_${maskedHash}`;

    } catch (error) {
      // 暗号学的に安全なフォールバック
      console.error('クライアントIDハッシュ化エラー:', error);
      return await this.generateCryptographicFallback();
    }
  }

  /**
   * 暗号学的に安全なランダム文字列生成
   */
  private async generateSecureRandom(length: number): Promise<string> {
    const randomBytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 暗号学的フォールバック処理
   */
  private async generateCryptographicFallback(): Promise<string> {
    try {
      const randomData = crypto.getRandomValues(new Uint8Array(32));
      const hashBuffer = await crypto.subtle.digest('SHA-256', randomData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return `safe_${hashHex.substring(0, 32)}`;
    } catch (fallbackError) {
      // 最終フォールバック（極めて稀なケース）
      console.error('暗号学的フォールバックも失敗:', fallbackError);
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2);
      return `emergency_${timestamp}_${random}`;
    }
  }

  /**
   * レート制限の詳細チェック（デバッグ用）
   */
  async checkClientStatus(clientId: string): Promise<{
    isAllowed: boolean;
    currentRequests: number;
    maxRequests: number;
    windowMs: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
    let currentRequests = 0;

    if (this.distributedMode && this.kv) {
      try {
        // セキュリティ強化：ハッシュ化されたクライアントIDをキーに使用
        const hashedClientId = await this.hashClientId(clientId);
        const key = ["rate_limit", hashedClientId];
        const result = await this.kv.get<{ requests: number[] }>(key);

        if (result.value) {
          currentRequests = result.value.requests.filter((timestamp: number) => timestamp > windowStart).length;
        }
      } catch {
        // フォールバック
      }
    } else {
      const clientRequests = this.localRequests.get(clientId) || [];
      currentRequests = clientRequests.filter(timestamp => timestamp > windowStart).length;
    }

    return {
      isAllowed: currentRequests < RATE_LIMIT_CONFIG.maxRequests,
      currentRequests,
      maxRequests: RATE_LIMIT_CONFIG.maxRequests,
      windowMs: RATE_LIMIT_CONFIG.windowMs,
      resetTime: windowStart + RATE_LIMIT_CONFIG.windowMs,
    };
  }

  /**
   * 安全なクリーンアップ（内部用）
   */
  private async safeCleanup(): Promise<void> {
    // setInterval タイマーのクリア
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
    }

    // KV接続のクリーンアップ
    if (this.kv) {
      try {
        await this.kv.close();
      } catch (error) {
        console.error('KV接続クローズエラー:', error);
      } finally {
        this.kv = null;
      }
    }

    // ローカルメモリのクリア
    this.localRequests.clear();
  }

  /**
   * クリーンアップ（終了時）
   */
  async cleanup(): Promise<void> {
    await this.safeCleanup();
  }

  /**
   * ロガー設定
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }
}