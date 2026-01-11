# Single Market Setup Guide (Unlisted Token - Reference)

This document provides the minimal configuration setup procedure for trading only one unlisted token. Since the current phase (exchange-style wallet) does not perform real trading, the content of this document should be treated as reference information. The backend uses tables/functions on Supabase (RLS), and the frontend displays only `active` markets.

## Procedure

1) Create Market (Admin Panel or SQL)
- Admin panel `/admin` → "Market Management" to add e.g., `ID=TOKENX-USDT`
- Recommended initial values: `price_tick=0.01`, `qty_step=0.000001`, `min_notional=1`, `maker_fee_rate=0.0`, `taker_fee_rate=0.0015`

2) Disable Existing Markets
- Change `BTC-USDT` to `status='disabled'`
- Frontend only retrieves and displays `status='active'`

3) Prepare Balances
- Grant `USDT`/`TOKENX` balances to test users (can use `user_assets`).
- In production, expect to unify via `ledger_entries` as the source.

4) Verify Operation
- Only `TOKENX/USDT` should be selectable in `/trade`.
- Limit orders (GTC/IOC) submission/cancel/fill/fees are reflected.
- My trades/open orders/my orders are viewable in `/history`.

## Notes
- Fees are stored in `markets`. Expandable to role/level-based in future.
- Market orders/advanced order types are future extensions. MVP is limit orders only.
- Realtime has `orders/trades/ledger_entries` added to public.
