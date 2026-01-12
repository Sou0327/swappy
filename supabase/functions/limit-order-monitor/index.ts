/**
 * Limit Order Monitor Edge Function
 *
 * 指値注文を監視し、条件が満たされた際に自動的に約定を実行します。
 *
 * 主な機能：
 * - アクティブな指値注文の取得
 * - Binance価格監視（WebSocket優先、RESTフォールバック）
 * - 約定条件の判定
 * - execute_market_order RPCによる約定実行
 * - ユーザーへの通知作成
 *
 * 実行頻度: 10秒ごと（GitHub Actions経由）
 */

// @ts-expect-error: Deno deploy
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error: Deno deploy
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

/**
 * 注文データ型
 */
interface LimitOrder {
  id: string;
  user_id: string;
  market: string;
  side: 'buy' | 'sell';
  price: number;
  qty: number;
  filled_qty: number;
  status: string;
  created_at: string;
}

/**
 * 市場別の注文グループ
 */
interface MarketOrders {
  market: string;
  binanceSymbol: string;
  orders: LimitOrder[];
}

/**
 * 約定結果
 */
interface ExecutionResult {
  orderId: string;
  success: boolean;
  error?: string;
}

/**
 * 市場名をBinanceシンボルに変換
 */
function marketToBinanceSymbol(market: string): string {
  // ハイフンとスラッシュを削除してBinanceのシンボル形式に変換
  // 例: BTC-USDT → BTCUSDT, BTC/USDT → BTCUSDT
  return market.replace(/[-/]/g, '').toUpperCase();
}

/**
 * アクティブな指値注文を取得
 */
// @ts-expect-error Supabase client type from CDN import
async function fetchActiveLimitOrders(
  supabase: ReturnType<typeof createClient>
): Promise<LimitOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('type', 'limit')
    .in('status', ['open', 'partially_filled'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Monitor] Failed to fetch active limit orders:', error);
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }

  return data || [];
}

/**
 * 注文を市場ごとにグループ化
 */
function groupOrdersByMarket(orders: LimitOrder[]): MarketOrders[] {
  const marketMap = new Map<string, LimitOrder[]>();

  for (const order of orders) {
    const existing = marketMap.get(order.market) || [];
    existing.push(order);
    marketMap.set(order.market, existing);
  }

  return Array.from(marketMap.entries()).map(([market, orders]) => ({
    market,
    binanceSymbol: marketToBinanceSymbol(market),
    orders,
  }));
}

/**
 * REST APIで価格を取得（フォールバック）
 */
