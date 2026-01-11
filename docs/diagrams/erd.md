# Undefined Database ERD Diagram

> Production Environment: Supabase PostgreSQL
> Generated: 2026-01-07

## Overview

The Undefined platform is a cryptocurrency trading platform supporting 5 blockchains (BTC, ETH, XRP, TRON, Cardano).
This ERD diagram shows the main tables and their relationships.

## ERD Diagram (Complete Version)

```mermaid
erDiagram
    %% ===== Authentication & User Management =====
    auth_users {
        uuid id PK
        text email
        timestamptz created_at
    }

    profiles {
        uuid id PK,FK "auth.users.id"
        text full_name
        text user_handle UK
        text display_name
        text bio
        boolean is_public
        text kyc_status "pending|approved|rejected"
        text phone_number
        timestamptz created_at
        timestamptz updated_at
    }

    user_roles {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text role "admin|moderator|user"
        timestamptz created_at
    }

    %% ===== Asset Management =====
    user_assets {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text asset "BTC|ETH|USDT|XRP|TRX|ADA"
        numeric balance
        numeric locked_balance
        timestamptz created_at
        timestamptz updated_at
    }

    ledger_entries {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text currency
        numeric amount
        numeric locked_delta
        text kind "order_lock|trade_fill|deposit|withdrawal|fee|adj"
        text ref_type "order|trade|deposit|withdrawal|system"
        uuid ref_id
        timestamptz created_at
    }

    %% ===== Deposit System =====
    deposits {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text currency
        numeric amount
        text status "pending|confirmed|failed"
        text tx_hash
        integer confirmations_required
        integer confirmations_observed
        timestamptz created_at
    }

    deposit_addresses {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text chain "evm|btc|xrp|trc|ada"
        text network "ethereum|bitcoin|mainnet|testnet"
        text asset
        text address
        text memo_tag
        text destination_tag
        text derivation_path
        integer address_index
        text xpub
        boolean active
        timestamptz created_at
    }

    deposit_transactions {
        uuid id PK
        uuid user_id FK "auth.users.id"
        uuid deposit_address_id FK
        text chain
        text network
        text asset
        text transaction_hash
        bigint block_number
        text from_address
        text to_address
        numeric amount
        integer confirmations
        integer required_confirmations
        text status "pending|confirmed|failed"
        text destination_tag
        timestamptz detected_at
        timestamptz confirmed_at
    }

    chain_configs {
        uuid id PK
        text chain
        text network
        text asset
        boolean deposit_enabled
        integer min_confirmations
        numeric min_deposit
        timestamptz created_at
    }

    xrp_fixed_addresses {
        uuid id PK
        text network
        text address UK
        boolean active
        timestamptz created_at
    }

    %% ===== Withdrawal System =====
    withdrawals {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text currency
        numeric amount
        text address
        text status "pending|approved|processing|completed|rejected"
        text tx_hash
        timestamptz created_at
        timestamptz processed_at
    }

    %% ===== Trading System =====
    markets {
        text id PK "BTC-USDT"
        text base
        text quote
        numeric price_tick
        numeric qty_step
        numeric min_notional
        text status "active|paused|disabled"
        timestamptz created_at
    }

    orders {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text market FK "markets.id"
        text side "buy|sell"
        text type "limit|market"
        numeric price
        numeric qty
        numeric filled_qty
        text status "new|open|partially_filled|filled|canceled"
        text time_in_force "GTC|IOC|FOK"
        boolean post_only
        timestamptz created_at
    }

    trades {
        uuid id PK
        text market FK "markets.id"
        uuid taker_order_id FK "orders.id"
        uuid maker_order_id FK "orders.id"
        numeric price
        numeric qty
        numeric taker_fee
        numeric maker_fee
        timestamptz created_at
    }

    %% ===== User Transfers =====
    user_transfers {
        uuid id PK
        uuid from_user_id FK "auth.users.id"
        uuid to_user_id FK "auth.users.id"
        text currency
        numeric amount
        text status "pending|completed|failed|cancelled"
        text transaction_hash UK
        text reference_number UK
        text description
        timestamptz created_at
        timestamptz completed_at
    }

    transfer_limits {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text currency
        numeric daily_limit
        numeric monthly_limit
        numeric single_transfer_limit
        boolean is_active
        timestamptz created_at
    }

    %% ===== Referral System =====
    referral_codes {
        uuid id PK
        uuid user_id FK,UK "auth.users.id"
        text code UK
        boolean is_active
        integer max_uses
        integer current_uses
        timestamptz expires_at
        timestamptz created_at
    }

    referrals {
        uuid id PK
        uuid referrer_id FK "auth.users.id"
        uuid referred_id FK,UK "auth.users.id"
        text referral_code
        text status "pending|active|completed"
        timestamptz created_at
        timestamptz completed_at
    }

    referral_rewards {
        uuid id PK
        uuid referral_id FK "referrals.id"
        uuid user_id FK "auth.users.id"
        text reward_type "referrer_bonus|referred_bonus|milestone_bonus"
        text currency
        numeric amount
        text status "pending|awarded|cancelled"
        timestamptz awarded_at
        timestamptz created_at
    }

    %% ===== Operations Management =====
    admin_wallets {
        uuid id PK
        text chain
        text network
        text asset
        text address
        boolean active
        timestamptz created_at
    }

    sweep_jobs {
        uuid id PK
        uuid deposit_id FK "deposits.id"
        text chain
        text network
        text asset
        text from_address
        text to_address
        numeric planned_amount
        text currency
        text status "planned|signed|broadcasted|confirmed|failed"
        jsonb unsigned_tx
        text signed_tx
        text tx_hash
        text error_message
        timestamptz created_at
    }

    audit_logs {
        uuid id PK
        uuid actor_user_id FK "auth.users.id"
        text action
        text entity_type
        uuid entity_id
        jsonb metadata
        timestamptz created_at
    }

    %% ===== Notifications & Support =====
    notifications {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text type
        text title
        text message
        boolean is_read
        jsonb metadata
        timestamptz created_at
    }

    support_tickets {
        uuid id PK
        uuid user_id FK "auth.users.id"
        text subject
        text message
        text status "open|in_progress|resolved|closed"
        text priority "low|medium|high|urgent"
        timestamptz created_at
        timestamptz resolved_at
    }

    %% ===== Relationships =====
    auth_users ||--|| profiles : "has profile"
    auth_users ||--o{ user_roles : "has roles"
    auth_users ||--o{ user_assets : "owns assets"
    auth_users ||--o{ ledger_entries : "has ledger"
    auth_users ||--o{ deposits : "makes deposits"
    auth_users ||--o{ withdrawals : "makes withdrawals"
    auth_users ||--o{ deposit_addresses : "has addresses"
    auth_users ||--o{ deposit_transactions : "receives txs"
    auth_users ||--o{ orders : "places orders"
    auth_users ||--o{ user_transfers : "sends transfers"
    auth_users ||--o{ user_transfers : "receives transfers"
    auth_users ||--o{ transfer_limits : "has limits"
    auth_users ||--|| referral_codes : "has referral code"
    auth_users ||--o{ referrals : "refers users"
    auth_users ||--o| referrals : "is referred by"
    auth_users ||--o{ referral_rewards : "earns rewards"
    auth_users ||--o{ notifications : "receives"
    auth_users ||--o{ support_tickets : "creates"
    auth_users ||--o{ audit_logs : "triggers audits"

    deposit_addresses ||--o{ deposit_transactions : "receives"

    markets ||--o{ orders : "has orders"
    markets ||--o{ trades : "has trades"

    orders ||--o{ trades : "is taker"
    orders ||--o{ trades : "is maker"

    deposits ||--o| sweep_jobs : "triggers sweep"

    referrals ||--o{ referral_rewards : "generates"
```

