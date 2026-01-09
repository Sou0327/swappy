// メールキュー処理Edge Function
// email_queueテーブルから未送信メールを取得し、email-senderを呼び出して送信
// リトライロジック、エラーハンドリング、ステータス管理を実装

// @ts-expect-error Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase JS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/email-sender`;

// 一度に処理するメール数（負荷分散のため）
const BATCH_SIZE = 10;

// リトライ間隔（分）
const RETRY_DELAYS = [0, 5, 15]; // 0分（即座）、5分後、15分後

interface EmailQueueRecord {
  id: string;
  user_id: string | null;
  email_type: string;
  recipient_email: string;
  template_data: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
}

serve(async (req: Request) => {
  try {
    console.log('[email-queue-processor] Starting queue processing...');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. 処理対象のメールを取得（pending かつ scheduled_at が現在時刻以前）
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[email-queue-processor] Error fetching queue:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch email queue', details: fetchError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log('[email-queue-processor] No pending emails to process');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No pending emails' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[email-queue-processor] Found ${pendingEmails.length} pending emails`);

    // 2. 各メールを処理
    const results = await Promise.allSettled(
      pendingEmails.map((email) => processEmail(supabase, email))
    );

    // 3. 結果集計
    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    const failureCount = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;

    console.log(`[email-queue-processor] Completed: ${successCount} success, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingEmails.length,
        successful: successCount,
        failed: failureCount
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[email-queue-processor] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Unexpected error in queue processor',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * 個別のメールを処理
 */
// @ts-expect-error Supabase client type from CDN import
async function processEmail(supabase: ReturnType<typeof createClient>, email: EmailQueueRecord): Promise<boolean> {
  const emailId = email.id;

  try {
    console.log(`[email-queue-processor] Processing email ${emailId} (type: ${email.email_type})`);

    // ステータスを processing に更新（楽観的ロック）
    const { data: claimedJob, error: updateError } = await supabase
      .from('email_queue')
      .update({ status: 'processing' })
      .eq('id', emailId)
      .eq('status', 'pending') // 他のプロセスが既に処理していないか確認
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error(`[email-queue-processor] Failed to update status for ${emailId}:`, updateError);
      return false;
    }

    if (!claimedJob) {
      console.log(`[email-queue-processor] Skip processing ${emailId} because another worker already claimed it.`);
      return false;
    }

    // email-sender Edge Functionを呼び出し
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email_type: email.email_type,
        recipient_email: email.recipient_email,
        user_id: email.user_id,
        template_data: email.template_data
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Email sender returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`[email-queue-processor] Email ${emailId} sent successfully:`, result.messageId);

    // 送信成功 → status='sent', processed_at=now()
    await supabase
      .from('email_queue')
      .update({
        status: 'sent',
        processed_at: new Date().toISOString()
      })
      .eq('id', emailId);

    return true;

  } catch (error) {
    console.error(`[email-queue-processor] Error processing email ${emailId}:`, error);

    // リトライカウントをインクリメント
    const newRetryCount = email.retry_count + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (newRetryCount >= email.max_retries) {
      // 最大リトライ回数を超えた → 失敗確定
      console.error(`[email-queue-processor] Email ${emailId} failed after ${newRetryCount} attempts`);

      await supabase
        .from('email_queue')
        .update({
          status: 'failed',
          retry_count: newRetryCount,
          error_message: errorMessage,
          processed_at: new Date().toISOString()
        })
        .eq('id', emailId);

      return false;
    } else {
      // リトライ可能 → scheduled_atを未来に設定
      // RETRY_DELAYS配列のインデックスは0始まりなので、newRetryCount - 1を使用
      // 例: retry_count=1（1回目のリトライ） → RETRY_DELAYS[0]=0分（即座）
      //     retry_count=2（2回目のリトライ） → RETRY_DELAYS[1]=5分後
      //     retry_count=3（3回目のリトライ） → RETRY_DELAYS[2]=15分後
      const retryDelayMinutes = RETRY_DELAYS[newRetryCount - 1] || 30;
      const nextScheduledAt = new Date(Date.now() + retryDelayMinutes * 60 * 1000);

      console.log(`[email-queue-processor] Email ${emailId} will retry in ${retryDelayMinutes} minutes (attempt ${newRetryCount}/${email.max_retries})`);

      await supabase
        .from('email_queue')
        .update({
          status: 'pending', // pendingに戻す
          retry_count: newRetryCount,
          error_message: errorMessage,
          scheduled_at: nextScheduledAt.toISOString()
        })
        .eq('id', emailId);

      return false;
    }
  }
}
