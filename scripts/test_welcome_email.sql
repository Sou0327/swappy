-- ウェルカムメール送信テスト用スクリプト
-- このスクリプトを使用して、メールキュー処理システムが正常に動作することを確認できます

-- ============================================
-- 1. テストメールをキューに追加
-- ============================================
-- ⚠️ 注意: 'your-email@example.com' を実際に受信できるメールアドレスに置き換えてください

-- 方法1: 既存ユーザーのメールアドレスを使う（推奨）
DO $$
DECLARE
  test_user_id uuid;
  test_email text;
BEGIN
  -- 最初のユーザーを取得（テスト用）
  SELECT id, email INTO test_user_id, test_email
  FROM auth.users
  ORDER BY created_at DESC
  LIMIT 1;

  IF test_user_id IS NULL THEN
    RAISE NOTICE '❌ ユーザーが見つかりません。先にユーザーを作成してください。';
  ELSE
    -- ウェルカムメールをキューに追加
    PERFORM public.queue_email(
      test_user_id,
      'welcome',
      test_email,
      jsonb_build_object(
        'user_name', 'テストユーザー',
        'login_url', 'https://yourdomain.com/dashboard'
      )
    );

    RAISE NOTICE '✅ ウェルカムメールをキューに追加しました';
    RAISE NOTICE '   ユーザーID: %', test_user_id;
    RAISE NOTICE '   メールアドレス: %', test_email;
    RAISE NOTICE '';
    RAISE NOTICE '⏱️  約1分後にメールが送信されます（cronジョブが実行されるまで待機）';
  END IF;
END $$;

-- 方法2: 特定のメールアドレスを指定する場合（手動）
-- SELECT public.queue_email(
--   (SELECT id FROM auth.users WHERE email = 'your-email@example.com' LIMIT 1),
--   'welcome',
--   'your-email@example.com',
--   jsonb_build_object(
--     'user_name', 'テストユーザー',
--     'login_url', 'https://yourdomain.com/dashboard'
--   )
-- );

-- ============================================
-- 2. キューの状態を確認
-- ============================================

-- 2-1. 最近のキューレコードを表示（全ステータス）
SELECT
  id,
  email_type AS "メール種別",
  recipient_email AS "宛先",
  status AS "ステータス",
  retry_count AS "リトライ回数",
  scheduled_at AS "送信予定時刻",
  created_at AS "作成日時",
  processed_at AS "処理完了日時",
  error_message AS "エラーメッセージ"
FROM public.email_queue
ORDER BY created_at DESC
LIMIT 10;

-- 2-2. 未送信メールのみ表示
SELECT
  id,
  email_type AS "メール種別",
  recipient_email AS "宛先",
  retry_count AS "リトライ回数",
  scheduled_at AS "送信予定時刻",
  error_message AS "前回エラー"
FROM public.email_queue
WHERE status = 'pending'
ORDER BY scheduled_at ASC;

-- 2-3. 送信済みメール
SELECT
  id,
  email_type AS "メール種別",
  recipient_email AS "宛先",
  processed_at AS "送信日時"
FROM public.email_queue
WHERE status = 'sent'
ORDER BY processed_at DESC
LIMIT 10;

-- 2-4. 失敗したメール
SELECT
  id,
  email_type AS "メール種別",
  recipient_email AS "宛先",
  retry_count AS "試行回数",
  error_message AS "エラー内容",
  processed_at AS "最終試行日時"
FROM public.email_queue
WHERE status = 'failed'
ORDER BY processed_at DESC
LIMIT 10;

-- ============================================
-- 3. 送信ログを確認
-- ============================================

-- 3-1. 最近の送信ログ（成功・失敗両方）
SELECT
  id,
  email_type AS "メール種別",
  recipient_email AS "宛先",
  subject AS "件名",
  status AS "ステータス",
  resend_message_id AS "ResendメッセージID",
  sent_at AS "送信日時",
  error_message AS "エラーメッセージ"
FROM public.email_logs
ORDER BY created_at DESC
LIMIT 10;

-- 3-2. 送信成功したログのみ
SELECT
  email_type AS "メール種別",
  recipient_email AS "宛先",
  subject AS "件名",
  sent_at AS "送信日時"
FROM public.email_logs
WHERE status = 'sent'
ORDER BY sent_at DESC
LIMIT 10;

-- 3-3. エラーログのみ
SELECT
  email_type AS "メール種別",
  recipient_email AS "宛先",
  error_message AS "エラー内容",
  created_at AS "発生日時"
FROM public.email_logs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- 4. 統計情報
-- ============================================

-- キューの状態別集計
SELECT
  status AS "ステータス",
  COUNT(*) AS "件数"
FROM public.email_queue
GROUP BY status
ORDER BY status;

-- メール種別ごとの送信統計
SELECT
  email_type AS "メール種別",
  COUNT(*) AS "総送信数",
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS "成功",
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS "失敗"
FROM public.email_logs
GROUP BY email_type
ORDER BY "総送信数" DESC;

-- ============================================
-- 5. cronジョブの確認
-- ============================================

-- cronジョブが正しく設定されているか確認
SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobname = 'process-email-queue';

-- cronジョブの実行履歴（最近10件）
SELECT
  runid,
  job_pid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'
)
ORDER BY start_time DESC
LIMIT 10;

-- ============================================
-- 6. クリーンアップ（必要な場合のみ実行）
-- ============================================

-- 古い送信済みメールをキューから削除（7日以上前）
-- DELETE FROM public.email_queue
-- WHERE status = 'sent'
-- AND processed_at < NOW() - INTERVAL '7 days';

-- 古い失敗メールをキューから削除（30日以上前）
-- DELETE FROM public.email_queue
-- WHERE status = 'failed'
-- AND processed_at < NOW() - INTERVAL '30 days';

-- 古いログを削除（90日以上前）
-- DELETE FROM public.email_logs
-- WHERE created_at < NOW() - INTERVAL '90 days';

-- ============================================
-- 7. トラブルシューティング
-- ============================================

-- 問題: メールが送信されない場合
-- 1. cronジョブが動いているか確認（上記「5. cronジョブの確認」参照）
-- 2. キューに pending のメールがあるか確認（上記「2-2. 未送信メールのみ表示」参照）
-- 3. email-queue-processor Edge Functionがデプロイされているか確認
--    → Supabase Dashboard > Edge Functions で確認
-- 4. 環境変数が正しく設定されているか確認
--    → RESEND_API_KEY, FROM_EMAIL, PLATFORM_NAME, PLATFORM_URL

-- 手動でキュー処理を実行（テスト用）
-- SELECT net.http_post(
--   url := 'https://[PROJECT_REF].supabase.co/functions/v1/email-queue-processor',
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer [SERVICE_ROLE_KEY]',
--     'Content-Type', 'application/json'
--   )
-- ) AS request_id;
