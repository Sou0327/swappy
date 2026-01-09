-- テンプレートに手動送信許可フラグを追加
-- システム自動送信用のテンプレートと管理者手動送信用のテンプレートを区別

-- manual_send_allowedカラムを追加
ALTER TABLE notification_templates
ADD COLUMN IF NOT EXISTS manual_send_allowed boolean NOT NULL DEFAULT false;

-- 既存テンプレートの設定を更新
-- security_alertのみ手動送信を許可
UPDATE notification_templates
SET manual_send_allowed = true
WHERE template_key = 'security_alert';

-- その他のテンプレート（システム自動送信用）は手動送信不可
UPDATE notification_templates
SET manual_send_allowed = false
WHERE template_key IN (
  'deposit_completed',
  'withdrawal_approved',
  'withdrawal_completed',
  'kyc_approved',
  'kyc_rejected',
  'trade_executed'
);

-- インデックスを追加（パフォーマンス最適化）
CREATE INDEX IF NOT EXISTS idx_notification_templates_manual_send
ON notification_templates(manual_send_allowed)
WHERE active = true;

-- コメント追加
COMMENT ON COLUMN notification_templates.manual_send_allowed IS '管理画面からの手動送信を許可するかどうか。false の場合はシステム自動送信専用。';
