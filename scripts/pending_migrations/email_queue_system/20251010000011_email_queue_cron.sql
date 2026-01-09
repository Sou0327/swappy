-- メールキュー処理のcronジョブ設定
-- email-queue-processor Edge Functionを1分ごとに実行してメール送信を自動化

-- 1. pg_cron拡張を有効化（既に有効な場合は何もしない）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 既存のジョブがあれば削除（再実行時の安全性のため）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'process-email-queue';
  END IF;
END $$;

-- 3. メールキュー処理ジョブを作成
-- ⚠️ セキュリティ重要: サービスロールキーはVaultに保存して参照します
--
-- 事前準備（Supabase CLIまたはSQL Editorで実行）:
-- 1. Vaultにサービスロールキーを保存:
--    SELECT vault.create_secret('[YOUR_SERVICE_ROLE_KEY]', 'supabase_service_role_key');
--
-- 2. プロジェクトリファレンスIDを環境に応じて設定:
--    ローカル: http://localhost:54321
--    本番: https://[PROJECT_REF].supabase.co

DO $$
DECLARE
  -- Vaultからサービスロールキーを取得（安全）
  service_key text;
  -- プロジェクトURLを構築
  function_url text;
  project_url text;
BEGIN
  -- Vaultからサービスロールキーを取得
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- サービスキーが見つからない場合はエラー
  IF service_key IS NULL THEN
    RAISE EXCEPTION 'Vaultにサービスロールキーが見つかりません。vault.create_secret() で設定してください。';
  END IF;

  -- 現在のSupabase URLを取得（環境に応じて自動判定）
  -- SUPABASE_URLは環境変数として利用可能（pg_net extensionが提供）
  SELECT current_setting('app.settings.supabase_url', true) INTO project_url;

  -- 環境変数が設定されていない場合は、デフォルトでローカル環境を使用
  IF project_url IS NULL OR project_url = '' THEN
    -- ⚠️ 本番環境では以下をプロジェクトURLに置き換えてください
    project_url := 'https://[PROJECT_REF].supabase.co';

    -- プレースホルダーチェック
    IF project_url = 'https://[PROJECT_REF].supabase.co' THEN
      RAISE EXCEPTION 'プロジェクトURLを実際の値に置き換えてください: [PROJECT_REF]';
    END IF;
  END IF;

  function_url := project_url || '/functions/v1/email-queue-processor';

  -- cronジョブをスケジュール（1分ごとに実行）
  PERFORM cron.schedule(
    'process-email-queue',
    '* * * * *',  -- 毎分実行（分 時 日 月 曜日）
    format(
      $$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'supabase_service_role_key'
            LIMIT 1
          ),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      ) AS request_id;
      $$,
      function_url
    )
  );

  RAISE NOTICE 'Email queue processor cron job scheduled successfully at: %', function_url;
END $$;

-- 4. cronジョブの確認
COMMENT ON EXTENSION pg_cron IS 'メールキュー自動処理のためのcron拡張';

-- 設定確認用クエリ（手動実行）:
-- SELECT * FROM cron.job WHERE jobname = 'process-email-queue';
--
-- cronジョブ実行履歴の確認:
-- SELECT * FROM cron.job_run_details WHERE jobid = (
--   SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'
-- ) ORDER BY start_time DESC LIMIT 10;
--
-- cronジョブの削除（必要な場合）:
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process-email-queue';