## Table Overview

### Authentication & User Management (3 Tables)

| Table | Description | RLS |
|-------|-------------|-----|
| `auth.users` | Supabase authenticated users (system managed) | - |
| `profiles` | User profiles (KYC status, display name, etc.) | ✅ |
| `user_roles` | Role management (admin/moderator/user) | ✅ |

### Asset Management (2 Tables)

| Table | Description | RLS |
|-------|-------------|-----|
| `user_assets` | User asset balances (per currency) | ✅ |
| `ledger_entries` | Immutable ledger (source of truth for transaction history) | ✅ |

### Deposit System (5 Tables)

| Table | Description | RLS |
|-------|-------------|-----|
| `deposits` | Deposit records (confirmation tracking) | ✅ |
| `deposit_addresses` | User deposit addresses (HD derived) | ✅ |
| `deposit_transactions` | Detected transactions | ✅ |
| `chain_configs` | Chain configuration (confirmations, minimum deposit) | ✅ |
| `xrp_fixed_addresses` | XRP fixed addresses (Destination Tag method) | ✅ |

### Withdrawal System (1 Table)

| Table | Description | RLS |
|-------|-------------|-----|
| `withdrawals` | Withdrawal requests and processing status | ✅ |

### Trading System (3 Tables)

| Table | Description | RLS |
|-------|-------------|-----|
| `markets` | Trading pairs (BTC-USDT, etc.) | ✅ |
| `orders` | Orders (limit/market) | ✅ |
| `trades` | Trade execution records | ✅ |

