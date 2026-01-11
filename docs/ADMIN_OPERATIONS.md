# Admin Operations Runbook

This document summarizes procedures for deposit detection, confirmation reflection, wallet settings, sweep (aggregation), and emergency response for the operations team. It covers production/staging/local environments, but production requires permission management and audit logs.

## Overview
- Deposit Detection: Edge Function `deposit-detector` detects deposits on each chain. Updates `deposits`/`deposit_transactions`.
- Confirmation Reflection: Edge Function `confirmations-updater` judges `pending` as confirmed and updates `deposits`/`user_assets`.
- Address Allocation: Edge Function `address-allocator` allocates receiving addresses from xpub for users (EVM/ETH/USDT, BTC).
- Aggregation (Sweep): Edge Function `sweep-planner` generates unsigned Tx (EVM/ETH). Signing/broadcasting is done by operational wallet.
- Admin UI: `/admin/wallets` manages "Admin Wallets", "Wallet Roots (xpub)", "Sweep Plan List".

## Prerequisites & Permissions
- Only accounts with admin role (`user_roles.role=admin`) can perform the operations in this document.
- Supabase `Service role key` is confidential. Register only in Edge Functions Secrets, not in VCS or frontend `.env`.

## Secrets Setup Procedure
### Retrieval
- Production/Staging: Supabase Dashboard → Project → Settings → API → Keys
  - `Anon key` (public) / `Service role` (confidential) - 2 types
- Local: Displayed via `npx supabase status`

### Registration (CLI)
- Login/link beforehand
  ```bash
  supabase login
  supabase link --project-ref <project_ref>
  ```
- Representative Keys
  ```bash
  # Supabase
  supabase secrets set SUPABASE_URL="https://<project>.supabase.co"
  supabase secrets set SUPABASE_ANON_KEY="<anon_key>"
  supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"

  # Ethereum/EVM
  supabase secrets set ETHEREUM_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/<key>"
  supabase secrets set ETHEREUM_SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/<key>"
  supabase secrets set USDT_ERC20_CONTRACT="0xdAC17F958D2ee523a2206206994597C13D831ec7"
  supabase secrets set USDT_SEPOLIA_CONTRACT="<sepolia_usdt_contract>"

  # Tron
  supabase secrets set TRON_RPC_URL="https://api.trongrid.io"
  supabase secrets set TRONGRID_API_KEY="<trongrid_api_key>"

  # XRP
  supabase secrets set XRP_RPC_URL="wss://xrplcluster.com"

  # Cardano
  supabase secrets set BLOCKFROST_PROJECT_ID="<blockfrost_project_id>"
  ```

## Wallet Settings
### Wallet Root (xpub)
- Screen: `/admin/wallets` → "Wallet Root (xpub)"
- Registration items:
  - `chain/network/asset`: e.g., `evm/ethereum/ETH`, `evm/sepolia/USDT`, `btc/mainnet/BTC`
  - `xpub`: Extended public key (non-confidential). Never register xprv/seed
  - `derivation_template`: Relative path from xpub. Default `0/{index}`
  - `address_type`: `default` (EVM) / `p2wpkh` etc. (BTC currently bech32 P2WPKH)
- Notes:
  - Derivation assumes "non-hardened" (`0/{index}` etc.). Hardened (`{index}'`) cannot be derived from xpub
  - BTC allocates bech32(P2WPKH) addresses as `bc1...`/`tb1...`

### Admin Wallet (Aggregation Destination)
- Screen: `/admin/wallets` → "Admin Wallet (Aggregation Destination)"
- Registration items: `chain/network/asset/address/active`
- Usage: Destination for sweep transfers

## Deposit Address Allocation (User Side)
- EVM/ETH/USDT, BTC are auto-allocated from UI
  - Frontend calls Edge Function `address-allocator` and UPSERTs to `deposit_addresses`
- XRP uses fixed address + user-specific Destination Tag (displayed in UI).

## Deposit Detection & Confirmation Reflection Operations
### Function Deployment
```bash
supabase functions deploy deposit-detector address-allocator confirmations-updater sweep-planner
```

