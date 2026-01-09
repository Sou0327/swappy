-- Update get_my_trades to support from/to/offset/limit filters

CREATE OR REPLACE FUNCTION public.get_my_trades(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  market text,
  price numeric,
  qty numeric,
  side text,
  role text,
  taker_fee numeric,
  maker_fee numeric,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT tr.id, tr.market, tr.price, tr.qty, tr.created_at, tr.taker_fee, tr.maker_fee,
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
         taker_fee,
         maker_fee,
         created_at
    FROM t
   WHERE (taker_user_id = auth.uid() OR maker_user_id = auth.uid())
     AND (p_from IS NULL OR created_at >= p_from)
     AND (p_to IS NULL OR created_at <= p_to)
   ORDER BY created_at DESC
   OFFSET p_offset
   LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_trades(timestamptz, timestamptz, integer, integer) TO anon, authenticated;
