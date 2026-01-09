-- Dead Letter Events Table
-- Webhookイベント処理失敗時の保存・再処理システム

CREATE TABLE IF NOT EXISTS public.dead_letter_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  error_type TEXT NOT NULL CHECK (error_type IN ('retryable', 'permanent', 'rate_limited')),
  retry_count INTEGER DEFAULT 0 NOT NULL,
  max_retries INTEGER DEFAULT 5 NOT NULL,
  next_retry_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'failed', 'success', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- インデックス作成（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_status ON public.dead_letter_events (status);
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_next_retry ON public.dead_letter_events (next_retry_at);
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_expires_at ON public.dead_letter_events (expires_at);
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_webhook_id ON public.dead_letter_events (webhook_id);
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_created_at ON public.dead_letter_events (created_at);

-- 複合インデックス（再試行処理最適化）
CREATE INDEX IF NOT EXISTS idx_dead_letter_events_retry_processing
ON public.dead_letter_events (status, next_retry_at)
WHERE status IN ('pending', 'retrying');

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_dead_letter_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_dead_letter_events_updated_at_trigger
  BEFORE UPDATE ON public.dead_letter_events
  FOR EACH ROW
  EXECUTE FUNCTION update_dead_letter_events_updated_at();

-- RLS (Row Level Security) 設定
ALTER TABLE public.dead_letter_events ENABLE ROW LEVEL SECURITY;

-- サービスロール用ポリシー（すべての操作を許可）
CREATE POLICY "Service role can access all dead letter events" ON public.dead_letter_events
  FOR ALL USING (
    current_setting('role') = 'service_role'
  );

-- 管理者用ポリシー（読み取り・管理操作）
CREATE POLICY "Admin users can manage dead letter events" ON public.dead_letter_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- コメント追加
COMMENT ON TABLE public.dead_letter_events IS 'Webhookイベント処理失敗時の保存・再処理システム';
COMMENT ON COLUMN public.dead_letter_events.webhook_id IS 'オリジナルWebhookイベントの相関ID';
COMMENT ON COLUMN public.dead_letter_events.payload IS '失敗したWebhookペイロード（JSON形式）';
COMMENT ON COLUMN public.dead_letter_events.error_type IS 'エラー分類: retryable=再試行可能, permanent=永続的エラー, rate_limited=レート制限';
COMMENT ON COLUMN public.dead_letter_events.next_retry_at IS '次回再試行スケジュール時刻';
COMMENT ON COLUMN public.dead_letter_events.expires_at IS '自動削除期限（最大7日間保持）';