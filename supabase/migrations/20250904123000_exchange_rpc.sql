-- Exchange Core MVP RPCs: place_limit_order, cancel_order
-- 注意: セキュリティ/検証はMVP最小。今後強化予定。

-- Helper: get base/quote for market
-- Note: maker_fee_rate and taker_fee_rate will be added in a later migration
-- This function uses default values until those columns exist
CREATE OR REPLACE FUNCTION public._get_market(p_market text)
RETURNS TABLE(id text, base text, quote text, price_tick numeric, qty_step numeric, min_notional numeric, maker_fee_rate numeric, taker_fee_rate numeric) AS $$
  SELECT 
    id, 
    base, 
    quote, 
    price_tick, 
    qty_step, 
    min_notional, 
    0.0::numeric AS maker_fee_rate,    -- Default maker fee
    0.0015::numeric AS taker_fee_rate  -- Default taker fee
  FROM public.markets
  WHERE id = p_market AND status = 'active';
$$ LANGUAGE sql STABLE;

-- RPC: place_limit_order() - 最小版 (GTC/IOC対応、手数料0)
CREATE OR REPLACE FUNCTION public.place_limit_order(
  p_market text,
  p_side text,
  p_price numeric,
  p_qty numeric,
  p_time_in_force text DEFAULT 'GTC',
  p_client_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_mkt RECORD;
  v_order_id uuid;
  v_remaining numeric := p_qty;
  v_opposite text := CASE WHEN p_side = 'buy' THEN 'sell' ELSE 'buy' END;
  v_maker RECORD;
  v_trade_id uuid;
  v_trade_qty numeric;
  v_trade_price numeric;
  v_trade_value numeric;
  v_required numeric := 0;
  v_taker_fee_rate numeric := NULL; -- market-defined
  v_maker_fee_rate numeric := NULL; -- market-defined
  v_taker_fee numeric := 0;
  v_maker_fee numeric := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO v_mkt FROM public._get_market(p_market);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'market % not found or inactive', p_market;
  END IF;

  IF p_side NOT IN ('buy','sell') THEN RAISE EXCEPTION 'invalid side'; END IF;
  IF p_price <= 0 OR p_qty <= 0 THEN RAISE EXCEPTION 'invalid price/qty'; END IF;
  IF p_time_in_force NOT IN ('GTC','IOC') THEN RAISE EXCEPTION 'unsupported TIF'; END IF;

  -- 資金の事前確認 (上限見積り) - ledger優先、無ければuser_assetsを参照
  -- Load fee rates from market
  v_taker_fee_rate := COALESCE(v_mkt.taker_fee_rate, 0.0015);
  v_maker_fee_rate := COALESCE(v_mkt.maker_fee_rate, 0.0);

  IF p_side = 'buy' THEN
    v_required := (p_price * p_qty) * (1 + v_taker_fee_rate); -- taker手数料を含める
    IF COALESCE(
      (SELECT available FROM public.user_balances_view WHERE user_id = v_user AND currency = v_mkt.quote LIMIT 1),
      (SELECT (balance - locked_balance) FROM public.user_assets WHERE user_id = v_user AND currency = v_mkt.quote LIMIT 1),
      0
    ) < v_required THEN
      RAISE EXCEPTION 'insufficient % balance: need %', v_mkt.quote, v_required;
    END IF;
  ELSE
    v_required := p_qty;
    IF COALESCE(
      (SELECT available FROM public.user_balances_view WHERE user_id = v_user AND currency = v_mkt.base LIMIT 1),
      (SELECT (balance - locked_balance) FROM public.user_assets WHERE user_id = v_user AND currency = v_mkt.base LIMIT 1),
      0
    ) < v_required THEN
      RAISE EXCEPTION 'insufficient % balance: need %', v_mkt.base, v_required;
    END IF;
  END IF;

  -- 注文作成 (open)
  INSERT INTO public.orders (user_id, market, side, type, price, qty, status, time_in_force, post_only, client_id)
  VALUES (v_user, p_market, p_side, 'limit', p_price, p_qty, 'open', p_time_in_force, false, p_client_id)
  RETURNING id INTO v_order_id;

  -- マッチング(価格優先/時間優先)
  FOR v_maker IN
    SELECT * FROM public.orders
     WHERE market = p_market
       AND status IN ('open','partially_filled')
       AND side = v_opposite
       AND ((p_side = 'buy' AND price <= p_price) OR (p_side = 'sell' AND price >= p_price))
     ORDER BY
       CASE WHEN p_side='buy' THEN price END ASC NULLS LAST,
       CASE WHEN p_side='sell' THEN price END DESC NULLS LAST,
       created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_trade_price := v_maker.price;
    v_trade_qty := LEAST(v_remaining, v_maker.qty - v_maker.filled_qty);
    IF v_trade_qty <= 0 THEN CONTINUE; END IF;
    v_trade_value := v_trade_price * v_trade_qty;
    v_taker_fee := v_trade_value * v_taker_fee_rate;
    v_maker_fee := v_trade_value * v_maker_fee_rate;

    INSERT INTO public.trades (market, taker_order_id, maker_order_id, price, qty, taker_fee, maker_fee)
    VALUES (p_market, v_order_id, v_maker.id, v_trade_price, v_trade_qty, v_taker_fee, v_maker_fee)
    RETURNING id INTO v_trade_id;

    -- maker更新
    UPDATE public.orders
       SET filled_qty = filled_qty + v_trade_qty,
           status = CASE WHEN filled_qty + v_trade_qty >= qty THEN 'filled' ELSE 'partially_filled' END,
           updated_at = now()
     WHERE id = v_maker.id;

    -- taker更新
    UPDATE public.orders
       SET filled_qty = filled_qty + v_trade_qty,
           status = CASE WHEN filled_qty + v_trade_qty >= qty THEN 'filled' ELSE 'partially_filled' END,
           updated_at = now()
     WHERE id = v_order_id;

    -- 仕訳: takerとmaker
    IF p_side = 'buy' THEN
      -- taker: base +qty, quote -value
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_user, v_mkt.base, +v_trade_qty, 0, 'trade_fill', 'trade', v_trade_id);
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_user, v_mkt.quote, -v_trade_value, 0, 'trade_fill', 'trade', v_trade_id);
      -- taker fee (quote)
      IF v_taker_fee > 0 THEN
        INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_user, v_mkt.quote, -v_taker_fee, 0, 'fee', 'trade', v_trade_id);
      END IF;
      -- maker(sell): base -qty (解放), quote +value
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_maker.user_id, v_mkt.base, -v_trade_qty, -v_trade_qty, 'trade_fill', 'trade', v_trade_id);
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_maker.user_id, v_mkt.quote, +v_trade_value, 0, 'trade_fill', 'trade', v_trade_id);
      -- maker fee (quote)
      IF v_maker_fee > 0 THEN
        INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_maker.user_id, v_mkt.quote, -v_maker_fee, 0, 'fee', 'trade', v_trade_id);
      END IF;
    ELSE
      -- taker(sell): base -qty, quote +value
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_user, v_mkt.base, -v_trade_qty, 0, 'trade_fill', 'trade', v_trade_id);
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_user, v_mkt.quote, +v_trade_value, 0, 'trade_fill', 'trade', v_trade_id);
      -- taker fee (quote)
      IF v_taker_fee > 0 THEN
        INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_user, v_mkt.quote, -v_taker_fee, 0, 'fee', 'trade', v_trade_id);
      END IF;
      -- maker(buy): base +qty, quote -value (解放)
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_maker.user_id, v_mkt.base, +v_trade_qty, 0, 'trade_fill', 'trade', v_trade_id);
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_maker.user_id, v_mkt.quote, -v_trade_value, -v_trade_value, 'trade_fill', 'trade', v_trade_id);
      -- maker fee (quote)
      IF v_maker_fee > 0 THEN
        INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_maker.user_id, v_mkt.quote, -v_maker_fee, 0, 'fee', 'trade', v_trade_id);
      END IF;
    END IF;

    v_remaining := v_remaining - v_trade_qty;
  END LOOP;

  -- 残量処理: IOCは即キャンセル、GTCは拘束して板に残す
  IF v_remaining > 0 THEN
    IF p_time_in_force = 'IOC' THEN
      -- 取消
      UPDATE public.orders
         SET status = CASE WHEN filled_qty > 0 THEN 'partially_filled' ELSE 'canceled' END,
             updated_at = now()
       WHERE id = v_order_id;
    ELSE
      -- 残量拘束
      IF p_side = 'buy' THEN
        INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_user, v_mkt.quote, 0, +(p_price * v_remaining), 'order_lock', 'order', v_order_id);
      ELSE
        INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_user, v_mkt.base, 0, +v_remaining, 'order_lock', 'order', v_order_id);
      END IF;
      -- openのまま
    END IF;
  END IF;

  RETURN v_order_id;
