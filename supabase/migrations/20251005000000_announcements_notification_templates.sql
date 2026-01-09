-- お知らせ・通知システムの拡張
-- お知らせ（announcements）とテンプレート管理機能

-- 1. お知らせテーブル（全体向け・重要なお知らせ）
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL CHECK (category IN ('maintenance', 'feature', 'warning', 'info', 'event')),
  importance text NOT NULL CHECK (importance IN ('low', 'normal', 'high', 'critical')) DEFAULT 'normal',
  published boolean NOT NULL DEFAULT false,
  publish_at timestamptz,
  expire_at timestamptz,
  target_user_role text CHECK (target_user_role IN ('all', 'user', 'moderator', 'admin')) DEFAULT 'all',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- お知らせテーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.announcements(published, publish_at, expire_at);
CREATE INDEX IF NOT EXISTS idx_announcements_category ON public.announcements(category);
CREATE INDEX IF NOT EXISTS idx_announcements_importance ON public.announcements(importance);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON public.announcements(created_at DESC);

-- お知らせテーブルのRLSポリシー
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- ユーザーは公開済みのお知らせを閲覧可能
CREATE POLICY announcements_select_policy
  ON public.announcements
  FOR SELECT
  USING (
    published = true
    AND (publish_at IS NULL OR publish_at <= now())
    AND (expire_at IS NULL OR expire_at > now())
  );

-- 管理者はすべてのお知らせを管理可能
CREATE POLICY announcements_admin_all_policy
  ON public.announcements
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

-- 2. 通知テンプレートテーブル
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  title_template text NOT NULL,
  message_template text NOT NULL,
  notification_type text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb, -- プレースホルダー変数のリスト
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- テンプレートテーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_notification_templates_key ON public.notification_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON public.notification_templates(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_active ON public.notification_templates(active);

-- テンプレートテーブルのRLSポリシー
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

-- すべてのユーザーはアクティブなテンプレートを参照可能（通知生成用）
CREATE POLICY notification_templates_select_policy
  ON public.notification_templates
  FOR SELECT
  USING (active = true);

-- 管理者のみテンプレートを管理可能
CREATE POLICY notification_templates_admin_policy
  ON public.notification_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- 3. 既存notificationsテーブルにカテゴリカラム追加（存在しない場合）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notifications'
        AND column_name = 'category'
    ) THEN
        ALTER TABLE public.notifications
        ADD COLUMN category text CHECK (category IN ('system', 'deposit', 'withdrawal', 'trade', 'kyc', 'security', 'announcement'));
    END IF;
END $$;

-- 4. デフォルト通知テンプレートの挿入
INSERT INTO public.notification_templates (template_key, name, description, title_template, message_template, notification_type, variables) VALUES
  (
    'deposit_completed',
    '入金完了通知',
    '入金が確認され、残高に反映された時の通知',
    '入金が完了しました',
    '{{amount}} {{currency}}の入金が確認されました。残高に反映されています。',
    'deposit_completed',
    '["amount", "currency", "transaction_hash"]'::jsonb
  ),
  (
    'withdrawal_approved',
    '出金承認通知',
    '出金リクエストが承認された時の通知',
    '出金が承認されました',
    '{{amount}} {{currency}}の出金リクエストが承認されました。処理中です。',
    'withdrawal_approved',
    '["amount", "currency", "request_id"]'::jsonb
  ),
  (
    'withdrawal_completed',
    '出金完了通知',
    '出金が完了した時の通知',
    '出金が完了しました',
    '{{amount}} {{currency}}の出金が完了しました。',
    'withdrawal_completed',
    '["amount", "currency", "transaction_hash"]'::jsonb
  ),
  (
    'kyc_approved',
    'KYC承認通知',
    'KYC申請が承認された時の通知',
    'KYC申請が承認されました',
    '本人確認（KYC）が完了しました。すべての機能をご利用いただけます。',
    'kyc_approved',
    '[]'::jsonb
  ),
  (
    'kyc_rejected',
    'KYC却下通知',
    'KYC申請が却下された時の通知',
    'KYC申請が却下されました',
    '本人確認（KYC）申請が却下されました。理由：{{reason}}',
    'kyc_rejected',
    '["reason"]'::jsonb
  ),
  (
    'trade_executed',
    '取引実行通知',
    '取引が約定した時の通知',
    '取引が実行されました',
    '{{market}}で{{side}}注文が約定しました。数量：{{quantity}}、価格：{{price}}',
    'trade_executed',
    '["market", "side", "quantity", "price", "trade_id"]'::jsonb
  ),
  (
    'security_alert',
    'セキュリティアラート',
    'セキュリティ関連の重要な通知',
    'セキュリティアラート',
    '{{alert_message}}',
    'security_alert',
    '["alert_message", "alert_type"]'::jsonb
  )
ON CONFLICT (template_key) DO NOTHING;

-- 5. 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 6. コメント追加
COMMENT ON TABLE public.announcements IS '全体向けお知らせ管理（メンテナンス情報、新機能アナウンス等）';
COMMENT ON TABLE public.notification_templates IS '通知テンプレート管理（プレースホルダー置換による動的通知生成）';
COMMENT ON COLUMN public.announcements.category IS 'お知らせカテゴリ: maintenance, feature, warning, info, event';
COMMENT ON COLUMN public.announcements.importance IS '重要度: low, normal, high, critical';
COMMENT ON COLUMN public.announcements.target_user_role IS '対象ユーザー: all, user, moderator, admin';
COMMENT ON COLUMN public.notification_templates.variables IS 'テンプレート内で使用可能な変数のリスト（JSON配列）';

-- 7. 通知既読処理用RPC関数

-- 既存の関数を削除（戻り値の型を変更するため）
DROP FUNCTION IF EXISTS public.mark_notification_as_read(uuid);
DROP FUNCTION IF EXISTS public.mark_all_notifications_as_read();

-- 単一通知を既読にする
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.notifications
  SET read = true, updated_at = now()
  WHERE id = notification_id AND user_id = auth.uid();
END;
$$;

-- 全通知を既読にする
CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.notifications
  SET read = true, updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

-- RPC関数の権限設定
GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read() TO authenticated;