async function fetchPriceViaRest(symbol: string): Promise<number> {
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(
    symbol
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Swappy-Limit-Order-Monitor/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    const price = parseFloat(data.price);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Invalid price: ${data.price}`);
    }

    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * WebSocketでリアルタイム監視（長時間接続）
 *
 * Edge Function用のリアルタイム監視。接続を維持し、価格更新イベントごとに約定チェックを実行。
 *
 * @param supabase - Supabaseクライアント
 * @param marketData - 監視する市場と注文データ
 * @param durationMs - 監視継続時間（ミリ秒）
 * @param executedOrderIds - 処理済み注文IDセット（重複実行防止）
 * @returns 約定結果の配列
 */
// @ts-expect-error Supabase client type from CDN import
async function monitorMarketWithWebSocket(
  supabase: ReturnType<typeof createClient>,
  marketData: MarketOrders,
  durationMs: number,
  executedOrderIds: Set<string>,
  processingOrderIds: Set<string>
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const wsUrl = `wss://stream.binance.com:9443/ws/${marketData.binanceSymbol.toLowerCase()}@miniTicker`;

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    const endTime = Date.now() + durationMs;
    let connectionEstablished = false;
    let priceUpdateReceived = false; // 価格更新受信フラグ
    let settled = false; // 二重処理防止フラグ

    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          console.warn(`[WS Realtime] Cleanup error for ${marketData.market}:`, e);
        }
        ws = null;
      }
    };

    // タイムアウト設定
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;

      cleanup();

      if (!connectionEstablished || !priceUpdateReceived) {
        // 接続未確立 OR 価格更新未受信 = 完全な失敗
        console.error(
          `[WS Realtime] ❌ Monitoring failed for ${marketData.market}: connection=${connectionEstablished}, priceUpdate=${priceUpdateReceived}`
        );
        reject(new Error(`WebSocket monitoring failed for ${marketData.market} (no price updates received)`));
      } else {
        // 価格更新受信済み = 正常な監視完了
        console.log(
          `[WS Realtime] Monitoring duration completed for ${marketData.market} (${durationMs}ms, ${results.length} executions)`
        );
        resolve(results);
      }
    }, durationMs);

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        connectionEstablished = true;
        console.log(`[WS Realtime] ✅ Connected to ${marketData.market} for ${durationMs}ms monitoring`);
      };

      ws.onmessage = async (event: MessageEvent) => {
        // 監視期間終了チェック
        if (Date.now() >= endTime) {
          cleanup();
          return;
        }

        try {
          const data = JSON.parse(event.data as string);

          if (data.e === '24hrMiniTicker' && data.c) {
            const currentPrice = parseFloat(data.c);

            if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
              console.warn(`[WS Realtime] Invalid price for ${marketData.market}: ${data.c}`);
              return;
            }

            // 有効な価格更新を受信したことを記録
            priceUpdateReceived = true;

            console.log(
              `[WS Realtime] 📊 Price update for ${marketData.market}: ${currentPrice}`
            );

            // 各注文を即座にチェック
            for (const order of marketData.orders) {
              // 処理中または処理済みの注文はスキップ（Race Condition対策）
              if (processingOrderIds.has(order.id) || executedOrderIds.has(order.id)) {
                continue;
              }

              if (shouldExecuteOrder(order, currentPrice)) {
                console.log(
                  `[WS Realtime] 🎯 Order ${order.id} triggered: ${order.side} @ ${order.price}, current: ${currentPrice}`
                );

                // 即座にロック（await中の二重実行を防止）
                processingOrderIds.add(order.id);

                try {
                  const result = await executeOrder(supabase, order, currentPrice);
                  results.push(result);

                  // 成功時のみ処理済みとしてマーク
                  if (result.success) {
                    executedOrderIds.add(order.id);
                  }

                  // エラー通知
                  if (!result.success && result.error) {
                    await createErrorNotification(supabase, order, result.error);
                  }
                } finally {
                  // 処理完了後、処理中フラグを削除（成功/失敗問わず）
                  processingOrderIds.delete(order.id);
                }
              }
            }
          }
        } catch (error) {
          console.error(
            `[WS Realtime] Error processing message for ${marketData.market}:`,
            error
          );
        }
      };

      ws.onerror = (error: Event) => {
        if (settled) return;
        settled = true;

        console.error(`[WS Realtime] ❌ WebSocket error for ${marketData.market}:`, error);
        clearTimeout(timeoutId);
        cleanup();

        if (!connectionEstablished || !priceUpdateReceived) {
          // 接続未確立 OR 価格更新未受信 = 完全な失敗
          reject(new Error(`WebSocket error for ${marketData.market} (connection=${connectionEstablished}, priceUpdate=${priceUpdateReceived})`));
        } else {
          // 価格更新受信済み = 部分的成功（取得済みの結果を返す）
          console.log(
            `[WS Realtime] ⚠️ Error after receiving price updates, returning ${results.length} results`
          );
          resolve(results);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (settled) return;
        settled = true;

        clearTimeout(timeoutId);
        cleanup();

        if (!connectionEstablished || !priceUpdateReceived) {
          // 接続未確立 OR 価格更新未受信 = 完全な失敗
          console.error(
            `[WS Realtime] ❌ Connection closed prematurely for ${marketData.market}: code=${event.code}, reason=${event.reason}, connection=${connectionEstablished}, priceUpdate=${priceUpdateReceived}`
          );
          reject(new Error(`WebSocket closed prematurely for ${marketData.market} (no price updates received)`));
        } else {
          // 価格更新受信済み = 正常な監視完了
          console.log(
            `[WS Realtime] Connection closed for ${marketData.market}: ${event.code} ${event.reason}, ${results.length} executions`
          );
          resolve(results);
        }
      };
    } catch (error) {
      if (settled) return;
      settled = true;

      console.error(`[WS Realtime] ❌ Failed to create WebSocket for ${marketData.market}:`, error);
      clearTimeout(timeoutId);
      cleanup();
      reject(error instanceof Error ? error : new Error(`WebSocket creation failed for ${marketData.market}`));
    }
  });
}

