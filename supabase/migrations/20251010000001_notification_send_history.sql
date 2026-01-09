-- 通知送信履歴テーブル
-- 管理者が送信した通知の履歴を記録し、トレーサビリティを確保

CREATE TABLE IF NOT EXISTS public.notification_send_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 送信者情報
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 送信内容
  template_key text REFERENCES public.notification_templates(template_key) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL,
  category text,

  -- 送信先情報
  is_broadcast boolean NOT NULL DEFAULT false,
  target_role text CHECK (target_role IN ('all', 'user', 'moderator', 'admin')),
  target_user_ids jsonb, -- 個別送信の場合のユーザーIDリスト

  -- 送信結果
  status text NOT NULL CHECK (status IN ('success', 'partial', 'failed')) DEFAULT 'success',
  notifications_sent integer NOT NULL DEFAULT 0,
  notifications_failed integer NOT NULL DEFAULT 0,
  error_message text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_notification_send_history_sent_by
  ON public.notification_send_history(sent_by);

CREATE INDEX IF NOT EXISTS idx_notification_send_history_created_at
  ON public.notification_send_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_send_history_template_key
  ON public.notification_send_history(template_key);

CREATE INDEX IF NOT EXISTS idx_notification_send_history_status
  ON public.notification_send_history(status);

-- RLSポリシー設定
ALTER TABLE public.notification_send_history ENABLE ROW LEVEL SECURITY;

-- 管理者とモデレーターのみ履歴を閲覧可能
CREATE POLICY notification_send_history_admin_select_policy
  ON public.notification_send_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- コメント追加
COMMENT ON TABLE public.notification_send_history IS '通知送信履歴（トレーサビリティと監査用）';
COMMENT ON COLUMN public.notification_send_history.sent_by IS '送信した管理者のユーザーID';
COMMENT ON COLUMN public.notification_send_history.template_key IS '使用したテンプレート（nullの場合は直接入力）';
COMMENT ON COLUMN public.notification_send_history.is_broadcast IS '一斉送信かどうか';
COMMENT ON COLUMN public.notification_send_history.target_role IS '一斉送信の対象ロール';
COMMENT ON COLUMN public.notification_send_history.target_user_ids IS '個別送信のユーザーIDリスト（JSON配列）';
COMMENT ON COLUMN public.notification_send_history.status IS '送信ステータス: success（全成功）, partial（一部失敗）, failed（全失敗）';
COMMENT ON COLUMN public.notification_send_history.notifications_sent IS '送信成功件数';
COMMENT ON COLUMN public.notification_send_history.notifications_failed IS '送信失敗件数';
