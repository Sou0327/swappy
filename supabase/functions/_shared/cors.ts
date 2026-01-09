/**
 * CORS設定（ホワイトラベル対応）
 *
 * 販売用として安全なデフォルト（開発環境のみ許可）
 * 本番環境では必ず ALLOWED_ORIGINS を設定すること
 *
 * 設定方法:
 * - 本番: supabase secrets set ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
 * - ローカル: supabase functions serve --env-file .env.local
 */

// ALLOWED_ORIGINS を優先、FRONTEND_URL は互換用フォールバック（廃止予定）
const rawOrigins = Deno.env.get('ALLOWED_ORIGINS')
  || Deno.env.get('FRONTEND_URL')  // 互換用フォールバック（既存環境からの移行用）
  || 'http://localhost:8080,http://localhost:3000,http://localhost:5173';

const allowedOrigins = rawOrigins.split(',').map(o => o.trim());

/**
 * リクエストのオリジンに基づいてCORSヘッダーを生成
 * @param origin リクエストのOriginヘッダー
 * @returns CORSヘッダーオブジェクト（許可されない場合は空オブジェクト）
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const isWildcard = allowedOrigins.includes('*');
  const isAllowed = isWildcard || (origin && allowedOrigins.includes(origin));

  // 許可されないオリジンの場合はヘッダーを返さない
  if (!isAllowed) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': isWildcard ? '*' : (origin || ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin', // キャッシュ制御のため追加
  };
}

/**
 * OPTIONSプリフライトリクエストを処理
 * @param origin リクエストのOriginヘッダー
 * @returns Response（許可されない場合は403）
 */
export function handleCorsPreflightRequest(origin: string | null): Response {
  const headers = getCorsHeaders(origin);
  if (Object.keys(headers).length === 0) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers });
}

// 後方互換性のための静的ヘッダー（新規コードでは getCorsHeaders を使用推奨）
// ⚠️ 廃止予定: 段階的に getCorsHeaders に移行してください
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
