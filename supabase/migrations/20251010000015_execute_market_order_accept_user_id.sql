-- execute_market_order関数をuser_idパラメータを受け取るように修正
-- 問題: auth.uid()はEdge Functionから呼び出すとNULLを返す
-- 修正: user_idを明示的にパラメータとして受け取る

-- まず古い関数を削除
DROP FUNCTION IF EXISTS public.execute_market_order(text, text, numeric, numeric);

-- 新しい関数を作成
CREATE OR REPLACE FUNCTION public.execute_market_order(
  p_user_id uuid,
  p_market text,
  p_side text,
  p_qty numeric,
  p_price numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := p_user_id;  -- auth.uid()の代わりにパラメータを使用
  v_mkt RECORD;
  v_order_id uuid;
  v_trade_id uuid;
  v_taker_fee_rate numeric;
  v_taker_fee numeric;
  v_trade_value numeric;
  v_required numeric;
BEGIN
  -- 認証チェック
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- 市場情報取得
  SELECT * INTO v_mkt FROM public._get_market(p_market);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'market % not found or inactive', p_market;
  END IF;

  -- パラメータ検証
  IF p_side NOT IN ('buy','sell') THEN
    RAISE EXCEPTION 'invalid side';
  END IF;
  IF p_price <= 0 OR p_qty <= 0 THEN
    RAISE EXCEPTION 'invalid price/qty';
  END IF;

  -- 手数料率取得
  v_taker_fee_rate := COALESCE(v_mkt.taker_fee_rate, 0.0015);

  -- 取引金額と手数料計算
  v_trade_value := p_price * p_qty;
  v_taker_fee := v_trade_value * v_taker_fee_rate;

  -- 残高チェック
  IF p_side = 'buy' THEN
    -- 買い注文: クォート通貨（USDT等）が必要
    v_required := v_trade_value + v_taker_fee;
    IF COALESCE(
      (SELECT available FROM public.user_balances_view WHERE user_id = v_user AND currency = v_mkt.quote LIMIT 1),
      (SELECT (balance - locked_balance) FROM public.user_assets WHERE user_id = v_user AND currency = v_mkt.quote LIMIT 1),
      0
    ) < v_required THEN
      RAISE EXCEPTION 'insufficient % balance: need %', v_mkt.quote, v_required;
    END IF;
  ELSE
    -- 売り注文: ベース通貨（BTC等）が必要
    v_required := p_qty;
    IF COALESCE(
      (SELECT available FROM public.user_balances_view WHERE user_id = v_user AND currency = v_mkt.base LIMIT 1),
      (SELECT (balance - locked_balance) FROM public.user_assets WHERE user_id = v_user AND currency = v_mkt.base LIMIT 1),
      0
    ) < v_required THEN
      RAISE EXCEPTION 'insufficient % balance: need %', v_mkt.base, v_required;
    END IF;
  END IF;

  -- 注文作成（即座にfilled状態）
  -- type='market'の場合、制約によりpriceはNULLでなければならない
  INSERT INTO public.orders (
    user_id, market, side, type, price, qty, filled_qty, status, time_in_force
  )
  VALUES (
    v_user, p_market, p_side, 'market', NULL, p_qty, p_qty, 'filled', 'IOC'
  )
  RETURNING id INTO v_order_id;

  -- 約定記録作成（自己取引として記録: taker=makerで同じIDを使用）
  INSERT INTO public.trades (
    market, taker_order_id, maker_order_id, price, qty, taker_fee, maker_fee
  )
  VALUES (
    p_market, v_order_id, v_order_id, p_price, p_qty, v_taker_fee, 0
  )
  RETURNING id INTO v_trade_id;

  -- 残高更新（ledger_entries経由）
  IF p_side = 'buy' THEN
    -- 買い注文: ベース通貨を受け取り、クォート通貨を支払う
    INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
    VALUES (v_user, v_mkt.base, +p_qty, 0, 'trade_fill', 'trade', v_trade_id);

    INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
    VALUES (v_user, v_mkt.quote, -v_trade_value, 0, 'trade_fill', 'trade', v_trade_id);

    -- 手数料（クォート通貨から）
    IF v_taker_fee > 0 THEN
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_user, v_mkt.quote, -v_taker_fee, 0, 'fee', 'trade', v_trade_id);
    END IF;

    -- user_assetsテーブルを更新（フロントエンド表示用）
    PERFORM public.upsert_user_asset(v_user, v_mkt.base, +p_qty);
    PERFORM public.upsert_user_asset(v_user, v_mkt.quote, -(v_trade_value + v_taker_fee));
  ELSE
    -- 売り注文: ベース通貨を支払い、クォート通貨を受け取る
    INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
    VALUES (v_user, v_mkt.base, -p_qty, 0, 'trade_fill', 'trade', v_trade_id);

    INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
    VALUES (v_user, v_mkt.quote, +v_trade_value, 0, 'trade_fill', 'trade', v_trade_id);

    -- 手数料（クォート通貨から）
    IF v_taker_fee > 0 THEN
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_user, v_mkt.quote, -v_taker_fee, 0, 'fee', 'trade', v_trade_id);
    END IF;

    -- user_assetsテーブルを更新（フロントエンド表示用）
    PERFORM public.upsert_user_asset(v_user, v_mkt.base, -p_qty);
    PERFORM public.upsert_user_asset(v_user, v_mkt.quote, +(v_trade_value - v_taker_fee));
  END IF;

  RETURN v_order_id;
END;
$$;

-- RPC権限設定
GRANT EXECUTE ON FUNCTION public.execute_market_order(uuid, text, text, numeric, numeric) TO authenticated, anon;

COMMENT ON FUNCTION public.execute_market_order IS '成行注文を外部価格で即座に約定させる。Edge Functionから呼び出すためにuser_idを明示的に受け取る。';
