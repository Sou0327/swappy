-- 両替機能のledger_entries同期修正
-- user_assetsとledger_entriesの整合性を保つため、両替時にledger_entriesへの記録を追加

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
    VALUES (p_user_id, p_from_currency, -p_from_amount, 0, 'adj', 'system', v_conversion_id);

    -- 両替先のエントリ（増額：手数料差し引き後）
    INSERT INTO ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
    VALUES (p_user_id, p_to_currency, v_actual_to_amount, 0, 'adj', 'system', v_conversion_id);

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

COMMENT ON FUNCTION execute_conversion_with_fee IS '修正版: ledger_entriesへの記録を追加して、user_balances_viewとの整合性を保つ';