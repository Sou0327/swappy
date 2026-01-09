// Deno環境での型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  Command: {
    new(command: string, options?: {
      args?: string[];
      stdout?: string;
      stderr?: string;
    }): {
      output(): Promise<{
        success: boolean;
        stdout: Uint8Array;
        stderr: Uint8Array;
      }>;
    };
  };
};

// @ts-expect-error - Deno runtime imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
  Tatum管理者ステータス取得（WalletAdmin.tsx統合用）
  - 入力: 認証ヘッダー（管理者権限確認）
  - 出力: { subscriptions: TatumSubscription[], webhookErrors: WebhookError[] }
  - 用途: 管理画面でのサブスクリプション状況・Webhookエラー可視化
  - セキュリティ: 管理者認証必須
*/

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function withUserClient(authHeader: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
}

interface TatumSubscription {
  id: string;
  address: string;
  chain: string;
  network: string;
  type: string;
  status: 'active' | 'inactive';
  created_at: string;
  last_webhook?: string;
  error_count: number;
}

interface WebhookError {
  id: string;
  subscription_id?: string;
  address: string;
  chain: string;
  network: string;
  error_message: string;
  created_at: string;
  resolved: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      message: 'tatum-admin-status',
      supports: ['subscription-monitoring', 'webhook-error-tracking'],
      version: '0.1'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // user-scoped client（認証確認）
    const userScoped = withUserClient(auth);
    const { data: profile } = await userScoped.auth.getUser();
    if (!profile?.user?.id) {
      return new Response(JSON.stringify({ error: 'Auth required' }), { status: 401 });
    }

    // 管理者権限確認
    const { data: userRole } = await userScoped
      .from('user_roles')
      .select('role')
      .eq('user_id', profile.user.id)
      .single();

    if (!userRole || !['admin', 'moderator'].includes(userRole.role)) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 });
    }

    // Tatum subscription-manager CLIを呼び出してステータス取得
    const statusCommand = new Deno.Command('node', {
      args: [
        '/opt/supabase/functions/tatum-admin-status/status-wrapper.js'
      ],
      stdout: 'piped',
      stderr: 'piped'
    });

    const { success, stdout, stderr } = await statusCommand.output();
    const output = new TextDecoder().decode(stdout);
    const error = new TextDecoder().decode(stderr);

    if (!success) {
      console.error('[tatum-admin-status] CLI error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Status check failed',
        details: error
      }), { status: 500 });
    }

    let statusResult;
    try {
      statusResult = JSON.parse(output);
    } catch (parseError) {
      console.error('[tatum-admin-status] Parse error:', parseError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid CLI response',
        details: output
      }), { status: 500 });
    }

    // Webhookエラー履歴をSupabaseから取得
    const { data: webhookErrors, error: webhookError } = await userScoped
      .from('webhook_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (webhookError) {
      console.error('[tatum-admin-status] Webhook errors fetch failed:', webhookError);
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        subscriptions: statusResult.subscriptions || [],
        webhookErrors: webhookErrors || [],
        summary: statusResult.summary || {},
        timestamp: new Date().toISOString()
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('[tatum-admin-status] error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: (e as Error).message || String(e)
    }), { status: 500 });
  }
});