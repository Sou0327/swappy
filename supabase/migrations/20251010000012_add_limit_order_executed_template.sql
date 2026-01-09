-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 指値注文約定通知テンプレートの追加
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- 概要：
-- limit-order-monitor Edge Functionで使用する指値注文約定通知テンプレートを追加します。
-- 既存の自動通知テンプレート（auto_trade_executed等）と同様の構造を持ちます。
--
-- 利用シーン：
-- - 指値注文が市場価格条件を満たして約定した際の成功通知
-- - Edge Functionから自動生成される通知メッセージ
--
-- 変数：
-- - market: 市場名（例: BTC/USDT）
-- - side: 注文種別（買い/売り）
-- - quantity: 約定数量
-- - executed_price: 約定価格
-- - limit_price: 指値価格
-- - order_id: 注文ID
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 指値注文約定通知テンプレートの追加
INSERT INTO notification_templates (
  template_key,
  name,
  notification_type,
  title_template,
  message_template,
  variables,
  manual_send_allowed,
  description,
  created_at,
  updated_at
) VALUES (
  'limit_order_executed',
  '[自動] 指値注文約定通知',
  'success',
  '指値注文が約定しました',
  '市場: {{market}}
種類: {{side}}注文
数量: {{quantity}}
約定価格: {{executed_price}}
指値価格: {{limit_price}}
注文ID: {{order_id}}

ご指定いただいた価格条件で注文が正常に約定されました。',
  '["market", "side", "quantity", "executed_price", "limit_price", "order_id"]'::jsonb,
  false,  -- 手動送信不可（システム自動生成のみ）
  '指値注文が市場価格条件を満たして約定した際に自動送信される通知テンプレート',
  NOW(),
  NOW()
)
ON CONFLICT (template_key) DO UPDATE SET
  name = EXCLUDED.name,
  notification_type = EXCLUDED.notification_type,
  title_template = EXCLUDED.title_template,
  message_template = EXCLUDED.message_template,
  variables = EXCLUDED.variables,
  manual_send_allowed = EXCLUDED.manual_send_allowed,
  description = EXCLUDED.description,
  updated_at = NOW();

-- コメント追加
COMMENT ON COLUMN notification_templates.template_key IS 'テンプレート識別キー。limit_order_executedは指値注文約定通知用';