### User Transfers (2 Tables)

| Table | Description | RLS |
|-------|-------------|-----|
| `user_transfers` | Platform internal transfers | ✅ |
| `transfer_limits` | Transfer limits (daily/monthly/per-transaction) | ✅ |

### Referral System (3 Tables)

| Table | Description | RLS |
|-------|-------------|-----|
| `referral_codes` | Referral codes (unique per user) | ✅ |
| `referrals` | Referral relationship tracking | ✅ |
| `referral_rewards` | Reward distribution records | ✅ |

### Operations Management (3 Tables)

| Table | Description | RLS |
|-------|-------------|-----|
| `admin_wallets` | Administrative aggregation wallets | ✅ |
| `sweep_jobs` | Sweep (aggregation transfer) jobs | ✅ |
| `audit_logs` | Audit logs | ✅ |

### Notifications & Support (2 Tables)

| Table | Description | RLS |
|-------|-------------|-----|
| `notifications` | User notifications | ✅ |
| `support_tickets` | Support tickets | ✅ |

## Security Design

### Row Level Security (RLS) Policies

RLS is enabled on all tables with the following patterns:

1. **User's own data**: `auth.uid() = user_id` allows access only to the owner
2. **Admin privileges**: `has_role(auth.uid(), 'admin')` grants admins access to all data
3. **Public data**: `markets`, `trades` are viewable by anyone (market data)

### Constraints and Validation

```sql
-- Prevent self-transfer
CONSTRAINT no_self_transfer CHECK (from_user_id != to_user_id)

-- Amount validation
CONSTRAINT positive_amount CHECK (amount > 0)

-- Status enumeration
CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'failed'))
```

## Chain Support Status

| Chain | chain value | network examples | Supported Tokens |
|-------|-------------|------------------|------------------|
| Bitcoin | `btc` | `mainnet`, `testnet` | BTC |
| Ethereum | `evm` | `ethereum`, `sepolia` | ETH, USDT(ERC20) |
| XRP Ledger | `xrp` | `mainnet`, `testnet` | XRP |
| TRON | `trc` | `mainnet`, `shasta` | TRX, USDT(TRC20) |
| Cardano | `ada` | `mainnet`, `testnet` | ADA |

## Related Documentation

- [Database Schema Details](../04-database-schema.md)
- [Multi-Chain Deposit Specifications](../12-multichain-deposit-spec.md)
