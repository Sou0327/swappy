# Database Schema (Supabase PostgreSQL)

## Schema Overview
- **Schema**: `public`
- **Migrations**: `supabase/migrations/`
- **RLS**: Enabled on all tables

## Table Structure

### 1. profiles Table
Stores user basic information

```sql
CREATE TABLE profiles (
  id uuid REFERENCES auth.users(id) PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
```

**Features:**
- Foreign key constraint to `auth.users`
- Auto-created via `handle_new_user` trigger
- **RLS**: Only owner can read/update, admins can operate on all records

### 2. user_roles Table
User role management

```sql
CREATE TYPE app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_user_role UNIQUE(user_id, role)
);
```

**Features:**
- Multiple roles per user allowed
- **Constraint**: `UNIQUE(user_id, role)`
- **RLS**: Only owner can read own roles, admins can operate on all records

### 3. deposits Table
Deposit records (includes chain/network information)

```sql
CREATE TABLE deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  amount decimal(20,8) NOT NULL,
  currency text DEFAULT 'USD',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  transaction_hash text,
  wallet_address text,
  chain text,         -- 'evm' | 'btc' | 'xrp' etc.
  network text,       -- 'ethereum' | 'arbitrum' | 'mainnet' | 'testnet' etc.
  asset text,         -- 'ETH' | 'USDC' | 'BTC' | 'XRP' etc.
  memo_tag text,      -- XRP Destination Tag etc.
  confirmations_required integer DEFAULT 0,
  confirmations_observed integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  confirmed_at timestamp with time zone,
  confirmed_by uuid REFERENCES auth.users(id),
  notes text
);
```

**Features:**
- **Amount**: High precision decimal(20,8)
- **Status**: 'pending', 'confirmed', 'rejected'
- **Confirmation tracking**: `confirmed_at`, `confirmed_by`
- **Confirmation count**: `confirmations_required`, `confirmations_observed`
- **RLS**: Only owner can read/create, admins can operate on all records

### 4. withdrawals Table
Withdrawal records (manual transfer request records)

```sql
CREATE TABLE withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  amount decimal(20,8) NOT NULL,
  currency text DEFAULT 'USD',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  wallet_address text NOT NULL,
  transaction_hash text,
  chain text,
  network text,
  asset text,
  created_at timestamp with time zone DEFAULT now(),
  confirmed_at timestamp with time zone,
  confirmed_by uuid REFERENCES auth.users(id),
  notes text
);
```

**Features:**
- Same structure as `deposits`
- **Required**: `wallet_address`
- **RLS**: Only owner can read/create, admins can operate on all records

### 5. user_assets Table
User asset balances

```sql
CREATE TABLE user_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  currency text NOT NULL,
  balance decimal(20,8) DEFAULT 0,
  locked_balance decimal(20,8) DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_user_currency UNIQUE(user_id, currency)
);
```

**Features:**
- **Constraint**: `UNIQUE(user_id, currency)` - one record per currency
- **Balance**: `balance` (available) + `locked_balance` (locked)
- **Auto-update**: `updated_at` trigger
- **RLS**: Only owner can read, admins can operate on all records

### 6. deposit_addresses Table (Phase 1 - Proposed)
Manages receiving addresses per chain/network for each user (EVM from EOA/HD derivation, BTC from xpub derivation, XRP fixed address + Tag).

```sql
CREATE TABLE deposit_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  chain text NOT NULL,          -- 'evm' | 'btc' | 'xrp' etc.
  network text NOT NULL,        -- 'ethereum' | 'sepolia' | 'bitcoin' | 'xrpl-mainnet' etc.
  asset text,                   -- Optional (NULL for chain-level)
  address text NOT NULL,        -- Receiving address (XRP uses fixed address)
  memo_tag text,                -- XRP: Destination Tag etc.
  derivation_path text,         -- EVM/BTC: HD derivation path, XRP is NULL
  address_index integer,        -- HD index
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, chain, network, asset)
);
```

**Features:**
- EVM: Allocates EOA per user (HD wallet derived).
- BTC: Supports address allocation from `xpub` (tracked by index).
- XRP: Fixed address + user-specific Tag. `address` is fixed, identified by `memo_tag`.
- **RLS**: Only owner can read, admins can operate on all records.

### 7. chain_configs Table (Acceptance Switch/Confirmation Count)
Manages "deposit acceptance status" and "required confirmations" per chain/asset.

```sql
CREATE TABLE chain_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,                -- 'evm' | 'btc' | 'xrp' etc.
  network text NOT NULL,              -- 'ethereum' | 'sepolia' | 'bitcoin' | 'xrpl-mainnet' etc.
  asset text NOT NULL,                -- 'ETH' | 'USDT' | 'BTC' | 'XRP' etc.
  deposit_enabled boolean NOT NULL DEFAULT false,
  min_confirmations integer NOT NULL DEFAULT 0,
  min_deposit decimal(20,8) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain, network, asset)
);
```

**Features:**
- Admins only can read/write (RLS).
- Frontend references `deposit_enabled` and `min_confirmations` to display UI accordingly.

## Utility Functions

### has_role(uuid, app_role) → boolean
Checks if the specified user has a specific role

```sql
CREATE OR REPLACE FUNCTION has_role(user_id uuid, role app_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = has_role.user_id
    AND user_roles.role = has_role.role
  );
$$;
```

### update_updated_at_column()
Trigger function for auto-updating `updated_at` column

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

## RLS (Row Level Security) Policies

### Basic Patterns
1. **Access only own data**: `auth.uid() = user_id`
2. **Admins can access all**: `has_role(auth.uid(), 'admin')`
3. **Combined**: `auth.uid() = user_id OR has_role(auth.uid(), 'admin')`

### Security Features
- RLS applied to all operations
- Dual protection for frontend and backend
- Strict admin privilege control

## Data Integrity

### Constraints
- Foreign key constraints for referential integrity
- CHECK constraints for value validity
- UNIQUE constraints to prevent duplicates

### Notes
- Auto-sync between deposits/withdrawals and asset balances is not implemented (deposits are detected → reflected after confirmation count, withdrawals are requested → manually transferred)
- Transaction processing requires manual management (server does not hold private keys)

## Reference: chain_configs Initial Values Sample (INSERT Example)

```sql
INSERT INTO chain_configs (chain, network, asset, deposit_enabled, min_confirmations, min_deposit)
VALUES
  ('evm','ethereum','ETH', true, 12, 0.01),      -- ETH: 0.01-0.05 ETH (recommended minimum)
  ('evm','ethereum','USDT', true, 12, 1.0),      -- USDT(ERC-20): 1 USDT
  ('btc','bitcoin','BTC', true, 3, 0.0001),      -- BTC: 0.0001-0.001 BTC (recommended minimum)
  ('xrp','xrpl-mainnet','XRP', true, 1, 20.0),   -- XRP: 20-50 XRP (recommended minimum)
  ('tron','tron-mainnet','TRX', true, 19, 10.0), -- TRX: 10-100 TRX (recommended minimum)
  ('tron','tron-mainnet','USDT', true, 19, 1.0), -- USDT(TRC-20): 1 USDT
  ('ada','cardano-mainnet','ADA', true, 15, 1.0);
```
