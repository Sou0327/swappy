// メール送信Edge Function
// Resend APIを使用してメールを送信し、ログを記録

// @ts-expect-error Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase JS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error Supabase types
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@yourdomain.com';
const PLATFORM_NAME = Deno.env.get('PLATFORM_NAME') || 'Swappy';
const PLATFORM_URL = Deno.env.get('PLATFORM_URL') || 'https://yourdomain.com';
const IS_DEV = Deno.env.get('ENVIRONMENT') === 'development';
const ENABLE_EMAIL = Deno.env.get('ENABLE_ACTUAL_EMAIL_SENDING') === 'true';

type TemplateValue = string | number | boolean | null | undefined;

interface EmailSenderRequest {
  email_type: 'welcome' | 'kyc_approved' | 'kyc_rejected' | 'referral_reward' |
               'deposit_confirmation' | 'withdrawal_confirmation' | 'security_alert';
  recipient_email?: string;
  user_id?: string;
  template_data: Record<string, TemplateValue>;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(origin);
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let request: EmailSenderRequest | null = null;

  try {
    // Service role keyでの認証（内部呼び出しのみ）
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Service role key required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // リクエストボディの解析
    request = await req.json();
    const requestTyped = request as EmailSenderRequest;
    console.log('[email-sender] Request:', JSON.stringify({ ...request, template_data: '...' }));

    // recipient_emailがない場合、user_idから取得
    let recipientEmail = requestTyped.recipient_email;
    if (!recipientEmail && requestTyped.user_id) {
      const { data: user } = await supabase.auth.admin.getUserById(requestTyped.user_id);
      recipientEmail = user?.user?.email;
    }

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'recipient_email or user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // メールテンプレートの取得
    const template = getEmailTemplate(requestTyped.email_type, requestTyped.template_data);

    // 開発環境でメール送信が無効な場合はログのみ（デフォルト動作）
    if (IS_DEV && !ENABLE_EMAIL) {
      console.log('📧 [DEV MODE - LOG ONLY] Email would be sent:', {
        to: recipientEmail,
        subject: template.subject,
        html: template.html.substring(0, 200) + '...'
      });

      // ログ記録
      await logEmail(supabase, requestTyped.user_id, requestTyped.email_type, recipientEmail, template.subject, 'sent', null, 'dev-test-id');

      return new Response(
        JSON.stringify({ success: true, messageId: 'dev-test-id', devMode: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 開発環境でもメール送信が有効な場合はログを追加
    if (IS_DEV && ENABLE_EMAIL) {
      console.log('📧 [DEV MODE - ACTUAL SENDING] Sending email via Resend:', {
        to: recipientEmail,
        subject: template.subject
      });
    }

    // Resend APIでメール送信
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const result = await sendEmailViaResend(recipientEmail, template.subject, template.html, template.text);

    // ログ記録
    await logEmail(supabase, requestTyped.user_id, requestTyped.email_type, recipientEmail, template.subject, 'sent', null, result.id);

    console.log('[email-sender] Email sent successfully:', result.id);

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[email-sender] Error:', error);

    // エラーログを記録
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await logEmail(
        supabase,
        request?.user_id,
        request?.email_type || 'unknown',
        request?.recipient_email || 'unknown',
        'Failed to generate template',
        'failed',
        error instanceof Error ? error.message : String(error),
        null
      );
    } catch (logError) {
      console.error('[email-sender] Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Resend APIでメール送信
 */
async function sendEmailViaResend(to: string, subject: string, html: string, text: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: subject,
      html: html,
      text: text
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return await response.json();
}

/**
 * メール送信ログを記録
 */
async function logEmail(
  supabase: SupabaseClient,
  userId: string | undefined,
  emailType: string,
  recipientEmail: string,
  subject: string,
  status: 'sent' | 'failed',
  errorMessage: string | null,
  resendMessageId: string | null
) {
  await supabase
    .from('email_logs')
    .insert({
      user_id: userId || null,
      email_type: emailType,
      recipient_email: recipientEmail,
      subject: subject,
      status: status,
      error_message: errorMessage,
      resend_message_id: resendMessageId,
      sent_at: status === 'sent' ? new Date().toISOString() : null
    });
}

/**
 * メールテンプレートの取得
 */
function getEmailTemplate(emailType: string, data: Record<string, TemplateValue>): EmailTemplate {
  const baseStyles = `
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
      .header { background: linear-gradient(135deg, #1a56db 0%, #1e429f 100%); color: white; padding: 30px 20px; text-align: center; }
      .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
      .content { padding: 40px 30px; line-height: 1.6; color: #333; }
      .content h2 { color: #1a56db; font-size: 20px; margin-top: 0; }
      .button { display: inline-block; background: #1a56db; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
      .button:hover { background: #1e429f; }
      .info-box { background: #f0f7ff; border-left: 4px solid #1a56db; padding: 15px; margin: 20px 0; border-radius: 4px; }
      .footer { background: #f5f5f5; padding: 20px; text-align: center; color: #666; font-size: 12px; }
      .footer a { color: #1a56db; text-decoration: none; }
    </style>
  `;

  switch (emailType) {
    case 'welcome':
      return {
        subject: `${PLATFORM_NAME}へようこそ！`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            ${baseStyles}
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${PLATFORM_NAME}</h1>
              </div>
              <div class="content">
                <h2>ようこそ、${data.user_name || 'お客様'}！</h2>
                <p>アカウントの作成が完了しました。${PLATFORM_NAME}をご利用いただき、ありがとうございます。</p>
                <p>今すぐダッシュボードにアクセスして、暗号資産取引を開始しましょう。</p>
                <div style="text-align: center;">
                  <a href="${data.login_url || PLATFORM_URL + '/dashboard'}" class="button">ダッシュボードへ</a>
                </div>
                <div class="info-box">
                  <strong>ご利用の前に：</strong>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>KYC認証を完了すると、全機能をご利用いただけます</li>
                    <li>二段階認証の設定で、アカウントのセキュリティを強化できます</li>
                    <li>ご不明な点がございましたら、サポートチームまでお問い合わせください</li>
                  </ul>
                </div>
              </div>
              <div class="footer">
                <p>${PLATFORM_NAME} | サポート: support@yourdomain.com</p>
                <p><a href="${PLATFORM_URL}/privacy">プライバシーポリシー</a> | <a href="${PLATFORM_URL}/terms">利用規約</a></p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `${PLATFORM_NAME}へようこそ！\n\nようこそ、${data.user_name || 'お客様'}！\n\nアカウントの作成が完了しました。今すぐダッシュボードにアクセスして、取引を開始しましょう。\n\nダッシュボード: ${data.login_url || PLATFORM_URL + '/dashboard'}\n\nご不明な点がございましたら、サポートチームまでお問い合わせください。\n\n${PLATFORM_NAME}`
      };

    case 'kyc_approved':
      return {
        subject: `KYC審査が承認されました - ${PLATFORM_NAME}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            ${baseStyles}
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${PLATFORM_NAME}</h1>
              </div>
              <div class="content">
                <h2>🎉 KYC審査が承認されました！</h2>
                <p>${data.user_name || 'お客様'}、おめでとうございます！</p>
                <p>KYC（本人確認）審査が正常に完了しました。これで全機能をご利用いただけます。</p>
                <div class="info-box">
                  <strong>ご利用可能になった機能：</strong>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>暗号資産の入金・出金</li>
                    <li>高額取引の実行</li>
                    <li>すべての取引ペア</li>
                    ${data.kyc_level === 2 ? '<li>法人口座機能</li>' : ''}
                  </ul>
                </div>
                <div style="text-align: center;">
                  <a href="${data.dashboard_url || PLATFORM_URL + '/dashboard'}" class="button">取引を開始する</a>
                </div>
              </div>
              <div class="footer">
                <p>${PLATFORM_NAME} | サポート: support@yourdomain.com</p>
                <p><a href="${PLATFORM_URL}/privacy">プライバシーポリシー</a> | <a href="${PLATFORM_URL}/terms">利用規約</a></p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `KYC審査が承認されました！\n\n${data.user_name || 'お客様'}、おめでとうございます！\n\nKYC審査が正常に完了しました。これで全機能をご利用いただけます。\n\nダッシュボード: ${data.dashboard_url || PLATFORM_URL + '/dashboard'}\n\n${PLATFORM_NAME}`
      };

    case 'kyc_rejected':
      return {
        subject: `KYC審査について - ${PLATFORM_NAME}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            ${baseStyles}
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${PLATFORM_NAME}</h1>
              </div>
              <div class="content">
                <h2>KYC審査について</h2>
                <p>${data.user_name || 'お客様'}、いつもご利用いただきありがとうございます。</p>
                <p>誠に申し訳ございませんが、KYC審査につきまして、追加の確認が必要となりました。</p>
                ${data.reason ? `<div class="info-box"><strong>詳細：</strong><p>${data.reason}</p></div>` : ''}
                <p>お手数ですが、以下の手順で再度ご提出をお願いいたします：</p>
                <ol style="margin: 20px 0; padding-left: 20px;">
                  <li>ダッシュボードにアクセス</li>
                  <li>KYC画面を開く</li>
                  <li>必要書類を再提出</li>
                </ol>
                <div style="text-align: center;">
                  <a href="${data.kyc_url || PLATFORM_URL + '/kyc'}" class="button">KYC画面へ</a>
                </div>
                <p style="margin-top: 30px;">ご不明な点がございましたら、サポートチームまでお気軽にお問い合わせください。</p>
              </div>
              <div class="footer">
                <p>${PLATFORM_NAME} | サポート: support@yourdomain.com</p>
                <p><a href="${PLATFORM_URL}/privacy">プライバシーポリシー</a> | <a href="${PLATFORM_URL}/terms">利用規約</a></p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `KYC審査について\n\n${data.user_name || 'お客様'}、いつもご利用いただきありがとうございます。\n\nKYC審査につきまして、追加の確認が必要となりました。お手数ですが、ダッシュボードから必要書類を再提出いただけますようお願いいたします。\n\nKYC画面: ${data.kyc_url || PLATFORM_URL + '/kyc'}\n\n${PLATFORM_NAME}`
      };

    case 'referral_reward':
      return {
        subject: `🎁 紹介報酬を獲得しました - ${PLATFORM_NAME}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            ${baseStyles}
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${PLATFORM_NAME}</h1>
              </div>
              <div class="content">
                <h2>🎁 紹介報酬を獲得しました！</h2>
                <p>${data.user_name || 'お客様'}、おめでとうございます！</p>
                <p>${data.reward_type === 'referrer_bonus' ? 'ご紹介いただいたユーザーのKYC審査が完了し、' : 'KYC審査が完了し、'}紹介報酬が付与されました。</p>
                <div class="info-box">
                  <strong>報酬詳細：</strong>
                  <p style="font-size: 24px; font-weight: 600; color: #1a56db; margin: 10px 0;">
                    ${data.amount} ${data.currency}
                  </p>
                  <p style="font-size: 14px; color: #666;">${data.notes || '紹介プログラム特典'}</p>
                </div>
                <p>報酬はウォレットに反映されています。引き続き${PLATFORM_NAME}をご利用ください。</p>
                <div style="text-align: center;">
                  <a href="${data.wallet_url || PLATFORM_URL + '/wallet'}" class="button">ウォレットを確認</a>
                </div>
              </div>
              <div class="footer">
                <p>${PLATFORM_NAME} | サポート: support@yourdomain.com</p>
                <p><a href="${PLATFORM_URL}/privacy">プライバシーポリシー</a> | <a href="${PLATFORM_URL}/terms">利用規約</a></p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `🎁 紹介報酬を獲得しました！\n\n${data.user_name || 'お客様'}、おめでとうございます！\n\n紹介報酬が付与されました：${data.amount} ${data.currency}\n\nウォレット: ${data.wallet_url || PLATFORM_URL + '/wallet'}\n\n${PLATFORM_NAME}`
      };

    default:
      throw new Error(`Unknown email type: ${emailType}`);
  }
}