END;
$$;

-- RPC: get_orderbook_levels(market, side, limit)
CREATE OR REPLACE FUNCTION public.get_orderbook_levels(
  p_market text,
  p_side text,
  p_limit integer DEFAULT 10
) RETURNS TABLE(price numeric, amount numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.price,
         SUM(o.qty - o.filled_qty) AS amount
    FROM public.orders o
   WHERE o.market = p_market
     AND o.side = p_side
     AND o.status IN ('open','partially_filled')
   GROUP BY o.price
   ORDER BY
     CASE WHEN p_side='buy' THEN o.price END DESC NULLS LAST,
     CASE WHEN p_side='sell' THEN o.price END ASC NULLS LAST
   LIMIT p_limit;
$$;

-- RPC: cancel_order(order_id)
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_o RECORD;
  v_mkt RECORD;
  v_remaining numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT o.*, m.base, m.quote INTO v_o
    FROM public.orders o
    JOIN public.markets m ON m.id = o.market
   WHERE o.id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_o.user_id <> v_user THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_o.status NOT IN ('open','partially_filled') THEN RETURN; END IF;

  v_remaining := v_o.qty - v_o.filled_qty;
  IF v_remaining > 0 THEN
    IF v_o.side = 'buy' THEN
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_user, v_o.quote, 0, -(v_o.price * v_remaining), 'order_unlock', 'order', p_order_id);
    ELSE
      INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
      VALUES (v_user, v_o.base, 0, -v_remaining, 'order_unlock', 'order', p_order_id);
    END IF;
  END IF;

  UPDATE public.orders
     SET status = 'canceled', updated_at = now()
   WHERE id = p_order_id;
END;
$$;

-- Grants for RPCs
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._get_market(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_limit_order(text, text, numeric, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orderbook_levels(text, text, integer) TO anon, authenticated;
