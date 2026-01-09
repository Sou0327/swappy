-- request_withdrawal関数の修正：正しいテーブル名とGRANTの追加
-- 問題：withdrawal_requestsテーブル（存在しない）を使用していた
-- 修正：withdrawalsテーブルを使用し、GRANT EXECUTE文を追加

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_currency TEXT,
  p_amount NUMERIC,
  p_wallet_address TEXT,
  p_network TEXT DEFAULT NULL,
  p_memo TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_asset_balance NUMERIC;
  v_asset_locked NUMERIC;
  v_available NUMERIC;
  v_request_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- 🔒 user_assetsの残高をロック付きで取得
  SELECT COALESCE(balance,0), COALESCE(locked_balance,0)
  INTO v_asset_balance, v_asset_locked
  FROM user_assets
  WHERE user_id = v_user AND currency = p_currency
  FOR UPDATE;  -- ロック取得！

  -- 利用可能残高チェック
  v_available := (v_asset_balance - v_asset_locked);

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'insufficient balance: available=%, requested=%', v_available, p_amount;
  END IF;

  -- 出金申請レコード作成（withdrawalsテーブルを使用）
  INSERT INTO withdrawals (
    user_id, currency, amount, wallet_address, status, notes
  ) VALUES (
    v_user, p_currency, p_amount, p_wallet_address, 'pending',
    NULLIF(CONCAT('network=', COALESCE(p_network,''), '; memo=', COALESCE(p_memo,'')), 'network=; memo=')
  ) RETURNING id INTO v_request_id;

  -- ledger_entriesにロック記録
  INSERT INTO ledger_entries (
    user_id, currency, amount, locked_delta, kind, ref_type, ref_id
  ) VALUES (
    v_user, p_currency, 0, p_amount, 'withdrawal', 'withdrawal', v_request_id
  );

  -- user_assetsのlocked_balance更新
  INSERT INTO user_assets (user_id, currency, balance, locked_balance, updated_at)
  VALUES (v_user, p_currency, 0, p_amount, NOW())
  ON CONFLICT (user_id, currency)
  DO UPDATE SET
    locked_balance = user_assets.locked_balance + p_amount,
    updated_at = NOW();

  RETURN v_request_id;
END;
$$;

-- 権限の付与（重要：これがないとPostgRESTでRPC呼び出しができない）
GRANT EXECUTE ON FUNCTION public.request_withdrawal(text, numeric, text, text, text) TO authenticated, anon;

-- 完了ログ
DO $$
BEGIN
    RAISE NOTICE '✅ request_withdrawal関数を修正しました';
    RAISE NOTICE '   - withdrawalsテーブルを使用';
    RAISE NOTICE '   - GRANT EXECUTE文を追加';
    RAISE NOTICE '   - FOR UPDATEロックを維持';
END $$;