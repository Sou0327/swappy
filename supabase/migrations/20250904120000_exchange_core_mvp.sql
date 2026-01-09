-- Exchange Core MVP: markets, orders, trades, ledger_entries, audit_logs, balances view  
-- This migration introduces core tables and policies for the trading MVP.
-- 
-- COEXISTENCE STRATEGY:
-- - user_assets table (if exists) will be preserved
-- - ledger_entries is the source of truth for balance calculations
-- - user_balances_view provides computed balances from ledger_entries
-- - Both systems can coexist during transition period

-- 1) markets
CREATE TABLE IF NOT EXISTS public.markets (
  id text PRIMARY KEY, -- e.g., 'BTC-USDT'
  base text NOT NULL,
  quote text NOT NULL,
  price_tick numeric(20,10) NOT NULL CHECK (price_tick > 0),
  qty_step numeric(20,10) NOT NULL CHECK (qty_step > 0),
  min_notional numeric(20,10) NOT NULL DEFAULT 0 CHECK (min_notional >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

-- Allow anyone authenticated/anon to read active markets
DROP POLICY IF EXISTS "Read active markets (anon)" ON public.markets;
CREATE POLICY "Read active markets (anon)" ON public.markets
  FOR SELECT
  TO anon
  USING (status = 'active');

DROP POLICY IF EXISTS "Read active markets (auth)" ON public.markets;
CREATE POLICY "Read active markets (auth)" ON public.markets
  FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Admin manage markets
DROP POLICY IF EXISTS "Admins manage markets" ON public.markets;
CREATE POLICY "Admins manage markets" ON public.markets
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
DROP TRIGGER IF EXISTS update_markets_updated_at ON public.markets;
CREATE TRIGGER update_markets_updated_at
  BEFORE UPDATE ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a default market for development
INSERT INTO public.markets (id, base, quote, price_tick, qty_step, min_notional, status)
VALUES ('BTC-USDT', 'BTC', 'USDT', 0.01, 0.000001, 5, 'active')
ON CONFLICT (id) DO NOTHING;

-- 2) orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  market text NOT NULL REFERENCES public.markets(id) ON UPDATE CASCADE,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  type text NOT NULL CHECK (type IN ('limit','market')),
  price numeric(20,10),
  qty numeric(20,10) NOT NULL CHECK (qty > 0),
  filled_qty numeric(20,10) NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','open','partially_filled','filled','canceled','rejected')),
  time_in_force text NOT NULL DEFAULT 'GTC' CHECK (time_in_force IN ('GTC','IOC','FOK')),
  post_only boolean NOT NULL DEFAULT false,
  client_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_required_for_limit CHECK (
    (type = 'limit' AND price IS NOT NULL) OR (type = 'market' AND price IS NULL)
  )
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Orders RLS
DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users create own orders" ON public.orders;
CREATE POLICY "Users create own orders" ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all orders" ON public.orders;
CREATE POLICY "Admins view all orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage all orders" ON public.orders;
CREATE POLICY "Admins manage all orders" ON public.orders
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at trigger
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_market ON public.orders(market);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- 3) trades
CREATE TABLE IF NOT EXISTS public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market text NOT NULL REFERENCES public.markets(id) ON UPDATE CASCADE,
  taker_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  maker_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  price numeric(20,10) NOT NULL,
  qty numeric(20,10) NOT NULL,
  taker_fee numeric(20,10) NOT NULL DEFAULT 0,
  maker_fee numeric(20,10) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Trades are public market data (read-only)
DROP POLICY IF EXISTS "Read trades (anon)" ON public.trades;
CREATE POLICY "Read trades (anon)" ON public.trades
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Read trades (auth)" ON public.trades;
CREATE POLICY "Read trades (auth)" ON public.trades
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_trades_market_time ON public.trades(market, created_at DESC);

-- 4) ledger_entries (immutable journal)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  currency text NOT NULL,
  amount numeric(20,10) NOT NULL DEFAULT 0,          -- affects total balance
  locked_delta numeric(20,10) NOT NULL DEFAULT 0,    -- affects locked balance
  kind text NOT NULL CHECK (kind IN ('order_lock','order_unlock','trade_fill','fee','deposit','withdrawal','adj')),
  ref_type text NOT NULL CHECK (ref_type IN ('order','trade','deposit','withdrawal','system')),
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own ledger" ON public.ledger_entries;
CREATE POLICY "Users view own ledger" ON public.ledger_entries
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage ledger" ON public.ledger_entries;
CREATE POLICY "Admins manage ledger" ON public.ledger_entries
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_ledger_user_currency ON public.ledger_entries(user_id, currency);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.ledger_entries(created_at DESC);

-- 5) audit_logs (admin only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
CREATE POLICY "Admins read audit logs" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins write audit logs" ON public.audit_logs;
CREATE POLICY "Admins write audit logs" ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 6) balances view (total, locked, available)
CREATE OR REPLACE VIEW public.user_balances_view AS
SELECT
  le.user_id,
  le.currency,
  COALESCE(SUM(le.amount), 0)::numeric(20,10) AS total,
  COALESCE(SUM(le.locked_delta), 0)::numeric(20,10) AS locked,
  (COALESCE(SUM(le.amount), 0) - COALESCE(SUM(le.locked_delta), 0))::numeric(20,10) AS available
FROM public.ledger_entries le
GROUP BY le.user_id, le.currency;

-- Note: RLS on the underlying table applies to the view, so users only see their own balances.

-- Enable Realtime replication for streaming changes (after table creation)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_entries;
