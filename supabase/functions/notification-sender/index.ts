// 通知送信Edge Function
// テンプレートベースの通知作成と一斉送信機能

// @ts-expect-error Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase JS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface NotificationRequest {
  // 個別通知送信
  user_id?: string;
  user_ids?: string[];

  // テンプレート使用
  template_key?: string;
  template_variables?: Record<string, string | number>;

  // ダイレクト通知（テンプレート不使用）
  title?: string;
  message?: string;
  type?: string;
  category?: string;
  metadata?: Record<string, unknown>;

  // 一斉送信設定
  broadcast?: boolean;
  target_role?: 'all' | 'user' | 'moderator' | 'admin';
}

interface NotificationTemplate {
  id: string;
  template_key: string;
  title_template: string;
  message_template: string;
  notification_type: string;
  variables: string[];
}

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(origin);
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ message: 'notification-sender', version: '1.0.0' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 認証チェック（管理者のみ）
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    // ユーザー認証確認
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 管理者権限チェック
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!userRole || !['admin', 'moderator'].includes(userRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // リクエストボディの解析
    const request: NotificationRequest = await req.json();
    console.log('[notification-sender] Request:', JSON.stringify(request));

    // 通知内容の準備
    let title = request.title || '';
    let message = request.message || '';
    let notificationType = request.type || 'info';
    const category = request.category || 'system';
    const metadata = request.metadata || {};

    // テンプレート使用の場合
    if (request.template_key) {
      const { data: template, error: templateError } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('template_key', request.template_key)
        .eq('active', true)
        .single();

      if (templateError || !template) {
        return new Response(
          JSON.stringify({ error: `Template not found: ${request.template_key}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // テンプレート変数の置換
      title = replaceTemplateVariables(template.title_template, request.template_variables || {});
      message = replaceTemplateVariables(template.message_template, request.template_variables || {});
      notificationType = template.notification_type;

      console.log('[notification-sender] Template applied:', {
        template_key: request.template_key,
        title,
        message
      });
    }

    // タイトルとメッセージの検証
    if (!title || !message) {
      return new Response(
        JSON.stringify({ error: 'Title and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let notificationsSent = 0;
    const errors: string[] = [];

    // 送信履歴レコードを作成（エラーが発生しても通知送信は継続）
    let historyId: string | null = null;
    try {
      const { data: historyRecord, error: historyError } = await supabase
        .from('notification_send_history')
        .insert({
          sent_by: user.id,
          template_key: request.template_key || null,
          title,
          message,
          notification_type: notificationType,
          category,
          is_broadcast: request.broadcast || false,
          target_role: request.broadcast ? (request.target_role || 'all') : null,
          target_user_ids: !request.broadcast && request.user_ids ? JSON.stringify(request.user_ids) : null,
          status: 'success',  // 初期値、後で更新
          notifications_sent: 0,
          notifications_failed: 0
        })
        .select('id')
        .single();

      if (!historyError && historyRecord) {
        historyId = historyRecord.id;
        console.log('[notification-sender] History record created:', historyId);
      } else if (historyError) {
        console.error('[notification-sender] Failed to create history record:', historyError);
        // 履歴作成失敗でも通知送信は継続
      }
    } catch (historyCreateError) {
      console.error('[notification-sender] History creation error:', historyCreateError);
      // 履歴作成失敗でも通知送信は継続
    }

    // 一斉送信の場合
    if (request.broadcast) {
      const targetRole = request.target_role || 'all';

      // 対象ユーザーの取得
      let query = supabase
        .from('profiles')
        .select('id');

      if (targetRole !== 'all') {
        // 特定ロールのユーザーのみ
        const { data: roleUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', targetRole);

        if (roleUsers && roleUsers.length > 0) {
          const userIds = roleUsers.map(r => r.user_id);
          query = query.in('id', userIds);
        } else {
          return new Response(
            JSON.stringify({ success: true, notifications_sent: 0, message: 'No users found for target role' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { data: targetUsers, error: usersError } = await query;

      if (usersError) {
        console.error('[notification-sender] Error fetching target users:', usersError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch target users' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!targetUsers || targetUsers.length === 0) {
        return new Response(
          JSON.stringify({ success: true, notifications_sent: 0, message: 'No users found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // バッチで通知を作成
      const notifications = targetUsers.map(u => ({
        user_id: u.id,
        title,
        message,
        type: notificationType,
        read: false
      }));

      // バッチ挿入（100件ずつ）
      const batchSize = 100;
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('notifications')
          .insert(batch);

        if (insertError) {
          console.error('[notification-sender] Batch insert error:', insertError);
          errors.push(`Batch ${i / batchSize + 1}: ${insertError.message}`);
        } else {
          notificationsSent += batch.length;
        }
      }

      console.log('[notification-sender] Broadcast completed:', {
        target_role: targetRole,
        total_users: targetUsers.length,
        notifications_sent: notificationsSent,
        errors: errors.length
      });

    } else {
      // 個別送信
      const targetUserIds: string[] = [];

      if (request.user_id) {
        targetUserIds.push(request.user_id);
      }

      if (request.user_ids && Array.isArray(request.user_ids)) {
        targetUserIds.push(...request.user_ids);
      }

      if (targetUserIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No target users specified' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 各ユーザーに通知を送信
      for (const userId of targetUserIds) {
        const { error: insertError } = await supabase
          .from('notifications')
          .insert({
            user_id: userId,
            title,
            message,
            type: notificationType,
            read: false
          });

        if (insertError) {
          console.error(`[notification-sender] Failed to send notification to ${userId}:`, insertError);
          errors.push(`User ${userId}: ${insertError.message}`);
        } else {
          notificationsSent++;
        }
      }

      console.log('[notification-sender] Individual notifications sent:', {
        target_users: targetUserIds.length,
        notifications_sent: notificationsSent,
        errors: errors.length
      });
    }

    // 送信履歴を更新（エラーが発生しても通知送信結果は返す）
    if (historyId) {
      try {
        const notificationsFailed = errors.length;
        const finalStatus = notificationsFailed === 0
          ? 'success'
          : notificationsSent > 0
            ? 'partial'
            : 'failed';

        const { error: historyUpdateError } = await supabase
          .from('notification_send_history')
          .update({
            status: finalStatus,
            notifications_sent: notificationsSent,
            notifications_failed: notificationsFailed,
            error_message: errors.length > 0 ? errors.join('; ') : null
          })
          .eq('id', historyId);

        if (historyUpdateError) {
          console.error('[notification-sender] Failed to update history record:', historyUpdateError);
        } else {
          console.log('[notification-sender] History record updated:', {
            id: historyId,
            status: finalStatus,
            sent: notificationsSent,
            failed: notificationsFailed
          });
        }
      } catch (historyUpdateError) {
        console.error('[notification-sender] History update error:', historyUpdateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_sent: notificationsSent,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[notification-sender] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * テンプレート変数を置換する関数
 */
function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;

  // {{variable}}形式のプレースホルダーを置換
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, String(value));
  }

  return result;
}