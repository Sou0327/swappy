-- execute_conversion関数の修正：locked_balanceを考慮した残高チェック
-- 問題：balance のみをチェックしているため、出金申請でロックされた資金も両替可能になっている
-- 修正：balance - locked_balance で利用可能残高を計算し、それをチェックする

-- 既存関数を削除
DROP FUNCTION IF EXISTS public.execute_conversion(uuid, text, text, numeric, numeric, numeric);

-- 新しい定義で作成（locked_balanceを考慮）
CREATE FUNCTION public.execute_conversion(
  p_user_id UUID,
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_from_amount NUMERIC,
  p_to_amount NUMERIC,
  p_exchange_rate NUMERIC
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_asset_id UUID;
  v_to_asset_id UUID;
  v_current_balance NUMERIC;
  v_current_locked NUMERIC;
  v_available_balance NUMERIC;
BEGIN
  -- 🔒 両替元の残高とロック残高をロック付きで取得
  SELECT id, balance, COALESCE(locked_balance, 0)
  INTO v_from_asset_id, v_current_balance, v_current_locked
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_from_currency
  FOR UPDATE;  -- ロック取得！

  IF v_from_asset_id IS NULL THEN
    RAISE EXCEPTION '両替元の通貨が見つかりません: %', p_from_currency;
  END IF;

  -- 利用可能残高を計算（balance - locked_balance）
  v_available_balance := v_current_balance - v_current_locked;

  -- 利用可能残高で チェック（locked_balanceを考慮）
  IF v_available_balance < p_from_amount THEN
    RAISE EXCEPTION '利用可能残高が不足しています。必要: %, 利用可能: % (total: %, locked: %)',
      p_from_amount, v_available_balance, v_current_balance, v_current_locked;
  END IF;

  -- 🔒 両替先もロック（存在しない場合は作成）
  SELECT id INTO v_to_asset_id
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_to_currency
  FOR UPDATE;  -- ロック取得！

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

    -- 両替記録を作成
    INSERT INTO currency_conversions (
      user_id,
      from_currency,
      to_currency,
      from_amount,
      to_amount,
      rate,
      status
    ) VALUES (
      p_user_id,
      p_from_currency,
      p_to_currency,
      p_from_amount,
      p_to_amount,
      p_exchange_rate,
      'completed'
    );

    RETURN true;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION '両替処理に失敗しました: %', SQLERRM;
      RETURN false;
  END;
END;
$$;

-- 完了ログ
DO $$
BEGIN
    RAISE NOTICE '✅ execute_conversion関数を修正しました';
    RAISE NOTICE '   - balance と locked_balance の両方を取得';
    RAISE NOTICE '   - available = balance - locked_balance で利用可能残高を計算';
    RAISE NOTICE '   - 利用可能残高を基に両替可否を判定';
END $$;