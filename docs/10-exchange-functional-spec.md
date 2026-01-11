# Exchange-Style Wallet Functional Specification (Public Demo/Paper Trade)

This document defines the functional specification for making the current UI publicly available as an "exchange-looking wallet (small team, manual operation)". Real trading (matching) is not performed; orders and fills are simulation (paper trade), and deposits are introduced in phases with minimal methods per chain.

## 0. Phase Prerequisites (Current Decisions)

- No real trading: Matching engine is not implemented. Orders/fills are simulation for UI display.
- Deposits introduced in phases: Start with EVM-based real deposits only, then add BTC → XRP. Other chains later.
- Manual operation assumed: Aggregation transfers (sweep) and withdrawals are manually handled during operation hours. Server does not hold private keys.
- KYC is optional: Can be toggled ON/OFF from admin panel (assumed OFF for now).
- Mobile support: Responsive/PWA. Native apps are out of scope.
- Security: Prioritize minimum (environment variable management/audit logs/emergency stop). External pentest later.

See "12-multichain-deposit-spec.md" for chain-specific deposit specifications.

## 1. Domain Definitions (Paper Trade Basis)

- Market (Trading Pair): e.g., `BTC/USDT`. Attributes: `base`, `quote`, `price_tick`, `qty_step`, `min_notional`, `status`(active/paused/disabled)
- Order: `id`, `user_id`, `market`, `side`(buy/sell), `type`(limit/market), `price`, `qty`, `filled_qty`, `status`, `time_in_force`(GTC/IOC/FOK), `post_only`, `created_at`, `updated_at`
- Trade (Fill): `id`, `taker_order_id`, `maker_order_id`, `market`, `price`, `qty`, `taker_fee`, `maker_fee`, `created_at`
- LedgerEntry (Journal): `id`, `user_id`, `currency`, `amount`, `locked_delta`, `kind`(order_lock, order_unlock, trade_fill, fee, deposit, withdrawal, adj), `ref_type`(order/trade/deposit/withdrawal), `ref_id`, `created_at`
- Balance: `total = SUM(amount)`, `locked = SUM(locked_delta)`, `available = total - locked`.

Note: In this phase, `orders/trades` are simulated data. `ledger_entries` only records confirmed deposits/withdrawals/adjustments; no asset movement via trading.

## 2. DB (Proposed)

Below is a DDL draft assuming Supabase (PostgreSQL). (RLS/indexes/constraints to be adjusted during implementation). See "12-multichain-deposit-spec.md" extension proposal for chain-specific deposit fields.

```sql
-- markets
CREATE TABLE markets (
  id text PRIMARY KEY,          -- e.g., 'BTC-USDT'
  base text NOT NULL,
  quote text NOT NULL,
  price_tick numeric(20,10) NOT NULL,
  qty_step numeric(20,10) NOT NULL,
  min_notional numeric(20,10) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- orders
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  market text NOT NULL REFERENCES markets(id),
  side text NOT NULL CHECK (side IN ('buy','sell')),
  type text NOT NULL CHECK (type IN ('limit','market')),
  price numeric(20,10),
  qty numeric(20,10) NOT NULL,
  filled_qty numeric(20,10) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','open','partially_filled','filled','canceled','rejected')),
  time_in_force text NOT NULL DEFAULT 'GTC' CHECK (time_in_force IN ('GTC','IOC','FOK')),
  post_only boolean NOT NULL DEFAULT false,
  client_id text,               -- Idempotency/external ID
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- trades (generated via simulation this phase)
CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market text NOT NULL REFERENCES markets(id),
  taker_order_id uuid NOT NULL REFERENCES orders(id),
  maker_order_id uuid NOT NULL REFERENCES orders(id),
  price numeric(20,10) NOT NULL,
  qty numeric(20,10) NOT NULL,
  taker_fee numeric(20,10) NOT NULL DEFAULT 0,
  maker_fee numeric(20,10) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ledger_entries (immutable)
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  currency text NOT NULL,
  amount numeric(20,10) NOT NULL,           -- Positive/negative: affects total balance
  locked_delta numeric(20,10) NOT NULL DEFAULT 0, -- Change in locked balance
  kind text NOT NULL CHECK (kind IN ('order_lock','order_unlock','trade_fill','fee','deposit','withdrawal','adj')),
  ref_type text NOT NULL CHECK (ref_type IN ('order','trade','deposit','withdrawal','system')),
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_market ON orders(market);
CREATE INDEX idx_trades_market_time ON trades(market, created_at DESC);
CREATE INDEX idx_ledger_user_currency ON ledger_entries(user_id, currency);
```

RLS Basic Policy:
- `orders`, `trades`, `ledger_entries`: Read by owner only, create by owner, update via safe RPC that allows state transitions
- `markets`: Public read, update by admins only

## 3. Business Logic (Current Phase Operation)

- Orders/fills are generated as simulation for UI expression (order book, tape, self history).
- Ledger only records confirmed "deposits/withdrawals/adjustments" (no movement via trading).
- Price/quantity/minimum notional validation done in UI; backend does lightweight checks only.
- Cancel/partial fill states are expressed via pseudo-transitions; asset balances do not change.

## 4. API (Template)

REST/RPC (authentication required):
- POST `/orders` {market, side, type, price?, qty, client_id?}
- DELETE `/orders/{id}`
- GET `/orders` (own, filter by status)
- GET `/trades` (own)
- GET `/balances` (aggregate view)
RPC:
- `place_limit_order(market, side, price, qty, tif, client_id)`
- `cancel_order(order_id)` / `cancel_all_orders(market?)`
- `get_orderbook_levels(market, side, limit)`
- `get_my_trades(from?, to?, offset?, limit?)`

Deposit related (details in "12-multichain-deposit-spec.md"):
- GET `/deposit/address?chain=evm&asset=USDC` (get receiving address)
- GET `/deposit/history` (own deposit history)
- POST `/withdrawals` (request only. Actual transfer is manual)

WebSocket (public):
- `ticker:{market}` / `trades:{market}` / `orderbook:{market}`

WebSocket (authenticated):
- `orders` (own order/fill updates)
- `balances` (own balance updates)

## 5. Precision/Display & Lock Semantics

- Storage uses `numeric(20,10)` etc. for sufficient precision
- Display rounding controlled on UI side (Tailwind+shadcn); no internal rounding
- This phase does not use trading locks (`locked_delta=0` operation). Only `amount` changes during deposits/withdrawals/adjustments.

## 6. Idempotency/Consistency

- Duplicate prevention via `client_id`
- State transitions confirmed in single transaction along with ledger entries
- Re-runnable event processing (order submission/cancel/pseudo-fill)

## 7. Audit/Operations

- `audit_logs`: Store admin operations/important events (deposit detection/sweep execution/withdrawal approval etc.)
- Metrics: Deposit intake delay, failure rate, WS connection count, API error rate
- Emergency stop: Prepare "deposit acceptance switch" per chain (explicitly show "preparing/acceptance stopped")

## 8. Non-Functional (Summary)

- Availability: Tolerate single AZ failure (future)
- Scalability: Consider scale when adding markets/chains
- Security: Environment variable management, least privilege, key non-retention. 2FA/withdrawal protection in separate phase.

---

This specification is the skeleton for "public demo/paper trade". Extensions for real trading and chain-specific deposit details will be reflected in this document and "12-multichain-deposit-spec.md" at the time of phased introduction.
