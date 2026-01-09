-- Add maker/taker fee rates to markets and expose via _get_market

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS maker_fee_rate numeric(10,6) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS taker_fee_rate numeric(10,6) NOT NULL DEFAULT 0.0015;

-- Set default fees for seeded market
UPDATE public.markets SET maker_fee_rate = 0.0000, taker_fee_rate = 0.0015 WHERE id = 'BTC-USDT';

-- Update _get_market function to use actual fee columns now that they exist
CREATE OR REPLACE FUNCTION public._get_market(p_market text)
RETURNS TABLE(id text, base text, quote text, price_tick numeric, qty_step numeric, min_notional numeric, maker_fee_rate numeric, taker_fee_rate numeric) AS $$
  SELECT 
    id, 
    base, 
    quote, 
    price_tick, 
    qty_step, 
    min_notional, 
    maker_fee_rate,
    taker_fee_rate
  FROM public.markets
  WHERE id = p_market AND status = 'active';
$$ LANGUAGE sql STABLE;