/**
 * RESTポーリングでリアルタイム監視（フォールバック）
 *
 * WebSocket接続が失敗した場合のフォールバック。
 * 1秒ごとにREST APIで価格を取得し、約定チェックを実行。
 *
 * @param supabase - Supabaseクライアント
 * @param marketData - 監視する市場と注文データ
 * @param durationMs - 監視継続時間（ミリ秒）
 * @param executedOrderIds - 処理済み注文IDセット（重複実行防止）
 * @returns 約定結果の配列
 */
// @ts-expect-error Supabase client type from CDN import
async function monitorMarketWithRestPolling(
  supabase: ReturnType<typeof createClient>,
  marketData: MarketOrders,
  durationMs: number,
  executedOrderIds: Set<string>,
  processingOrderIds: Set<string>
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  const endTime = Date.now() + durationMs;
  const pollingIntervalMs = 1000; // 1秒ごとにポーリング

  console.log(
    `[REST Polling] ⚠️ Starting REST polling for ${marketData.market} (${durationMs}ms, ${pollingIntervalMs}ms interval)`
  );

  while (Date.now() < endTime) {
    try {
      const currentPrice = await fetchPriceViaRest(marketData.binanceSymbol);

      console.log(
        `[REST Polling] 📊 Price update for ${marketData.market}: ${currentPrice}`
      );

      // 各注文をチェック
      for (const order of marketData.orders) {
        // 処理中または処理済みの注文はスキップ（Race Condition対策）
        if (processingOrderIds.has(order.id) || executedOrderIds.has(order.id)) {
          continue;
        }

        if (shouldExecuteOrder(order, currentPrice)) {
          console.log(
            `[REST Polling] 🎯 Order ${order.id} triggered: ${order.side} @ ${order.price}, current: ${currentPrice}`
          );

          // 即座にロック（await中の二重実行を防止）
          processingOrderIds.add(order.id);

          try {
            const result = await executeOrder(supabase, order, currentPrice);
            results.push(result);

            // 成功時のみ処理済みとしてマーク
            if (result.success) {
              executedOrderIds.add(order.id);
            }

            // エラー通知
            if (!result.success && result.error) {
              await createErrorNotification(supabase, order, result.error);
            }
          } finally {
            // 処理完了後、処理中フラグを削除（成功/失敗問わず）
            processingOrderIds.delete(order.id);
          }
        }
      }
    } catch (error) {
      console.error(
        `[REST Polling] Error fetching price for ${marketData.market}:`,
        error
      );
    }

    // 次のポーリングまで待機（残り時間がポーリング間隔より短い場合は終了）
    const remainingTime = endTime - Date.now();
    if (remainingTime > pollingIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
    } else if (remainingTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingTime));
    }
  }

  console.log(
    `[REST Polling] ✅ Polling completed for ${marketData.market}: ${results.length} executions`
  );

  return results;
}

/**
 * 注文が約定条件を満たすか判定
 */
function shouldExecuteOrder(order: LimitOrder, currentPrice: number): boolean {
  if (order.side === 'buy') {
    // 買い注文: 現在価格が指値以下
    return currentPrice <= order.price;
  } else {
    // 売り注文: 現在価格が指値以上
    return currentPrice >= order.price;
  }
}

/**
 * 注文を約定実行
 */
