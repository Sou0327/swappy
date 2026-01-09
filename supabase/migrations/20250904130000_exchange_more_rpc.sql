-- Additional RPCs: get_my_trades, cancel_all_orders

-- Returns user's own trades (as taker or maker)
CREATE OR REPLACE FUNCTION public.get_my_trades(p_limit integer DEFAULT 200)
RETURNS TABLE(
  id uuid,
  market text,
  price numeric,
  qty numeric,
  side text,
  role text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT tr.id, tr.market, tr.price, tr.qty, tr.created_at,
           ot.user_id AS taker_user_id, ot.side AS taker_side,
           om.user_id AS maker_user_id, om.side AS maker_side
      FROM public.trades tr
      JOIN public.orders ot ON ot.id = tr.taker_order_id
      JOIN public.orders om ON om.id = tr.maker_order_id
  )
  SELECT id,
         market,
         price,
         qty,
         CASE WHEN taker_user_id = auth.uid() THEN taker_side
              WHEN maker_user_id = auth.uid() THEN maker_side
         END AS side,
         CASE WHEN taker_user_id = auth.uid() THEN 'taker'
              WHEN maker_user_id = auth.uid() THEN 'maker'
         END AS role,
         created_at
    FROM t
   WHERE taker_user_id = auth.uid() OR maker_user_id = auth.uid()
   ORDER BY created_at DESC
   LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_trades(integer) TO anon, authenticated;

-- Cancel all open/partially_filled orders for current user (optionally filtered by market)
CREATE OR REPLACE FUNCTION public.cancel_all_orders(p_market text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer := 0;
  r RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  FOR r IN
    SELECT id FROM public.orders
     WHERE user_id = v_user
       AND status IN ('open','partially_filled')
       AND (p_market IS NULL OR market = p_market)
  LOOP
    PERFORM public.cancel_order(r.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_all_orders(text) TO anon, authenticated;