### Manual Execution
```bash
# Deposit detection (all chains)
curl -X POST "https://<project>.supabase.co/functions/v1/deposit-detector" \
  -H "Authorization: Bearer <anon_key>"

# Confirmation count update (EVM/USDT, BTC, TRON, ADA)
curl -X POST "https://<project>.supabase.co/functions/v1/confirmations-updater" \
  -H "Authorization: Bearer <anon_key>"
```

### Scheduler (Recommended for Production)
- Supabase Dashboard → Edge Functions → Scheduler
  - `deposit-detector`: 30-60 second interval
  - `confirmations-updater`: 60-120 second interval
  - Method: POST / Auth: `Authorization: Bearer <anon_key>`

### Scan Progress (chain_progress)
- ETH/USDT resumes from last processed block
- If missing transactions occur, adjust `last_block` in `chain_progress` for rescan

## XRP Operations
- Method: Fixed address + user-specific Destination Tag
- Unique constraint: Partial unique index on `network+destination_tag` in `deposit_addresses` (`uniq_xrp_destination_tag`)
- Wrong Tag/missing Tag recovery:
  1) Confirm transaction in explorer (txhash, tag, amount)
  2) Admin manually assigns to target user (define internal operation procedure/approval flow)
  3) Correct `deposits`/`user_assets` and record in `audit_logs`

## Sweep (Aggregation) Operations
- Aggregation target: EVM/ETH (currently). USDT/BTC/other chains for future expansion
- Prerequisite: Register admin wallet (aggregation destination) in `/admin/wallets`
- Procedure:
  1) Execute: Call `sweep-planner` to create `sweep_jobs`
     ```bash
     curl -X POST "https://<project>.supabase.co/functions/v1/sweep-planner" \
       -H "Authorization: Bearer <anon_key>" \
       -H "Content-Type: application/json" \
       -d '{"chain":"evm","network":"ethereum","asset":"ETH"}'
     ```
  2) Generate: Retrieve `unsigned_tx` (from/to/value/gas/gasPrice/nonce/chainId)
  3) Sign: Sign with operational wallet (key holder for deposit addresses)
  4) Broadcast: Broadcast to network (can use Gnosis Safe etc.)
  5) Record: Record `signed_tx`/`tx_hash` in `sweep_jobs` (dedicated function planned for future)
- Note: Don't store private keys on server. Gas shortage may require ETH replenishment to deposit addresses

## Emergency Stop/Enable
- Screen: `/admin/deposits/settings`
  - Control `deposit_enabled` / `min_confirmations` / `min_deposit` per chain
  - Emergency Stop button for bulk toggle → audit log recorded

## Audit & Monitoring
- Audit logs: Important operations (setting changes, stop/restart) recorded in `audit_logs` (UI/SQL)
- Monitoring points:
  - Edge Functions execution results (Dashboard Logs)
  - `deposit_transactions(status=pending)` backlog
  - `chain_progress` stagnation
  - RPC/API rate limits (TronGrid/Blockfrost/Alchemy)

## Troubleshooting
- USDT not reflected: `USDT_ERC20_CONTRACT/USDT_SEPOLIA_CONTRACT` not set / `eth_getLogs` period insufficient → adjust `chain_progress`
- BTC confirmation count not progressing: Blockstream API reachability / `block_height` not confirmed in tx details
- TRON/ADA stuck in pending: API key not set / confirmations-updater not executed
- XRP user mapping: Verify `destination_tag` match / manual correction by admin

## Backup/Recovery
- DB backup (local)
  ```bash
  npx supabase db dump --local > backup_$(date +%Y%m%d).sql
  ```
- Migration apply/reset (local)
  ```bash
  npx supabase db push --local
  npx supabase db reset --local # Destructive. Careful with real data
  ```

## Operations Command Cheat Sheet
```bash
# Status check
npx supabase status

# Function local execution (individual verification)
supabase functions serve deposit-detector --env-file ./supabase/functions/.env --no-verify-jwt

# Function deployment
supabase functions deploy deposit-detector address-allocator confirmations-updater sweep-planner

# Secrets list
supabase secrets list
```

## Change History
- 2025-09: xpub allocation (EVM/BTC), USDT detection, TRON/ADA confirmation reflection, sweep planning, emergency stop, operations UI added
