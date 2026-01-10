/**
 * 指値注文約定通知作成ヘルパー
 *
 * 指値注文が約定した際に、ユーザーへの通知を作成します。
 */

import { createClient } from '@supabase/supabase-js';

/**
 * 指値注文情報
 */
export interface LimitOrderExecutionInfo {
  userId: string;
  orderId: string;
  market: string;
  side: 'buy' | 'sell';
  price: number;
  qty: number;
  executedAt?: Date;
}

/**
 * 通知作成結果
 */
export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
}

/**
 * 指値注文約定通知を作成（テンプレートシステム使用）
 *
 * @param supabase - Supabaseクライアント
 * @param info - 注文情報
 * @param executedPrice - 約定価格（指値価格と異なる場合に指定）
 * @returns 通知作成結果
 *
 * @example
 * const result = await createLimitOrderExecutedNotification(supabase, {
 *   userId: "123e4567-e89b-12d3-a456-426614174000",
 *   orderId: "order-123",
 *   market: "BTC/USDT",
 *   side: "buy",
 *   price: 43250.50,
 *   qty: 0.01
 * }, 43250.50);
 */
export async function createLimitOrderExecutedNotification(
  supabase: ReturnType<typeof createClient>,
  info: LimitOrderExecutionInfo,
  executedPrice?: number
): Promise<NotificationResult> {
  try {
    // テンプレートを取得
    const { data: template, error: templateError } = await supabase
      .from('notification_templates')
      .select('title_template, message_template')
      .eq('template_key', 'limit_order_executed')
      .single();

    if (templateError || !template) {
      console.error('[Notification] Failed to fetch template:', templateError);
      return {
        success: false,
        error: templateError?.message || 'Template not found',
      };
    }

    // サイドの日本語表記
    const sideText = info.side === 'buy' ? '買い' : '売り';

    // 約定価格のフォーマット（未指定の場合は指値価格を使用）
    const finalExecutedPrice = executedPrice ?? info.price;
    const executedPriceFormatted = finalExecutedPrice.toLocaleString('ja-JP');
    const limitPriceFormatted = info.price.toLocaleString('ja-JP');

    // テンプレート変数
    const variables = {
      market: info.market,
      side: sideText,
      quantity: info.qty.toString(),
      executed_price: executedPriceFormatted,
      limit_price: limitPriceFormatted,
      order_id: info.orderId,
    };

    // replace_template_variables関数を使用してテンプレートを処理
    const { data: processedData, error: processError } = await supabase.rpc(
      'replace_template_variables',
      {
        template_text: template.message_template,
        variables: variables,
      }
    );

    if (processError) {
      console.error('[Notification] Failed to process template:', processError);
      return {
        success: false,
        error: processError.message,
      };
    }

    // タイトルも同様に処理（通常は変数なしだが念のため）
    const { data: processedTitle, error: titleError } = await supabase.rpc(
      'replace_template_variables',
      {
        template_text: template.title_template,
        variables: variables,
      }
    );

    if (titleError) {
      console.error('[Notification] Failed to process title:', titleError);
      return {
        success: false,
        error: titleError.message,
      };
    }

    // 通知を作成
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: info.userId,
        title: processedTitle || template.title_template,
        message: processedData || '',
        type: 'success',
        read: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Notification] Failed to create limit order notification:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      notificationId: data.id,
    };
  } catch (error) {
    console.error('[Notification] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * バッチで複数の指値注文約定通知を作成
 *
 * @param supabase - Supabaseクライアント
 * @param orders - 注文情報の配列
 * @returns 通知作成結果の配列
 */
export async function createBatchLimitOrderNotifications(
  supabase: ReturnType<typeof createClient>,
  orders: LimitOrderExecutionInfo[]
): Promise<NotificationResult[]> {
  const results = await Promise.allSettled(
    orders.map((order) => createLimitOrderExecutedNotification(supabase, order))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(
        `[Notification] Failed to create notification for order ${orders[index].orderId}:`,
        result.reason
      );
      return {
        success: false,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
      };
    }
  });
}

/**
 * 指値注文エラー通知を作成
 *
 * @param supabase - Supabaseクライアント
 * @param userId - ユーザーID
 * @param orderId - 注文ID
 * @param market - 市場
 * @param errorMessage - エラーメッセージ
 * @returns 通知作成結果
 */
export async function createLimitOrderErrorNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orderId: string,
  market: string,
  errorMessage: string
): Promise<NotificationResult> {
  try {
    const title = '指値注文の約定に失敗しました';
    const message = [
      `市場: ${market}`,
      `注文ID: ${orderId}`,
      `エラー: ${errorMessage}`,
      '',
      '注文は引き続き監視されます。問題が解決されない場合は、サポートにお問い合わせください。',
    ].join('\n');

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message,
        type: 'error',
        read: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Notification] Failed to create error notification:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      notificationId: data.id,
    };
  } catch (error) {
    console.error('[Notification] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
