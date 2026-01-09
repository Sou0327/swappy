-- メール送信システム
-- メールキュー、送信ログ、ユーザー設定を管理

-- 1. email_queue テーブル（メール送信キュー）
CREATE TABLE IF NOT EXISTS public.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type text NOT NULL CHECK (email_type IN (
    'welcome',
    'password_reset',
    'deposit_confirmation',
    'withdrawal_confirmation',
    'kyc_approved',
    'kyc_rejected',
    'referral_reward',
    'security_alert'
  )),
  recipient_email text NOT NULL,
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed')) DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  error_message text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. email_logs テーブル（メール送信履歴）
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email_type text NOT NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message text,
  resend_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. email_preferences テーブル（ユーザーのメール設定）
CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  welcome_emails boolean NOT NULL DEFAULT true,
  transaction_emails boolean NOT NULL DEFAULT true,
  kyc_emails boolean NOT NULL DEFAULT true,
  referral_emails boolean NOT NULL DEFAULT true,
  marketing_emails boolean NOT NULL DEFAULT false,
  security_alerts boolean NOT NULL DEFAULT true, -- 常にtrue（必須）
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. インデックス作成
CREATE INDEX IF NOT EXISTS idx_email_queue_status_scheduled ON public.email_queue(status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_user_id ON public.email_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_created_at ON public.email_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON public.email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON public.email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);

-- 5. RLSポリシー設定
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- email_queue: ユーザーは自分のキューのみ閲覧可能
CREATE POLICY email_queue_select_own
  ON public.email_queue
  FOR SELECT
  USING (user_id = auth.uid());

-- email_queue: 管理者は全て閲覧可能
CREATE POLICY email_queue_admin_select
  ON public.email_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- email_logs: ユーザーは自分のログのみ閲覧可能
CREATE POLICY email_logs_select_own
  ON public.email_logs
  FOR SELECT
  USING (user_id = auth.uid());

-- email_logs: 管理者は全てのログを閲覧可能
CREATE POLICY email_logs_admin_all
  ON public.email_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- email_preferences: ユーザーは自分の設定のみ閲覧・更新可能
CREATE POLICY email_preferences_select_own
  ON public.email_preferences
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY email_preferences_update_own
  ON public.email_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- email_preferences: 管理者は全て閲覧可能
CREATE POLICY email_preferences_admin_select
  ON public.email_preferences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- 6. トリガー関数: 新規ユーザーのメール設定を自動作成
CREATE OR REPLACE FUNCTION public.create_email_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_email_preferences_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_email_preferences();

-- 7. トリガー関数: email_preferences の updated_at 自動更新
CREATE TRIGGER update_email_preferences_updated_at
  BEFORE UPDATE ON public.email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 8. ヘルパー関数: メールキューに挿入
CREATE OR REPLACE FUNCTION public.queue_email(
  p_user_id uuid,
  p_email_type text,
  p_recipient_email text,
  p_template_data jsonb DEFAULT '{}'::jsonb,
  p_scheduled_at timestamptz DEFAULT now()
)
RETURNS uuid AS $$
DECLARE
  v_queue_id uuid;
  v_preferences record;
BEGIN
  -- ユーザーのメール設定を確認
  SELECT * INTO v_preferences
  FROM public.email_preferences
  WHERE user_id = p_user_id;

  -- 設定がない場合はデフォルトで許可
  IF NOT FOUND THEN
    v_preferences := ROW(p_user_id, true, true, true, true, false, true, now(), now());
  END IF;

  -- メールタイプごとの設定チェック
  CASE p_email_type
    WHEN 'welcome' THEN
      IF NOT v_preferences.welcome_emails THEN RETURN NULL; END IF;
    WHEN 'deposit_confirmation', 'withdrawal_confirmation' THEN
      IF NOT v_preferences.transaction_emails THEN RETURN NULL; END IF;
    WHEN 'kyc_approved', 'kyc_rejected' THEN
      IF NOT v_preferences.kyc_emails THEN RETURN NULL; END IF;
    WHEN 'referral_reward' THEN
      IF NOT v_preferences.referral_emails THEN RETURN NULL; END IF;
    WHEN 'security_alert' THEN
      -- セキュリティアラートは常に送信（設定無視）
      NULL;
    ELSE
      -- 不明なタイプはスキップ
      RETURN NULL;
  END CASE;

  -- キューに挿入
  INSERT INTO public.email_queue (
    user_id,
    email_type,
    recipient_email,
    template_data,
    scheduled_at
  )
  VALUES (
    p_user_id,
    p_email_type,
    p_recipient_email,
    p_template_data,
    p_scheduled_at
  )
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. コメント追加
COMMENT ON TABLE public.email_queue IS 'メール送信キュー（非同期処理用）';
COMMENT ON TABLE public.email_logs IS 'メール送信履歴とデバッグログ';
COMMENT ON TABLE public.email_preferences IS 'ユーザーのメール受信設定';

COMMENT ON COLUMN public.email_queue.email_type IS 'メールの種類（welcome, deposit_confirmation等）';
COMMENT ON COLUMN public.email_queue.template_data IS 'テンプレート変数（JSON形式）';
COMMENT ON COLUMN public.email_queue.status IS 'ステータス: pending（待機）, processing（処理中）, sent（送信済）, failed（失敗）';
COMMENT ON COLUMN public.email_queue.retry_count IS '現在のリトライ回数';
COMMENT ON COLUMN public.email_queue.scheduled_at IS '送信予定時刻';

COMMENT ON COLUMN public.email_logs.resend_message_id IS 'Resend APIから返されたメッセージID';
COMMENT ON COLUMN public.email_preferences.security_alerts IS 'セキュリティアラート（常にtrue、変更不可）';

COMMENT ON FUNCTION public.queue_email IS 'メールをキューに追加（ユーザー設定を考慮）';