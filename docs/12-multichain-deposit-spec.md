# Multi-Chain Deposit Specification (Phased Introduction, Manual Operation)

This document defines the deposit specification under the premise of "exchange-looking wallet (small team, manual operation)". Server does not hold private keys; signing is done manually with operational wallets (e.g., SafePal/hardware wallet/Gnosis Safe).

## Phases and Target Chains

- Phase 1 (Shortest to Public): Deposit detection for major chains (BTC / ETH / XRP / TRON / ADA / USDT on each network)
- Phase 2: BTC (Bitcoin)
- Phase 3: XRP (Ripple)
- Beyond: TRON/ADA etc. added based on demand

A "deposit acceptance switch" is provided per chain; unsupported chains show "Preparing (deposits not accepted)" in the UI.

---

## EVM (Ethereum/Arbitrum/Polygon etc.)

Method: Allocate EOA per user (HD wallet derived). Provide deposit "detection only" for shortest implementation. ERC-20 sweep and balance transfer handled manually during operation hours. Replenish small amounts of gas (ETH) manually to addresses as needed.

### Address Allocation (HD)

- BIP-44 compliant derivation path example: `m/44'/60'/0'/0/{index}`
- Managed uniquely per `user_id/chain/network/asset` in `deposit_addresses`, storing `address_index` and `derivation_path`.
- Server does not hold private keys/seeds. Only stores address/path information.

### Deposit Detection/Confirmation

- Event subscription: ETH for native transfers, USDT (ERC-20) subscribes to `Transfer(address from, address to, uint256 value)`.
- On detection: Insert into `deposits` as `pending` and update `confirmations_observed`.
- Confirmation: Update to `confirmed` when reaching required block confirmations (e.g., 12), reflect in `user_assets`.

### Aggregation/Sweep (Operations)

- This phase is "not implemented (manual)". Operators transfer as needed.
- Future proposal: Consider Deposit Contract (EIP-1167) for gas-optimized sweep (separate phase).

### Audit Logs

- Record receiving detection/confirmation/manual transfer operations in `audit_logs` (proposed) (TxHash, operator, timestamp).

---

## BTC (Bitcoin)

Method: Allocate receiving addresses from HD wallet (xpub) → Generate PSBT on server, sign manually with operational wallet.

### Flow

1) Receiving address: Allocate from client-managed `xpub` using path like `m/84'/0'/0'/0/n` (server can hold `xpub` only)
2) Deposit detection: Update `deposits(pending→confirmed)` based on confirmation count (e.g., 1/3/6)
3) Sweep: Create PSBT on server to aggregate UTXOs → sign with operational wallet → broadcast
4) Fees: Simplified fee optimization (fixed fee or estimation API). Future improvement

Note: Server does not hold private keys/seeds. Be careful with `xpub` access control.

---

## XRP (Ripple)

Method: Single address + Destination Tag (user-specific tag). Avoids reserve burden for new addresses.

### Flow

1) Receiving display: Fixed address + user-specific `Destination Tag`
2) Deposit detection: Subscribe to `payments`, map to users by Tag → `deposits`
3) Aggregation: Manual transfer during operation hours as needed

Note: Clearly document support flow for missing Tag/erroneous transfers in FAQ/UI.

---

## TRON (TRX / USDT-TRC20)

Method: User-specific address (HD: `m/44'/195'/0'/0/{index}`). Monitor TRX native transfers or TRC-20 `Transfer` events for deposits.

### Flow

1) Receiving address: Allocate HD-derived address per user, save in `deposit_addresses`.
2) Deposit detection: Subscribe to transfers/events to target addresses via TronGrid API etc., record in `deposits(pending)`.
3) Confirmation: Update to `confirmed` at approximately 19 blocks, reflect in `user_assets`.

Recommended: TronGrid API (requires API key) or self-hosted node. Bandwidth/Energy needed for future sweep (this phase is detection only).

---

## ADA (Cardano)

Method: CIP-1852 HD address (`m/1852'/1815'/0'/0/{index}`). Deposit detection via UTXO aggregation. Signing with operational wallet (key non-retention).

### Flow

1) Receiving address: Allocate HD-derived address per user, save in `deposit_addresses`.
2) Deposit detection: Monitor UTXOs via Blockfrost API etc., record in `deposits(pending)`.
3) Confirmation: Update to `confirmed` at approximately 15 confirmations, reflect in `user_assets`.

Recommended: Blockfrost API (requires API key).

---

## Data Model (Extension)

Add chain/network/identifier to `deposits`/`withdrawals` (DDL is reference example, adjust during implementation).

```sql
-- deposits extension example
ALTER TABLE deposits
  ADD COLUMN chain text,              -- 'evm' | 'btc' | 'xrp' ...
  ADD COLUMN network text,            -- 'ethereum' | 'arbitrum' | 'mainnet' | 'testnet' ...
  ADD COLUMN asset text,              -- 'ETH' | 'USDT' | 'BTC' | 'XRP' | 'TRX' | 'ADA' ...
  ADD COLUMN wallet_address text,     -- Receiving address (EOA/HD, BTC, XRP)
  ADD COLUMN memo_tag text,           -- XRP: Destination Tag etc.
  ADD COLUMN confirmations_required integer DEFAULT 0,
  ADD COLUMN confirmations_observed integer DEFAULT 0;
```

---

## Operations Policy (Minimum)

- Keys: Server does not hold keys. Signing is manual with operational wallet. If possible, use Gnosis Safe (2-of-3) for EVM aggregation destination.
- Acceptance switch: ON/OFF per chain (enforced in both UI/backend). Show "Preparing" for unsupported.
- Emergency stop: Prepare stop button for deposit intake/acceptance.
- Audit logs: Record all receiving, confirmation, aggregation, and admin operations.

---

## Acceptance Criteria (Per Chain)

- EVM: Small deposits reflected in UI/history (after reaching required confirmations).
- BTC: Receive deposits to xpub-derived address, create PSBT → aggregate with manual signing.
- XRP: Tag-attached deposits reflected in UI/history. Operations procedure ready for erroneous transfers.
- TRON: Detect TRX/TRC-20 `Transfer`, reflect after required block count.
- ADA: Reflect after UTXO detection reaches required confirmation count.

---

## Known Limitations

- Automation is limited (manual signing premise). Delays may occur during high concurrent deposits.
- Transaction fee optimization is simplified implementation. Room for future improvement.
- External audit/pentest in later phase.
