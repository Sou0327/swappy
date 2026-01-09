-- Enable pg_cron and pg_net extensions for scheduled limit order monitoring
-- 指値注文の定期監視のためにpg_cronとpg_net拡張を有効化

-- pg_cron: PostgreSQLのCronスケジューラ
-- 用途: 定期的なジョブ実行（最小1分間隔）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_net: PostgreSQLからのHTTPリクエスト送信
-- 用途: Edge Functionの呼び出し
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 注意事項:
-- 1. この拡張の有効化だけでは指値注文監視は開始されません
-- 2. Cronジョブの登録は別途セットアップスクリプトで行います
-- 3. セットアップ手順は supabase/functions/cron/setup-limit-order-monitor.sql を参照してください
-- 4. ローカル環境ではpg_cronが動作しない可能性があります（本番環境のみ）

COMMENT ON EXTENSION pg_cron IS 'Cronベースのジョブスケジューリング（最小1分間隔）';
COMMENT ON EXTENSION pg_net IS 'HTTPリクエスト送信機能（Edge Function呼び出し用）';
