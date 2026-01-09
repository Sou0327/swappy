-- Function Search Path Mutable警告修正マイグレーション
-- 全関数にSET search_path = publicを追加してSQLインジェクション対策

-- ================================================
-- 1. マーケット関数の修正
-- ================================================

-- _get_market関数の修正
CREATE OR REPLACE FUNCTION _get_market(p_market text)
RETURNS TABLE(id text, base text, quote text, price_tick numeric, qty_step numeric, min_notional numeric, maker_fee_rate numeric, taker_fee_rate numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    base,
    quote,
    price_tick,
    qty_step,
    min_notional,
    0.0::numeric AS maker_fee_rate,    -- Default maker fee
    0.0015::numeric AS taker_fee_rate  -- Default taker fee
  FROM markets
  WHERE id = p_market AND status = 'active';
$$;

-- ================================================
-- 2. KYC関連関数の修正
-- ================================================

-- get_user_kyc_status関数の修正
CREATE OR REPLACE FUNCTION get_user_kyc_status(target_user_id uuid)
RETURNS kyc_status
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT kyc_status FROM profiles WHERE id = target_user_id;
$$;

-- kyc_required関数の修正
CREATE OR REPLACE FUNCTION kyc_required()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(current_setting('app.kyc_required', true)::boolean, false);
$$;

-- is_kyc_verified関数の修正
CREATE OR REPLACE FUNCTION is_kyc_verified(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        CASE
            WHEN kyc_required() = false THEN true  -- KYC任意の場合は常にtrue
            ELSE kyc_status = 'verified'
        END
    FROM profiles
    WHERE id = target_user_id;
$$;

-- ================================================
-- 2. トリガー関数の修正（updated_at系）
-- ================================================

-- update_deposit_transactions_updated_at関数の修正
CREATE OR REPLACE FUNCTION update_deposit_transactions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- update_kyc_applications_updated_at関数の修正
CREATE OR REPLACE FUNCTION update_kyc_applications_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- update_dead_letter_events_updated_at関数の修正
CREATE OR REPLACE FUNCTION update_dead_letter_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- update_webhook_errors_updated_at関数の修正
CREATE OR REPLACE FUNCTION update_webhook_errors_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- update_master_keys_updated_at関数の修正
CREATE OR REPLACE FUNCTION update_master_keys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- update_subscription_status_updated_at関数の修正
CREATE OR REPLACE FUNCTION update_subscription_status_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ================================================
-- 3. ユーザー資産管理関数の修正
-- ================================================

-- add_user_asset関数の修正
CREATE OR REPLACE FUNCTION add_user_asset(
  p_user_id uuid,
  p_currency text,
  p_initial_balance numeric DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_assets (user_id, currency, balance, locked_balance)
  VALUES (p_user_id, p_currency, p_initial_balance, 0)
  ON CONFLICT (user_id, currency)
  DO UPDATE SET updated_at = now();

  RETURN FOUND;
END;
$$;

-- add_currency_to_all_users関数の修正
CREATE OR REPLACE FUNCTION add_currency_to_all_users(p_currency text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count integer;
BEGIN
  INSERT INTO user_assets (user_id, currency, balance, locked_balance)
  SELECT id, p_currency, 0, 0
  FROM auth.users
  ON CONFLICT (user_id, currency) DO NOTHING;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

-- upsert_user_asset関数の修正
CREATE OR REPLACE FUNCTION upsert_user_asset(
  p_user_id uuid,
  p_currency text,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_assets (user_id, currency, balance, locked_balance)
  VALUES (p_user_id, p_currency, p_amount, 0)
  ON CONFLICT (user_id, currency) DO UPDATE
  SET balance = user_assets.balance + EXCLUDED.balance,
      updated_at = now();
END;
$$;

-- ================================================
-- 4. 通貨変換関数の修正
-- ================================================

-- execute_conversion関数の修正
CREATE OR REPLACE FUNCTION execute_conversion(
  p_user_id uuid,
  p_from_currency text,
  p_to_currency text,
  p_from_amount numeric,
  p_to_amount numeric,
  p_exchange_rate numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_asset_id uuid;
  v_to_asset_id uuid;
  v_current_balance numeric;
BEGIN
  -- 両替元の資産を確認
  SELECT id, balance INTO v_from_asset_id, v_current_balance
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_from_currency;

  IF v_from_asset_id IS NULL THEN
    RAISE EXCEPTION '両替元の通貨が見つかりません: %', p_from_currency;
  END IF;

  IF v_current_balance < p_from_amount THEN
    RAISE EXCEPTION '残高が不足しています。必要: %, 利用可能: %', p_from_amount, v_current_balance;
  END IF;

  -- 両替先の資産を確認（存在しない場合は作成）
  SELECT id INTO v_to_asset_id
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_to_currency;

  IF v_to_asset_id IS NULL THEN
    INSERT INTO user_assets (user_id, currency, balance, locked_balance)
    VALUES (p_user_id, p_to_currency, 0, 0)
    RETURNING id INTO v_to_asset_id;
  END IF;

  -- 両替処理を実行
  BEGIN
    -- 両替元の残高を減らす
    UPDATE user_assets
    SET balance = balance - p_from_amount,
        updated_at = now()
    WHERE id = v_from_asset_id;

    -- 両替先の残高を増やす
    UPDATE user_assets
    SET balance = balance + p_to_amount,
        updated_at = now()
    WHERE id = v_to_asset_id;

    RETURN true;

  EXCEPTION WHEN OTHERS THEN
    -- エラーが発生した場合はロールバック
    RAISE EXCEPTION '両替処理に失敗しました: %', SQLERRM;
  END;
END;
$$;

-- get_user_conversion_history関数の修正
CREATE OR REPLACE FUNCTION get_user_conversion_history(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  from_currency text,
  to_currency text,
  from_amount numeric,
  to_amount numeric,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, from_currency, to_currency, from_amount, to_amount, created_at
  FROM currency_conversions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC;
$$;

-- get_conversion_fee_info関数の修正
CREATE OR REPLACE FUNCTION get_conversion_fee_info(
  p_from_currency text DEFAULT NULL,
  p_to_currency text DEFAULT NULL
)
RETURNS TABLE(
  from_currency text,
  to_currency text,
  fee_percentage numeric,
  minimum_fee numeric,
  maximum_fee numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cf.from_currency, cf.to_currency, cf.fee_percentage,
         cf.minimum_fee, cf.maximum_fee
  FROM conversion_fees cf
  WHERE cf.is_active = true
  AND (p_from_currency IS NULL OR cf.from_currency = p_from_currency)
  AND (p_to_currency IS NULL OR cf.to_currency = p_to_currency)
  ORDER BY cf.from_currency, cf.to_currency;
$$;

-- calculate_conversion_fee関数の修正
CREATE OR REPLACE FUNCTION calculate_conversion_fee(
  p_from_currency text,
  p_to_currency text,
  p_from_amount numeric
)
RETURNS TABLE(
  fee_amount numeric,
  fee_percentage numeric,
  net_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee_percentage numeric := 0.001; -- デフォルト 0.1%
  v_minimum_fee numeric := 0;
  v_maximum_fee numeric := NULL;
  v_calculated_fee numeric;
BEGIN
  -- 通貨ペア固有の手数料設定を取得
  SELECT cf.fee_percentage, cf.minimum_fee, cf.maximum_fee
  INTO v_fee_percentage, v_minimum_fee, v_maximum_fee
  FROM conversion_fees cf
  WHERE cf.from_currency = p_from_currency
  AND cf.to_currency = p_to_currency
  AND cf.is_active = true;

  -- 設定が見つからない場合はデフォルト値を使用
  IF v_fee_percentage IS NULL THEN
    v_fee_percentage := 0.001;
    v_minimum_fee := 0;
    v_maximum_fee := NULL;
  END IF;

  -- 手数料計算
  v_calculated_fee := p_from_amount * v_fee_percentage;

  -- 最小手数料の適用
  IF v_calculated_fee < v_minimum_fee THEN
    v_calculated_fee := v_minimum_fee;
  END IF;

  -- 最大手数料の適用
  IF v_maximum_fee IS NOT NULL AND v_calculated_fee > v_maximum_fee THEN
    v_calculated_fee := v_maximum_fee;
  END IF;

  RETURN QUERY SELECT
    v_calculated_fee as fee_amount,
    v_fee_percentage as fee_percentage,
    p_from_amount - v_calculated_fee as net_amount;
END;
$$;

-- execute_conversion_with_fee関数の修正
CREATE OR REPLACE FUNCTION execute_conversion_with_fee(
  p_user_id uuid,
  p_from_currency text,
  p_to_currency text,
  p_from_amount numeric,
  p_to_amount numeric,
  p_exchange_rate numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_asset_id uuid;
  v_to_asset_id uuid;
  v_current_balance numeric;
  v_fee_info record;
  v_net_from_amount numeric;
  v_actual_to_amount numeric;
  v_conversion_id uuid;
BEGIN
  -- 手数料計算
  SELECT fee_amount, fee_percentage, net_amount
  INTO v_fee_info
  FROM calculate_conversion_fee(p_from_currency, p_to_currency, p_from_amount);

  v_net_from_amount := v_fee_info.net_amount;
  v_actual_to_amount := v_net_from_amount * p_exchange_rate;

  -- 両替元の資産を確認
  SELECT id, balance INTO v_from_asset_id, v_current_balance
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_from_currency;

  IF v_from_asset_id IS NULL THEN
    RAISE EXCEPTION '両替元の通貨が見つかりません: %', p_from_currency;
  END IF;

  IF v_current_balance < p_from_amount THEN
    RAISE EXCEPTION '残高が不足しています。必要: %, 利用可能: %', p_from_amount, v_current_balance;
  END IF;

  -- 両替先の資産を確認（存在しない場合は作成）
  SELECT id INTO v_to_asset_id
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_to_currency;

  IF v_to_asset_id IS NULL THEN
    INSERT INTO user_assets (user_id, currency, balance, locked_balance)
    VALUES (p_user_id, p_to_currency, 0, 0)
    RETURNING id INTO v_to_asset_id;
  END IF;

  -- 両替処理を実行
  BEGIN
    -- 両替元の残高を減らす（手数料込み）
    UPDATE user_assets
    SET balance = balance - p_from_amount,
        updated_at = now()
    WHERE id = v_from_asset_id;

    -- 両替先の残高を増やす（手数料差し引き後）
    UPDATE user_assets
    SET balance = balance + v_actual_to_amount,
        updated_at = now()
    WHERE id = v_to_asset_id;

    -- 両替履歴を記録（手数料情報も含む）
    INSERT INTO currency_conversions (
      user_id, from_currency, to_currency,
      from_amount, to_amount, exchange_rate,
      status, fee_amount, fee_percentage
    ) VALUES (
      p_user_id, p_from_currency, p_to_currency,
      p_from_amount, v_actual_to_amount, p_exchange_rate,
      'completed', v_fee_info.fee_amount, v_fee_info.fee_percentage
    ) RETURNING id INTO v_conversion_id;

    -- ledger_entriesにも記録を追加（ダッシュボード表示との同期のため）
    -- 両替元のエントリ（減額：手数料込み）
    INSERT INTO ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
    VALUES (p_user_id, p_from_currency, -p_from_amount, 0, 'adj', 'conversion', v_conversion_id);

    -- 両替先のエントリ（増額：手数料差し引き後）
    INSERT INTO ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
    VALUES (p_user_id, p_to_currency, v_actual_to_amount, 0, 'adj', 'conversion', v_conversion_id);

    -- 結果を返す
    RETURN json_build_object(
      'success', true,
      'conversion_id', v_conversion_id,
      'from_amount', p_from_amount,
      'fee_amount', v_fee_info.fee_amount,
      'fee_percentage', v_fee_info.fee_percentage,
      'net_from_amount', v_net_from_amount,
      'to_amount', v_actual_to_amount,
      'exchange_rate', p_exchange_rate
    );

  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '両替処理に失敗しました: %', SQLERRM;
  END;
END;
$$;

-- ================================================
-- 5. 通知関数の修正
-- ================================================

-- mark_notification_as_read関数の修正
CREATE OR REPLACE FUNCTION mark_notification_as_read(notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications
  SET read = true, updated_at = now()
  WHERE id = notification_id AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

-- mark_all_notifications_as_read関数の修正
CREATE OR REPLACE FUNCTION mark_all_notifications_as_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE notifications
  SET read = true, updated_at = now()
  WHERE user_id = auth.uid() AND read = false;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

-- ================================================
-- 6. ウォレット管理関数の修正
-- ================================================

-- get_active_wallet_root関数の修正
CREATE OR REPLACE FUNCTION get_active_wallet_root(
  p_chain text,
  p_network text,
  p_asset text
)
RETURNS TABLE(
  id uuid,
  xpub text,
  derivation_path text,
  master_key_id uuid,
  auto_generated boolean,
  legacy_data boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 新システム（auto_generated）を優先
  RETURN QUERY
  SELECT
    wr.id,
    wr.xpub,
    wr.derivation_path,
    wr.master_key_id,
    wr.auto_generated,
    wr.legacy_data
  FROM wallet_roots wr
  WHERE
    wr.chain = p_chain AND
    wr.network = p_network AND
    wr.asset = p_asset AND
    wr.active = true AND
    wr.auto_generated = true
  ORDER BY wr.created_at ASC
  LIMIT 1;

  -- 新システムにない場合はレガシーを返す
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      wr.id,
      wr.xpub,
      wr.derivation_path,
      wr.master_key_id,
      wr.auto_generated,
      wr.legacy_data
    FROM wallet_roots wr
    WHERE
      wr.chain = p_chain AND
      wr.network = p_network AND
      wr.asset = p_asset AND
      wr.active = true AND
      wr.auto_generated = false
    ORDER BY wr.created_at ASC
    LIMIT 1;
  END IF;
END;
$$;

-- ================================================
-- 7. 修正完了ログ
-- ================================================

INSERT INTO audit_logs (
    action,
    resource,
    resource_id,
    details
) VALUES (
    'SECURITY_UPDATE',
    'function_search_path',
    'search_path_fixes_20250927',
    jsonb_build_object(
        'fixed_functions', ARRAY[
            '_get_market', 'get_user_kyc_status', 'kyc_required', 'is_kyc_verified',
            'update_deposit_transactions_updated_at', 'update_kyc_applications_updated_at',
            'update_dead_letter_events_updated_at', 'update_webhook_errors_updated_at',
            'update_master_keys_updated_at', 'update_subscription_status_updated_at',
            'add_user_asset', 'add_currency_to_all_users', 'upsert_user_asset',
            'execute_conversion', 'get_user_conversion_history', 'get_conversion_fee_info',
            'calculate_conversion_fee', 'execute_conversion_with_fee',
            'mark_notification_as_read', 'mark_all_notifications_as_read',
            'get_active_wallet_root'
        ],
        'security_improvement', 'SET search_path = public追加でSQLインジェクション対策完了',
        'total_functions_fixed', 21
    )
);