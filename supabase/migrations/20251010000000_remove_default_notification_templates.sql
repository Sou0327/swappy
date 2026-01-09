-- デフォルト通知テンプレートを削除
-- これらのテンプレートはもう使用されないため、データベースから削除

DELETE FROM notification_templates
WHERE template_key IN (
  'kyc_rejected',
  'kyc_approved',
  'security_alert',
  'deposit_completed',
  'withdrawal_completed',
  'withdrawal_approved',
  'trade_executed'
);