// @ts-expect-error Supabase client type from CDN import
async function executeOrder(
  supabase: ReturnType<typeof createClient>,
  order: LimitOrder,
  currentPrice: number
): Promise<ExecutionResult> {
  try {
    console.log(
      `[Monitor] Executing order ${order.id}: ${order.side} ${order.qty} ${order.market} @ ${currentPrice}`
    );

    // execute_market_order RPCを呼び出し
    const { data, error } = await supabase.rpc('execute_market_order', {
      p_user_id: order.user_id,
      p_market: order.market,
      p_side: order.side,
      p_qty: order.qty - (order.filled_qty || 0), // 残数量
      p_price: currentPrice,
      p_limit_order_id: order.id, // 指値注文ID（ロック解除のため）
    });

    if (error) {
      console.error(`[Monitor] Execution failed for order ${order.id}:`, error);
      return {
        orderId: order.id,
        success: false,
        error: error.message,
      };
    }

    console.log(`[Monitor] Successfully executed order ${order.id}, result:`, data);

    // 成功通知を作成
    await createSuccessNotification(supabase, order, currentPrice);

    return {
      orderId: order.id,
      success: true,
    };
  } catch (error) {
    console.error(`[Monitor] Unexpected error executing order ${order.id}:`, error);
    return {
      orderId: order.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 成功通知を作成（テンプレートシステム使用）
 */
// @ts-expect-error Supabase client type from CDN import
async function createSuccessNotification(
  supabase: ReturnType<typeof createClient>,
  order: LimitOrder,
  executedPrice: number
): Promise<void> {
  try {
    // テンプレートを取得
    const { data: template, error: templateError } = await supabase
      .from('notification_templates')
      .select('title_template, message_template')
      .eq('template_key', 'limit_order_executed')
      .single();

    if (templateError || !template) {
      console.error('[Monitor] Failed to fetch template:', templateError);
      // フォールバック：テンプレート取得失敗時はハードコード
      const sideText = order.side === 'buy' ? '買い' : '売り';
      await supabase.from('notifications').insert({
        user_id: order.user_id,
        title: '指値注文が約定しました',
        message: `市場: ${order.market}\n種類: ${sideText}注文\n数量: ${order.qty}\n約定価格: ${executedPrice.toLocaleString('ja-JP')}\n指値価格: ${order.price.toLocaleString('ja-JP')}\n注文ID: ${order.id}`,
        type: 'success',
        read: false,
      });
      return;
    }

    // サイドの日本語表記
    const sideText = order.side === 'buy' ? '買い' : '売り';

    // テンプレート変数
    const variables = {
      market: order.market,
      side: sideText,
      quantity: order.qty.toString(),
      executed_price: executedPrice.toLocaleString('ja-JP'),
      limit_price: order.price.toLocaleString('ja-JP'),
      order_id: order.id,
    };

    // replace_template_variables関数を使用してメッセージを処理
    const { data: processedMessage, error: messageError } = await supabase.rpc(
      'replace_template_variables',
      {
        template_text: template.message_template,
        variables: variables,
      }
    );

    let finalMessage: string;
    if (messageError) {
      console.error('[Monitor] Failed to process message template, using fallback:', messageError);
      // フォールバック：変数を手動で展開したメッセージ
      finalMessage = `市場: ${variables.market}
種類: ${variables.side}注文
数量: ${variables.quantity}
約定価格: ${variables.executed_price}
指値価格: ${variables.limit_price}
注文ID: ${variables.order_id}`;
    } else {
      finalMessage = processedMessage || '';
    }

    // タイトルも処理
    const { data: processedTitle, error: titleError } = await supabase.rpc(
      'replace_template_variables',
      {
        template_text: template.title_template,
        variables: variables,
      }
    );

    let finalTitle: string;
    if (titleError) {
      console.error('[Monitor] Failed to process title template, using fallback:', titleError);
      // フォールバック：ハードコードされたタイトル
      finalTitle = '指値注文が約定しました';
    } else {
      finalTitle = processedTitle || template.title_template;
    }

    // 通知を作成（必ず実行される）
    await supabase.from('notifications').insert({
      user_id: order.user_id,
      title: finalTitle,
      message: finalMessage,
      type: 'success',
      read: false,
    });

    console.log(
      `[Monitor] Created success notification for order ${order.id} using template system`
    );
  } catch (error) {
    console.error('[Monitor] Failed to create notification:', error);
  }
}

/**
 * エラー通知を作成
 */
// @ts-expect-error Supabase client type from CDN import
async function createErrorNotification(
  supabase: ReturnType<typeof createClient>,
  order: LimitOrder,
  errorMessage: string
): Promise<void> {
  try {
    const title = '指値注文の約定に失敗しました';
    const message = [
      `市場: ${order.market}`,
      `注文ID: ${order.id}`,
      `エラー: ${errorMessage}`,
      '',
      '注文は引き続き監視されます。問題が解決されない場合は、サポートにお問い合わせください。',
    ].join('\n');

    await supabase.from('notifications').insert({
      user_id: order.user_id,
      title,
      message,
      type: 'error',
      read: false,
    });

    console.log(`[Monitor] Created error notification for order ${order.id}`);
  } catch (error) {
    console.error('[Monitor] Failed to create error notification:', error);
  }
}

/**
 * 市場をリアルタイム監視（ハイブリッド方式）
 *
 * WebSocket優先でリアルタイム監視を実行し、失敗時はRESTポーリングにフォールバック。
 * Edge Function制限を考慮し、20秒間の監視を実行。
 *
 * @param supabase - Supabaseクライアント
 * @param marketData - 監視する市場と注文データ
 * @param durationMs - 監視継続時間（ミリ秒、デフォルト: 20000ms）
 * @param executedOrderIds - 処理済み注文IDセット（重複実行防止）
 * @returns 約定結果の配列
 */
// @ts-expect-error Supabase client type from CDN import
async function monitorMarketRealtime(
  supabase: ReturnType<typeof createClient>,
  marketData: MarketOrders,
  durationMs: number = 20000,
  executedOrderIds: Set<string>,
  processingOrderIds: Set<string>
): Promise<ExecutionResult[]> {
  console.log(
    `[Monitor] 🚀 Starting realtime monitoring for ${marketData.market}: ${marketData.orders.length} orders, ${durationMs}ms duration`
  );

  const preferWebSocket = Deno.env.get('PREFER_WEBSOCKET') !== 'false';

  // WebSocket優先
  if (preferWebSocket) {
    try {
      const results = await monitorMarketWithWebSocket(
        supabase,
        marketData,
        durationMs,
        executedOrderIds,
        processingOrderIds
      );
      console.log(
        `[Monitor] ✅ WebSocket monitoring completed for ${marketData.market}: ${results.length} executions`
      );
      return results;
    } catch (error) {
      console.warn(
        `[Monitor] ⚠️ WebSocket monitoring failed for ${marketData.market}, falling back to REST polling:`,
        error instanceof Error ? error.message : error
      );
      // RESTポーリングにフォールバック
      return await monitorMarketWithRestPolling(
        supabase,
        marketData,
        durationMs,
        executedOrderIds,
        processingOrderIds
      );
    }
  } else {
    // WebSocket無効の場合は直接RESTポーリング
    console.log(
      `[Monitor] 📊 WebSocket disabled, using REST polling for ${marketData.market}`
    );
    return await monitorMarketWithRestPolling(
      supabase,
      marketData,
      durationMs,
      executedOrderIds,
      processingOrderIds
    );
  }
}

/**
 * メインハンドラー
 */
serve(async (req: Request) => {
  const startTime = Date.now();
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // OPTIONSリクエスト（CORS preflight）
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(origin);
  }

  try {
    console.log('[Monitor] Starting limit order monitor cycle...');

    // Supabaseクライアントを初期化
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // アクティブな指値注文を取得
    const orders = await fetchActiveLimitOrders(supabase);

    console.log(`[Monitor] Found ${orders.length} active limit orders`);

    // 注文がない場合は早期リターン
    if (orders.length === 0) {
      const duration = Date.now() - startTime;
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active limit orders to monitor',
          duration,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // 市場ごとにグループ化
    const marketGroups = groupOrdersByMarket(orders);

    console.log(
      `[Monitor] Monitoring ${marketGroups.length} markets: ${marketGroups
        .map((m) => m.market)
        .join(', ')}`
    );

    // 重複実行防止用のSet（このEdge Function呼び出し内で全市場で共有）
    const executedOrderIds = new Set<string>();
    // 処理中の注文ID Set（Race Condition対策：awaitの最中に同じ注文が再処理されるのを防ぐ）
    const processingOrderIds = new Set<string>();

    // 並列で各市場をリアルタイム監視（Promise.allSettledで失敗を許容）
    // 各市場で20秒間WebSocket接続を維持し、価格更新イベントごとに約定チェック
    const monitorResults = await Promise.allSettled(
      marketGroups.map((marketData) =>
        monitorMarketRealtime(supabase, marketData, 20000, executedOrderIds, processingOrderIds)
      )
    );

    // 結果を集計
    const allResults: ExecutionResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const result of monitorResults) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
        successCount += result.value.filter((r) => r.success).length;
        failureCount += result.value.filter((r) => !r.success).length;
      } else {
        console.error('[Monitor] Market monitoring failed:', result.reason);
        failureCount++;
      }
    }

    const duration = Date.now() - startTime;

    console.log(
      `[Monitor] Cycle completed in ${duration}ms: ${successCount} executed, ${failureCount} failed`
    );

    return new Response(
      JSON.stringify({
        success: true,
        ordersChecked: orders.length,
        marketsMonitored: marketGroups.length,
        executed: successCount,
        failed: failureCount,
        duration,
        timestamp: new Date().toISOString(),
        results: allResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[Monitor] Fatal error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
