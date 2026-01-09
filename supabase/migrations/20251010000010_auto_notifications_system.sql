-- 自動通知システムの実装
-- 入金完了、KYC承認/却下、取引実行、出金完了時の自動通知
-- セキュリティ強化: SET search_path指定
-- テンプレート分離: テンプレートテーブルから本文を取得

-- 1. 自動通知用テンプレートの作成（手動送信不可）
INSERT INTO public.notification_templates (
  template_key,
  name,
  description,
  title_template,
  message_template,
  notification_type,
  variables,
  active,
  manual_send_allowed
) VALUES
  (
    'auto_deposit_completed',
    '[自動] 入金完了通知',
    '入金が確認され、残高に反映された時の自動通知',
    '入金が完了しました',
    '{{amount}} {{currency}}の入金が確認されました。残高に反映されています。',
    'success',
    '["amount", "currency", "transaction_hash"]'::jsonb,
    true,
    false  -- 手動送信不可
  ),
  (
    'auto_withdrawal_completed',
    '[自動] 出金完了通知',
    '出金が完了した時の自動通知',
    '出金が完了しました',
    '{{amount}} {{currency}}の出金が完了しました。',
    'success',
    '["amount", "currency", "transaction_hash"]'::jsonb,
    true,
    false  -- 手動送信不可
  ),
  (
    'auto_kyc_approved',
    '[自動] KYC承認通知',
    'KYC申請が承認された時の自動通知',
    'KYC申請が承認されました',
    '本人確認（KYC）が完了しました。すべての機能をご利用いただけます。',
    'success',
    '[]'::jsonb,
    true,
    false  -- 手動送信不可
  ),
  (
    'auto_kyc_rejected',
    '[自動] KYC却下通知',
    'KYC申請が却下された時の自動通知',
    'KYC申請が却下されました',
    '本人確認（KYC）申請が却下されました。{{reason}}',
    'warning',
    '["reason"]'::jsonb,
    true,
    false  -- 手動送信不可
  ),
  (
    'auto_trade_executed',
    '[自動] 取引実行通知',
    '取引が約定した時の自動通知',
    '取引が実行されました',
    '{{market}}で注文が約定しました。数量：{{quantity}}、価格：{{price}}',
    'info',
    '["market", "quantity", "price", "trade_id"]'::jsonb,
    true,
    false  -- 手動送信不可
  )
ON CONFLICT (template_key) DO NOTHING;

