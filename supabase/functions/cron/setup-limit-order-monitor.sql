-- Supabase Cron Setup for Limit Order Monitoring
-- 指値注文監視のためのCronジョブセットアップスクリプト
--
-- 【重要】このスクリプトは本番環境のSupabase SQL Editorで手動実行してください
-- 【注意】ローカル環境ではpg_cronが動作しない可能性があります
--
-- 実行手順:
-- 1. Supabase Dashboard → SQL Editor を開く
-- 2. このファイルの内容をコピー
-- 3. 下記の YOUR_SUPABASE_ANON_KEY を実際のANON KEYに置き換える
-- 4. 実行して完了

-- ========================================
-- 1. 既存のジョブを削除（存在する場合）
-- ========================================
SELECT cron.unschedule('limit-order-monitor-job') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'limit-order-monitor-job'
);

SELECT cron.unschedule('cron-history-cleanup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cron-history-cleanup'
);

-- ========================================
-- 2. 指値注文監視ジョブの登録
-- ========================================
-- 実行間隔: 1分ごと
-- 処理内容: limit-order-monitor Edge Functionを呼び出し
--
-- ⚠️ 注意: YOUR_SUPABASE_ANON_KEY を実際の値に置き換えてください
-- 取得方法: Supabase Dashboard → Settings → API → Project API keys → anon public

DO $$
DECLARE
  v_project_url TEXT := 'https://***REMOVED***.supabase.co';
  v_anon_key TEXT := '***REMOVED***';  -- ⚠️ ここを実際のキーに置き換える
  v_function_url TEXT;
  v_headers JSONB;
BEGIN
  -- Edge FunctionのURL構築
  v_function_url := v_project_url || '/functions/v1/limit-order-monitor';

  -- HTTPヘッダーの構築
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon_key
  );

  -- Cronジョブの登録
  PERFORM cron.schedule(
    'limit-order-monitor-job',      -- ジョブ名
    '* * * * *',                     -- スケジュール: 毎分実行
    format(
      'SELECT net.http_post(url := %L, headers := %L::jsonb)',
      v_function_url,
      v_headers
    )
  );

  RAISE NOTICE '✅ 指値注文監視ジョブを登録しました: 毎分実行';
  RAISE NOTICE '📍 URL: %', v_function_url;
END $$;

-- ========================================
-- 3. Cron履歴クリーンアップジョブの登録
-- ========================================
-- 実行間隔: 毎週日曜日 3:00 AM
-- 処理内容: 7日以上前のCron実行履歴を削除
-- 理由: cron.job_run_detailsテーブルの肥大化を防ぐ

SELECT cron.schedule(
  'cron-history-cleanup',          -- ジョブ名
  '0 3 * * 0',                     -- スケジュール: 毎週日曜3:00 AM
  $$
  DELETE FROM cron.job_run_details
  WHERE end_time < NOW() - INTERVAL '7 days'
  $$
);

RAISE NOTICE '✅ Cron履歴クリーンアップジョブを登録しました: 毎週日曜3:00 AM';

-- ========================================
-- 4. 登録されたジョブの確認
-- ========================================
SELECT
  jobid,
  jobname,
  schedule,
  active,
  database
FROM cron.job
ORDER BY jobname;

-- ========================================
-- セットアップ完了後の確認コマンド
-- ========================================
-- ジョブの実行履歴を確認:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- ジョブを停止する場合:
-- SELECT cron.unschedule('limit-order-monitor-job');
--
-- ジョブを再開する場合:
-- UPDATE cron.job SET active = true WHERE jobname = 'limit-order-monitor-job';
