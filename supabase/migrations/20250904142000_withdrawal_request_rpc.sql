-- User withdrawal request RPC: creates a pending withdrawal and locks funds

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_currency text,
  p_amount numeric,
  p_wallet_address text,
  p_network text DEFAULT NULL,
  p_memo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_available numeric := 0;
  v_total numeric := 0;
  v_locked numeric := 0;
  v_asset_balance numeric := 0;
  v_asset_locked numeric := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF p_wallet_address IS NULL OR length(p_wallet_address) < 4 THEN RAISE EXCEPTION 'invalid address'; END IF;

  -- 1) レジャーベースの残高を確認
  SELECT COALESCE(SUM(amount),0), COALESCE(SUM(locked_delta),0)
  INTO v_total, v_locked
  FROM public.ledger_entries
  WHERE user_id = v_user AND currency = p_currency;

  -- 2) user_assets の現状も取得（フォールバック/初期同期用）
  SELECT COALESCE(balance,0), COALESCE(locked_balance,0)
  INTO v_asset_balance, v_asset_locked
  FROM public.user_assets
  WHERE user_id = v_user AND currency = p_currency
  LIMIT 1;

  -- 3) ledger にベース残高が無いが user_assets にはある場合、初期同期エントリを挿入
  IF v_total = 0 AND v_locked = 0 AND (v_asset_balance > 0 OR v_asset_locked > 0) THEN
    INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
    VALUES (v_user, p_currency, v_asset_balance, v_asset_locked, 'adj', 'system', NULL);
    v_total := v_asset_balance;
    v_locked := v_asset_locked;
  END IF;

  v_available := (v_total - v_locked);

  IF v_available < p_amount THEN RAISE EXCEPTION 'insufficient % balance: need %', p_currency, p_amount; END IF;

  INSERT INTO public.withdrawals (user_id, amount, currency, status, wallet_address, notes)
  VALUES (v_user, p_amount, p_currency, 'pending', p_wallet_address, NULLIF(CONCAT('network=',COALESCE(p_network,''), '; memo=',COALESCE(p_memo,'')), 'network=; memo='))
  RETURNING id INTO v_id;

  -- lock funds immediately so available decreases
  INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
  VALUES (v_user, p_currency, 0, +p_amount, 'withdrawal', 'withdrawal', v_id);

  -- user_assetsテーブルのlocked_balance同期更新
  INSERT INTO public.user_assets (user_id, currency, balance, locked_balance, updated_at)
  VALUES (v_user, p_currency, 0, p_amount, NOW())
  ON CONFLICT (user_id, currency)
  DO UPDATE SET
    locked_balance = user_assets.locked_balance + p_amount,
    updated_at = NOW();

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(text, numeric, text, text, text) TO authenticated, anon;
