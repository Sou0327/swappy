// Tatum Webhook Edge Function - 本番運用対応版 v2.1.0
// モジュール化アーキテクチャによる堅牢なWebhook処理システム

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
  DepositAddressRecord,
  DepositRecord,
  DepositTransactionRecord
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
 * Tatum Webhook処理メインクラス
 * 全モジュールを統合した本番対応Webhook処理システム
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
      message: 'Tatum Webhook Handler初期化完了',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: ENVIRONMENT,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * メインのリクエストハンドラー
   */
  async handleRequest(request: Request): Promise<Response> {
    const correlationId = generateCorrelationId();
    const context = createLogContext(correlationId);
    const requestInfo = extractRequestInfo(request);

    const startTime = Date.now();
    let response: Response | undefined;

    try {
      // GETリクエストエンドポイント
      if (request.method === 'GET') {
        const url = new URL(request.url);

        // ヘルスチェックエンドポイント
        if (url.pathname.endsWith('/health')) {
          return await this.healthChecker.handleHealthCheck();
        }

        // Dead Letter Queue手動リトライエンドポイント
        if (url.pathname.endsWith('/retry-dead-letter')) {
          return await this.handleDeadLetterRetry(context);
        }

        // Dead Letter Queue統計エンドポイント
        if (url.pathname.endsWith('/dead-letter-stats')) {
          return await this.handleDeadLetterStats(context);
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

      // Dead Letter Queueメンテナンスチェック
      // リクエスト処理時に確率的に自動処理をトリガー
      await this.deadLetterQueue.performMaintenanceCheck().catch(maintenanceError => {
        console.error('Dead Letter Queueメンテナンスエラー:', maintenanceError);
      });
    }
  }

  /**
   * Webhookイベント処理
   */
  private async processWebhook(request: Request, context: LogContext): Promise<Response> {
    let cachedBody: string = '';

    try {
      // リクエストボディの取得（キャッシュして保持）
      cachedBody = await request.text();
      if (!cachedBody) {
        throw new Error('空のリクエストボディ');
      }

      // 署名検証（設定されている場合）
      if (this.config.tatumWebhookSecret) {
        await this.verifyWebhookSignature(request, cachedBody);
      }

      // JSONパース
      let payload: TatumWebhookPayload;
      try {
        payload = JSON.parse(cachedBody);
      } catch (parseError) {
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
      // デッドレターキューに保存（キャッシュしたボディを使用）
      await this.deadLetterQueue.saveFailedEvent(
        context.correlationId,
        this.parseRequestPayloadFromText(cachedBody),
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
   * Webhook署名検証
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
   * Webhookイベント処理の実装
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
   * 入金トランザクション処理
   */
  private async processIncomingTransaction(payload: TatumWebhookPayload, context: LogContext): Promise<void> {
    this.logger.info('入金トランザクション処理開始', context, { payload });

    const normalized = this.normalizeTransactionEvent(payload);
    if (!normalized) {
      throw new Error('トランザクション正規化に失敗');
    }

    // ユーザー検索（destination_tag/memo対応）
    const depositAddress = await this.findDepositAddressWithMemo(normalized, context);

    if (!depositAddress) {
      this.logger.warn('未登録のアドレスへのトランザクション', context, {
        address: normalized.address,
        memo: normalized.memo,
        normalized
      });
      return;
    }

    // 既存トランザクションの確認
    const { data: existingDeposit, error: existingDepositError } = await this.supabase
      .from('deposits')
      .select('id, user_id, amount, currency, chain, network, status, confirmations_required, confirmations_observed, confirmed_at, transaction_hash')
      .eq('transaction_hash', normalized.transactionHash)
      .maybeSingle();

    if (existingDepositError) {
      throw new Error(`既存入金検索エラー: ${existingDepositError.message}`);
    }

    const depositRecord = existingDeposit as DepositRecord | null;

    if (depositRecord) {
      await this.handleExistingDeposit(depositRecord, normalized, depositAddress, context);
      return;
    }

    // 完全な入金処理フロー実行
    await this.executeCompleteDepositFlow(normalized, depositAddress, context);

    // 監査ログ
    await this.logger.auditLog({
      event: 'deposit_transaction_processed',
      ...context,
      userId: depositAddress.user_id,
      resource: `transaction:${normalized.transactionHash}`,
      details: { normalized, depositAddress },
    });

    this.metrics.increment('deposit.transaction_processed', {
      chain: normalized.chain || 'unknown',
      asset: normalized.asset || 'unknown',
      status: normalized.confirmations >= this.getRequiredConfirmations(normalized.chain) ? 'confirmed' : 'pending',
    });
  }

  /**
   * 出金トランザクション処理
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
   * 失敗トランザクション処理
   */
  private async processFailedTransaction(payload: TatumWebhookPayload, context: LogContext): Promise<void> {
    this.logger.warn('失敗トランザクション検出', context, { payload });

    this.metrics.increment('transaction.failed_detected');
  }

  /**
   * トランザクションイベント正規化
   */
  private normalizeTransactionEvent(payload: TatumWebhookPayload): NormalizedEvent | null {
    try {
      const data = payload.data as Record<string, unknown> | null;
      if (!data) return null;

      // unknown型の安全な型変換ヘルパー関数
      const safeString = (value: unknown): string | undefined => {
        return typeof value === 'string' ? value : undefined;
      };
      
      const safeNumber = (value: unknown): number | undefined => {
        return typeof value === 'number' ? value : undefined;
      };
      
      const safeStringWithFallback = (value: unknown, fallback: string = '0'): string => {
        return typeof value === 'string' ? value : fallback;
      };

      return {
        address: (safeString(data.address) || safeString(data.to)) as string,
        chain: safeString(data.chain) || this.inferChainFromPayload(payload),
        network: safeString(data.network),
        asset: safeString(data.asset) || safeString(data.currency),
        amount: parseFloat(safeStringWithFallback(data.amount, '0')),
        rawAmount: safeStringWithFallback(data.amount, '0'),
        transactionHash: (safeString(data.txId) || safeString(data.hash) || safeString(data.transactionHash)) as string,
        fromAddress: safeString(data.from),
        counterAddress: safeString(data.counterAddress),
        memo: safeString(data.memo) || safeString(data.tag),
        confirmations: parseInt(safeStringWithFallback(data.confirmations, '0')),
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
   * チェーン推定
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
   * 既存入金レコードの更新
   */
  private async handleExistingDeposit(
    existingDeposit: DepositRecord,
    normalized: NormalizedEvent,
    depositAddress: DepositAddressRecord,
    context: LogContext
  ): Promise<void> {
    this.logger.info('既存入金トランザクションの更新開始', context, {
      transactionHash: normalized.transactionHash,
      previousStatus: existingDeposit.status,
      newConfirmations: normalized.confirmations,
    });

    const requiredConfirmations = this.getRequiredConfirmations(normalized.chain);
    const observedConfirmations = Math.max(
      normalized.confirmations,
      existingDeposit.confirmations_observed ?? 0
    );

    const wasConfirmed = existingDeposit.status === 'confirmed';
    const nowConfirmed = observedConfirmations >= requiredConfirmations;

    let statusChangedToConfirmed = false;

    if (nowConfirmed && !wasConfirmed) {
      const confirmedAt = existingDeposit.confirmed_at ?? new Date().toISOString();
      const { data: updatedDeposit, error: depositUpdateError } = await this.supabase
        .from('deposits')
        .update({
          status: 'confirmed',
          confirmations_observed: observedConfirmations,
          confirmations_required: requiredConfirmations,
          confirmed_at: confirmedAt,
        })
        .eq('id', existingDeposit.id)
        .eq('status', 'pending')
        .select('id, status')
        .maybeSingle();

      if (depositUpdateError) {
        throw new Error(`deposits更新エラー: ${depositUpdateError.message}`);
      }

      statusChangedToConfirmed = Boolean(updatedDeposit);

      if (!statusChangedToConfirmed) {
        const { error: confirmationUpdateError } = await this.supabase
          .from('deposits')
          .update({
            confirmations_observed: observedConfirmations,
            confirmations_required: requiredConfirmations,
          })
          .eq('id', existingDeposit.id);

        if (confirmationUpdateError) {
          throw new Error(`deposits確認数更新エラー: ${confirmationUpdateError.message}`);
        }
      }
    } else {
      const { error: confirmationUpdateError } = await this.supabase
        .from('deposits')
        .update({
          confirmations_observed: observedConfirmations,
          confirmations_required: requiredConfirmations,
        })
        .eq('id', existingDeposit.id);

      if (confirmationUpdateError) {
        throw new Error(`deposits確認数更新エラー: ${confirmationUpdateError.message}`);
      }
    }

    await this.updateDepositTransactionRecord(
      existingDeposit,
      depositAddress,
      normalized,
      requiredConfirmations,
      observedConfirmations,
      nowConfirmed,
      context
    );

    if (statusChangedToConfirmed) {
      const currency = existingDeposit.currency || normalized.asset || depositAddress.asset;

      if (!currency) {
        throw new Error('入金通貨を特定できませんでした');
      }

      await this.creditUserAsset(existingDeposit.user_id, currency, normalized.amount, context);
      await this.createDepositNotification(
        existingDeposit.user_id,
        currency,
        normalized.amount,
        normalized.transactionHash,
        context
      );

      this.logger.info('既存入金が確認済みに更新され残高が反映されました', context, {
        userId: existingDeposit.user_id,
        currency,
        amount: normalized.amount,
        transactionHash: normalized.transactionHash,
      });
    } else {
      this.logger.debug('既存入金の確認数を更新', context, {
        userId: existingDeposit.user_id,
        confirmations: observedConfirmations,
        requiredConfirmations,
        transactionHash: normalized.transactionHash,
      });
    }
  }

  private async updateDepositTransactionRecord(
    deposit: DepositRecord,
    depositAddress: DepositAddressRecord,
    normalized: NormalizedEvent,
    requiredConfirmations: number,
    observedConfirmations: number,
    nowConfirmed: boolean,
    context: LogContext
  ): Promise<void> {
    const { data: transactionData, error: transactionFetchError } = await this.supabase
      .from('deposit_transactions')
      .select('id, status, confirmations, required_confirmations, confirmed_at, processed_at, block_number')
      .eq('transaction_hash', normalized.transactionHash)
      .eq('user_id', deposit.user_id)
      .order('detected_at', { ascending: true })
      .maybeSingle();

    if (transactionFetchError) {
      throw new Error(`deposit_transactions検索エラー: ${transactionFetchError.message}`);
    }

    const existingTransaction = transactionData as DepositTransactionRecord | null;

    const baseUpdate: Record<string, unknown> = {
      confirmations: observedConfirmations,
      required_confirmations: requiredConfirmations,
      block_number: normalized.blockNumber ?? existingTransaction?.block_number ?? null,
      raw_transaction: normalized.raw || {},
    };

    if (existingTransaction) {
      const updatePayload: Record<string, unknown> = { ...baseUpdate };

      if (nowConfirmed && existingTransaction.status !== 'confirmed') {
        const confirmedAt = new Date().toISOString();
        updatePayload.status = 'confirmed';
        updatePayload.confirmed_at = confirmedAt;
        updatePayload.processed_at = confirmedAt;
      }

      const { error: transactionUpdateError } = await this.supabase
        .from('deposit_transactions')
        .update(updatePayload)
        .eq('id', existingTransaction.id);

      if (transactionUpdateError) {
        throw new Error(`deposit_transactions更新エラー: ${transactionUpdateError.message}`);
      }

      return;
    }

    const confirmedAt = nowConfirmed ? new Date().toISOString() : null;
    const insertPayload = {
      user_id: deposit.user_id,
      deposit_address_id: depositAddress.id,
      chain: normalized.chain || deposit.chain || depositAddress.chain,
      network: normalized.network || deposit.network || depositAddress.network,
      asset: normalized.asset || depositAddress.asset || deposit.currency,
      transaction_hash: normalized.transactionHash,
      block_number: normalized.blockNumber ?? null,
      from_address: normalized.fromAddress || '',
      to_address: normalized.address,
      amount: normalized.amount.toString(),
      confirmations: observedConfirmations,
      required_confirmations: requiredConfirmations,
      status: nowConfirmed ? 'confirmed' : 'pending',
      destination_tag: normalized.memo || depositAddress.destination_tag || null,
      memo: normalized.memo || null,
      raw_transaction: normalized.raw || {},
      confirmed_at: confirmedAt,
      processed_at: confirmedAt,
    };

    const { error: transactionInsertError } = await this.supabase
      .from('deposit_transactions')
      .insert(insertPayload);

    if (transactionInsertError) {
      throw new Error(`deposit_transactions追加エラー: ${transactionInsertError.message}`);
    }

    this.logger.debug('deposit_transactionsに新規レコードを追加', context, {
      userId: deposit.user_id,
      transactionHash: normalized.transactionHash,
      status: insertPayload.status,
    });
  }

  /**
   * 完全な入金処理フロー（3段階処理）
   */
  private async executeCompleteDepositFlow(
    normalized: NormalizedEvent,
    depositAddress: DepositAddressRecord,
    context: LogContext
  ): Promise<void> {
    const requiredConfirmations = this.getRequiredConfirmations(normalized.chain);
    const isConfirmed = normalized.confirmations >= requiredConfirmations;
    const status = isConfirmed ? 'confirmed' : 'pending';
    const currency = normalized.asset || depositAddress.asset;

    try {
      // 1. deposit_transactions テーブルに詳細記録（deposit-detector実装パターン準拠）
      const { data: depositTransaction, error: depositTransactionError } = await this.supabase
        .from('deposit_transactions')
        .insert({
          user_id: depositAddress.user_id,
          deposit_address_id: depositAddress.id,
          chain: normalized.chain || depositAddress.chain,
          network: normalized.network || depositAddress.network,
          asset: currency,
          transaction_hash: normalized.transactionHash,
          block_number: normalized.blockNumber || null,
          from_address: normalized.fromAddress || '',
          to_address: normalized.address,
          amount: normalized.amount.toString(),
          confirmations: normalized.confirmations,
          required_confirmations: requiredConfirmations,
          status: status,
          destination_tag: normalized.memo || null,
          raw_transaction: normalized.raw || {},
          confirmed_at: isConfirmed ? new Date().toISOString() : null
        })
        .select()
        .single();

      if (depositTransactionError) {
        throw new Error(`deposit_transactions挿入エラー: ${depositTransactionError.message}`);
      }

      // 2. deposits テーブルに基本記録（レガシー互換性）
      const { error: depositError } = await this.supabase
        .from('deposits')
        .insert({
          user_id: depositAddress.user_id,
          amount: normalized.amount,
          currency: currency,
          chain: normalized.chain || depositAddress.chain,
          network: normalized.network || depositAddress.network,
          status: status,
          transaction_hash: normalized.transactionHash,
          wallet_address: normalized.address,
          confirmations_required: requiredConfirmations,
          confirmations_observed: normalized.confirmations,
        });

      if (depositError) {
        throw new Error(`deposits挿入エラー: ${depositError.message}`);
      }

      // 3. user_assets 残高更新（確認済みの場合のみ）
      if (isConfirmed) {
        await this.creditUserAsset(depositAddress.user_id, currency, normalized.amount, context);

        // 入金完了通知の作成
        await this.createDepositNotification(
          depositAddress.user_id,
          currency,
          normalized.amount,
          normalized.transactionHash,
          context
        );

        this.logger.info('入金処理完了（残高更新済み）', context, {
          userId: depositAddress.user_id,
          currency: currency,
          amount: normalized.amount,
          transactionHash: normalized.transactionHash
        });
      } else {
        this.logger.info('入金処理完了（確認待ち）', context, {
          userId: depositAddress.user_id,
          currency: currency,
          amount: normalized.amount,
          confirmations: `${normalized.confirmations}/${requiredConfirmations}`,
          transactionHash: normalized.transactionHash
        });
      }

    } catch (error) {
      // 入金処理失敗時のロールバック情報をログに記録
      this.logger.error('入金処理フローでエラー発生', context, error as Error, {
        userId: depositAddress.user_id,
        transactionHash: normalized.transactionHash,
        amount: normalized.amount,
        currency: currency,
        stage: '3段階処理中のいずれかで失敗'
      });

      // エラーを再スローしてデッドレターキューに送られるようにする
      throw error;
    }
  }

  private async creditUserAsset(
    userId: string,
    currency: string,
    amount: number,
    context: LogContext
  ): Promise<void> {
    const { error: assetError } = await this.supabase
      .rpc('upsert_user_asset', {
        p_user_id: userId,
        p_currency: currency,
        p_balance_change: amount,
        p_locked_change: 0,
      });

    if (!assetError) {
      this.logger.debug('user_assets残高更新RPC成功', context, {
        userId,
        currency,
        amount,
      });
      return;
    }

    const { data: currentAsset, error: selectError } = await this.supabase
      .from('user_assets')
      .select('balance, locked_balance')
      .eq('user_id', userId)
      .eq('currency', currency)
      .maybeSingle();

    if (selectError) {
      throw new Error(`既存残高取得エラー: ${selectError.message}`);
    }

    const currentBalance = currentAsset?.balance ? parseFloat(String(currentAsset.balance)) : 0;
    const currentLocked = currentAsset?.locked_balance ? parseFloat(String(currentAsset.locked_balance)) : 0;
    const newBalance = currentBalance + amount;

    const { error: manualUpsertError } = await this.supabase
      .from('user_assets')
      .upsert({
        user_id: userId,
        currency,
        balance: newBalance.toString(),
        locked_balance: currentLocked.toString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (manualUpsertError) {
      throw new Error(`user_assets手動残高更新エラー: ${manualUpsertError.message}`);
    }

    this.logger.warn('RPC失敗によりフォールバック処理実行', context, {
      userId,
      currency,
      amount,
      previousBalance: currentBalance,
    });
  }

  /**
   * 入金完了通知の作成
   */
  private async createDepositNotification(
    userId: string,
    currency: string,
    amount: number,
    transactionHash: string,
    context: LogContext
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title: '入金が完了しました',
          message: `${amount} ${currency}の入金が確認されました。残高に反映されています。`,
          type: 'deposit_completed',
          metadata: {
            currency: currency,
            amount: amount.toString(),
            transaction_hash: transactionHash,
            timestamp: new Date().toISOString()
          },
          read: false
        });

      if (error) {
        this.logger.warn('入金完了通知の作成に失敗', context, {
          userId,
          currency,
          amount,
          error: error.message
        });
      } else {
        this.logger.info('入金完了通知を作成', context, {
          userId,
          currency,
          amount
        });
      }
    } catch (error) {
      this.logger.warn('入金完了通知作成時の予期しないエラー', context, {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * destination_tag/memo対応の入金アドレス検索
   */
  private async findDepositAddressWithMemo(normalized: NormalizedEvent, context: LogContext): Promise<DepositAddressRecord | null> {
    try {
      const columns = 'id, user_id, address, asset, chain, network, destination_tag';

      if (normalized.memo) {
        const { data: exactMatches, error: exactError } = await this.supabase
          .from('deposit_addresses')
          .select(columns)
          .eq('address', normalized.address)
          .eq('active', true)
          .eq('destination_tag', normalized.memo);

        if (exactError) {
          throw new Error(`入金アドレス検索エラー: ${exactError.message}`);
        }

        if (exactMatches && exactMatches.length > 0) {
          return exactMatches[0] as DepositAddressRecord;
        }

        const { data: nullMatches, error: nullError } = await this.supabase
          .from('deposit_addresses')
          .select(columns)
          .eq('address', normalized.address)
          .eq('active', true)
          .is('destination_tag', null);

        if (nullError) {
          throw new Error(`入金アドレス検索エラー: ${nullError.message}`);
        }

        if (nullMatches && nullMatches.length > 0) {
          this.logger.warn('Destination Tag未設定のアドレスでmemo付きトランザクションを受信', context, {
            address: normalized.address,
            memo: normalized.memo,
            availableAddresses: nullMatches.length,
          });
          return nullMatches[0] as DepositAddressRecord;
        }

        return null;
      }

      const { data: addresses, error } = await this.supabase
        .from('deposit_addresses')
        .select(columns)
        .eq('address', normalized.address)
        .eq('active', true);

      if (error) {
        throw new Error(`入金アドレス検索エラー: ${error.message}`);
      }

      if (!addresses || addresses.length === 0) {
        return null;
      }

      if (addresses.length > 1) {
        this.logger.error('複数の入金アドレスが見つかりました', context, new Error('Address ambiguity'), {
          address: normalized.address,
          memo: normalized.memo,
          matchingAddresses: addresses.length,
        });
        return null;
      }

      return addresses[0] as DepositAddressRecord;

    } catch (error) {
      this.logger.error('入金アドレス検索中にエラー', context, error as Error, {
        address: normalized.address,
        memo: normalized.memo
      });
      return null;
    }
  }

  /**
   * 必要確認数取得
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
   * リクエストペイロードの安全な取得（非推奨：request.text()重複問題）
   * @deprecated 代わりにparseRequestPayloadFromTextを使用してください
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
   * テキストからペイロードの安全な取得（修正版）
   * リクエストボディの重複読み取り問題を解決
   */
  private parseRequestPayloadFromText(bodyText: string): Record<string, unknown> {
    try {
      if (!bodyText || bodyText.trim() === '') {
        return { error: 'Empty request body' };
      }
      return JSON.parse(bodyText);
    } catch (parseError) {
      return {
        error: 'Failed to parse request payload',
        originalBody: bodyText.substring(0, 1000), // デバッグ用に最初の1000文字を保存
        parseError: parseError instanceof Error ? parseError.message : 'Unknown JSON parse error'
      };
    }
  }

  /**
   * Dead Letter Queue手動リトライハンドラー
   */
  private async handleDeadLetterRetry(context: LogContext): Promise<Response> {
    try {
      this.logger.info('Dead Letter Queue手動リトライ開始', context);

      const result = await this.deadLetterQueue.manualRetryAll();

      this.metrics.increment('dead_letter_queue.manual_retry_triggered', {
        success: String(result.success),
        processed_count: String(result.processed),
        error_count: String(result.errors.length)
      });

      // 監査ログ
      await this.logger.auditLog({
        event: 'dead_letter_manual_retry',
        ...context,
        resource: 'dead_letter_queue',
        details: {
          processed: result.processed,
          errors: result.errors.length,
          success: result.success
        },
      });

      return new Response(JSON.stringify({
        success: result.success,
        processed: result.processed,
        errors: result.errors,
        correlationId: context.correlationId,
        message: result.success
          ? `${result.processed}件のイベントを再処理しました`
          : `再処理中にエラーが発生しました: ${result.errors.join(', ')}`
      }), {
        status: result.success ? 200 : 207, // 207 = Multi-Status
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error) {
      this.logger.error('Dead Letter Queue手動リトライエラー', context, error as Error);
      this.metrics.increment('dead_letter_queue.manual_retry_error');

      return new Response(JSON.stringify({
        error: 'Manual retry failed',
        message: error instanceof Error ? error.message : String(error),
        correlationId: context.correlationId,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Dead Letter Queue統計ハンドラー
   */
  private async handleDeadLetterStats(context: LogContext): Promise<Response> {
    try {
      const stats = await this.deadLetterQueue.getStats();

      this.metrics.increment('dead_letter_queue.stats_requested');

      return new Response(JSON.stringify({
        success: true,
        stats,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error) {
      this.logger.error('Dead Letter Queue統計取得エラー', context, error as Error);
      this.metrics.increment('dead_letter_queue.stats_error');

      return new Response(JSON.stringify({
        error: 'Failed to get Dead Letter Queue stats',
        message: error instanceof Error ? error.message : String(error),
        correlationId: context.correlationId,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * 予期しないエラーハンドリング
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
   * システム終了時のクリーンアップ
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