-- 2. テンプレート変数置換関数
CREATE OR REPLACE FUNCTION public.replace_template_variables(
  template_text text,
  variables jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result text;
  key text;
  value text;
BEGIN
  result := template_text;

  -- JSONB内の各キーバリューペアで置換
  FOR key, value IN SELECT * FROM jsonb_each_text(variables)
  LOOP
    result := replace(result, '{{' || key || '}}', value);
  END LOOP;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.replace_template_variables(text, jsonb) IS 'テンプレート内の{{variable}}形式のプレースホルダーを実際の値に置換';

-- 3. 入金完了時の自動通知トリガー関数
CREATE OR REPLACE FUNCTION public.notify_deposit_completed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  template_rec record;
  title_text text;
  message_text text;
  template_vars jsonb;
BEGIN
  -- statusが'confirmed'に変更された場合のみ通知
  IF OLD.status IS DISTINCT FROM 'confirmed' AND NEW.status = 'confirmed' THEN
    -- テンプレートを取得
    SELECT title_template, message_template, notification_type
    INTO template_rec
    FROM public.notification_templates
    WHERE template_key = 'auto_deposit_completed' AND active = true;

    -- テンプレートが見つからない場合は処理をスキップ
    IF NOT FOUND THEN
      RAISE WARNING 'Template auto_deposit_completed not found or inactive';
      RETURN NEW;
    END IF;

    -- 変数を準備
    template_vars := jsonb_build_object(
      'amount', NEW.amount::text,
      'currency', NEW.currency,
      'transaction_hash', COALESCE(NEW.transaction_hash, 'N/A')
    );

    -- テンプレート変数を置換
    title_text := public.replace_template_variables(template_rec.title_template, template_vars);
    message_text := public.replace_template_variables(template_rec.message_template, template_vars);

    -- 通知を作成
    INSERT INTO public.notifications (user_id, title, message, type, read, category)
    VALUES (
      NEW.user_id,
      title_text,
      message_text,
      template_rec.notification_type,
      false,
      'deposit'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 入金完了トリガーの設定
DROP TRIGGER IF EXISTS trigger_notify_deposit_completed ON public.deposits;
CREATE TRIGGER trigger_notify_deposit_completed
  AFTER UPDATE ON public.deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_deposit_completed();

COMMENT ON FUNCTION public.notify_deposit_completed() IS '入金完了時に自動でユーザーに通知を送信（テンプレート使用）';

-- 4. 出金完了時の自動通知トリガー関数
CREATE OR REPLACE FUNCTION public.notify_withdrawal_completed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  template_rec record;
  title_text text;
  message_text text;
  template_vars jsonb;
BEGIN
  -- statusが'confirmed'に変更された場合のみ通知
  IF OLD.status IS DISTINCT FROM 'confirmed' AND NEW.status = 'confirmed' THEN
    -- テンプレートを取得
    SELECT title_template, message_template, notification_type
    INTO template_rec
    FROM public.notification_templates
    WHERE template_key = 'auto_withdrawal_completed' AND active = true;

    -- テンプレートが見つからない場合は処理をスキップ
    IF NOT FOUND THEN
      RAISE WARNING 'Template auto_withdrawal_completed not found or inactive';
      RETURN NEW;
    END IF;

    -- 変数を準備
    template_vars := jsonb_build_object(
      'amount', NEW.amount::text,
      'currency', NEW.currency,
      'transaction_hash', COALESCE(NEW.transaction_hash, 'N/A')
    );

    -- テンプレート変数を置換
    title_text := public.replace_template_variables(template_rec.title_template, template_vars);
    message_text := public.replace_template_variables(template_rec.message_template, template_vars);

    -- 通知を作成
    INSERT INTO public.notifications (user_id, title, message, type, read, category)
    VALUES (
      NEW.user_id,
      title_text,
      message_text,
      template_rec.notification_type,
      false,
      'withdrawal'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 出金完了トリガーの設定
DROP TRIGGER IF EXISTS trigger_notify_withdrawal_completed ON public.withdrawals;
CREATE TRIGGER trigger_notify_withdrawal_completed
  AFTER UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_withdrawal_completed();

COMMENT ON FUNCTION public.notify_withdrawal_completed() IS '出金完了時に自動でユーザーに通知を送信（テンプレート使用）';

-- 5. KYCステータス変更時の自動通知トリガー関数
CREATE OR REPLACE FUNCTION public.notify_kyc_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  template_rec record;
  title_text text;
  message_text text;
  template_vars jsonb;
  template_key_name text;
BEGIN
  -- kyc_statusが変更された場合のみ通知
  IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
    -- 承認または却下の場合のみ処理
    IF NEW.kyc_status = 'verified' THEN
      template_key_name := 'auto_kyc_approved';
      template_vars := '{}'::jsonb;
    ELSIF NEW.kyc_status = 'rejected' THEN
      template_key_name := 'auto_kyc_rejected';
      template_vars := jsonb_build_object(
        'reason', CASE
          WHEN NEW.kyc_notes IS NOT NULL AND NEW.kyc_notes != '' THEN '理由: ' || NEW.kyc_notes
          ELSE 'サポートにお問い合わせください。'
        END
      );
    ELSE
      -- verified/rejected以外のステータス変更は通知しない
      RETURN NEW;
    END IF;

    -- テンプレートを取得
    SELECT title_template, message_template, notification_type
    INTO template_rec
    FROM public.notification_templates
    WHERE template_key = template_key_name AND active = true;

    -- テンプレートが見つからない場合は処理をスキップ
    IF NOT FOUND THEN
      RAISE WARNING 'Template % not found or inactive', template_key_name;
      RETURN NEW;
    END IF;

    -- テンプレート変数を置換
    title_text := public.replace_template_variables(template_rec.title_template, template_vars);
    message_text := public.replace_template_variables(template_rec.message_template, template_vars);

    -- 通知を作成
    INSERT INTO public.notifications (user_id, title, message, type, read, category)
    VALUES (
      NEW.id,
      title_text,
      message_text,
      template_rec.notification_type,
      false,
      'kyc'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- KYCステータス変更トリガーの設定
DROP TRIGGER IF EXISTS trigger_notify_kyc_status_change ON public.profiles;
CREATE TRIGGER trigger_notify_kyc_status_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_kyc_status_change();

COMMENT ON FUNCTION public.notify_kyc_status_change() IS 'KYCステータス変更時に自動でユーザーに通知を送信（テンプレート使用）';

-- 6. 取引実行時の自動通知トリガー関数
CREATE OR REPLACE FUNCTION public.notify_trade_executed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  taker_user_id uuid;
  maker_user_id uuid;
  template_rec record;
  title_text text;
  message_text text;
  template_vars jsonb;
BEGIN
  -- taker_order_idとmaker_order_idからuser_idを取得
  SELECT user_id INTO taker_user_id
  FROM public.orders
  WHERE id = NEW.taker_order_id;

  SELECT user_id INTO maker_user_id
  FROM public.orders
  WHERE id = NEW.maker_order_id;

  -- テンプレートを取得
  SELECT title_template, message_template, notification_type
  INTO template_rec
  FROM public.notification_templates
  WHERE template_key = 'auto_trade_executed' AND active = true;

  -- テンプレートが見つからない場合は処理をスキップ
  IF NOT FOUND THEN
    RAISE WARNING 'Template auto_trade_executed not found or inactive';
    RETURN NEW;
  END IF;

  -- 変数を準備
  template_vars := jsonb_build_object(
    'market', NEW.market,
    'quantity', NEW.qty::text,
    'price', NEW.price::text,
    'trade_id', NEW.id::text
  );

  -- テンプレート変数を置換
  title_text := public.replace_template_variables(template_rec.title_template, template_vars);
  message_text := public.replace_template_variables(template_rec.message_template, template_vars);

  -- Taker（注文を出した側）への通知
  IF taker_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, read, category)
    VALUES (
      taker_user_id,
      title_text,
      message_text,
      template_rec.notification_type,
      false,
      'trade'
    );
  END IF;

  -- Maker（指値注文で待っていた側）への通知
  IF maker_user_id IS NOT NULL AND maker_user_id != taker_user_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, read, category)
    VALUES (
      maker_user_id,
      title_text,
      message_text,
      template_rec.notification_type,
      false,
      'trade'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 取引実行トリガーの設定
DROP TRIGGER IF EXISTS trigger_notify_trade_executed ON public.trades;
CREATE TRIGGER trigger_notify_trade_executed
  AFTER INSERT ON public.trades
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_trade_executed();

COMMENT ON FUNCTION public.notify_trade_executed() IS '取引実行時に自動でTakerとMakerの両方に通知を送信（テンプレート使用）';
