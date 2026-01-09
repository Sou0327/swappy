# データベーススキーマ (Supabase PostgreSQL)

## スキーマ概要
- **スキーマ**: `public`
- **マイグレーション**: `supabase/migrations/`
- **RLS**: すべてのテーブルで有効

## テーブル構成

### 1. profiles テーブル
ユーザーの基本情報を格納

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

**特徴:**
- `auth.users` への外部キー制約
- `handle_new_user` トリガーで自動作成
- **RLS**: 本人のみ参照・更新可、管理者は全件操作可

### 2. user_roles テーブル
ユーザーのロール管理

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

**特徴:**
- ユーザーごとに複数ロール可能
- **制約**: `UNIQUE(user_id, role)`
- **RLS**: 本人のロールのみ参照可、管理者は全件操作可

### 3. deposits テーブル
入金記録（チェーン/ネットワーク情報を含む）

```sql
CREATE TABLE deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  amount decimal(20,8) NOT NULL,
  currency text DEFAULT 'USD',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  transaction_hash text,
  wallet_address text,
  chain text,         -- 'evm' | 'btc' | 'xrp' など
  network text,       -- 'ethereum' | 'arbitrum' | 'mainnet' | 'testnet' など
  asset text,         -- 'ETH' | 'USDC' | 'BTC' | 'XRP' など
  memo_tag text,      -- XRPのDestination Tag等
  confirmations_required integer DEFAULT 0,
  confirmations_observed integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  confirmed_at timestamp with time zone,
  confirmed_by uuid REFERENCES auth.users(id),
  notes text
);
```

**特徴:**
- **金額**: 高精度decimal(20,8)
- **ステータス**: 'pending', 'confirmed', 'rejected'
- **承認追跡**: `confirmed_at`, `confirmed_by`
- **確認数**: `confirmations_required`, `confirmations_observed`
- **RLS**: 本人のみ参照・作成可、管理者は全件操作可

### 4. withdrawals テーブル
出金記録（手動送金の申請レコード）

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

**特徴:**
- `deposits` と同様の構造
- **必須**: `wallet_address`
- **RLS**: 本人のみ参照・作成可、管理者は全件操作可

### 5. user_assets テーブル
ユーザーの資産残高

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

**特徴:**
- **制約**: `UNIQUE(user_id, currency)` - 通貨ごとに1レコード
- **残高**: `balance` (利用可能) + `locked_balance` (ロック済み)
- **自動更新**: `updated_at` トリガー
- **RLS**: 本人のみ参照可、管理者は全件操作可

### 6. deposit_addresses テーブル（フェーズ1・提案）
ユーザー毎にチェーン/ネットワーク別の受取アドレスを管理（EVMは EOA/HD 由来、BTC は xpub 派生、XRP は固定アドレス＋Tag）。

```sql
CREATE TABLE deposit_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  chain text NOT NULL,          -- 'evm' | 'btc' | 'xrp' など
  network text NOT NULL,        -- 'ethereum' | 'sepolia' | 'bitcoin' | 'xrpl-mainnet' など
  asset text,                   -- 省略可（チェーン単位の時はNULL）
  address text NOT NULL,        -- 受取用アドレス（XRPは固定アドレス）
  memo_tag text,                -- XRP: Destination Tag 等
  derivation_path text,         -- EVM/BTC: HDの派生パス、XRPはNULL
  address_index integer,        -- HDのindex
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, chain, network, asset)
);
```

**特徴:**
- EVM: ユーザー毎に EOA を払い出し（HDウォレット由来）。
- BTC: `xpub` からのアドレス払い出しに対応（index で追跡）。
- XRP: 固定アドレス＋ユーザー毎の Tag。`address` は固定、`memo_tag` で識別。
- **RLS**: 本人のみ参照可、管理者は全件操作可。

### 7. chain_configs テーブル（受付スイッチ/確認数）
チェーン/資産毎の「入金受付可否」と「必要確認数」を管理。

```sql
CREATE TABLE chain_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,                -- 'evm' | 'btc' | 'xrp' など
  network text NOT NULL,              -- 'ethereum' | 'sepolia' | 'bitcoin' | 'xrpl-mainnet' 等
  asset text NOT NULL,                -- 'ETH' | 'USDT' | 'BTC' | 'XRP' 等
  deposit_enabled boolean NOT NULL DEFAULT false,
  min_confirmations integer NOT NULL DEFAULT 0,
  min_deposit decimal(20,8) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain, network, asset)
);
```

**特徴:**
- 管理者のみ読み書き可（RLS）。
- フロントは `deposit_enabled` と `min_confirmations` を参照して UI を出し分け。

## ユーティリティ関数

### has_role(uuid, app_role) → boolean
指定ユーザーが特定ロールを持つかチェック

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
`updated_at` カラムの自動更新トリガー関数

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

## RLS (Row Level Security) ポリシー

### 基本パターン
1. **本人データのみアクセス可**: `auth.uid() = user_id`
2. **管理者はすべてアクセス可**: `has_role(auth.uid(), 'admin')`
3. **組み合わせ**: `auth.uid() = user_id OR has_role(auth.uid(), 'admin')`

### セキュリティ特徴
- すべての操作でRLS適用
- フロントエンドとバックエンドの二重保護
- 管理者権限の厳密な制御

## データ整合性

### 制約
- 外部キー制約による参照整合性
- CHECK制約による値の妥当性
- UNIQUE制約による重複防止

### 注意点
- 入出金と資産残高の自動同期は未実装（入金は検知→確認数で反映、出金は申請→手動送金）
- トランザクション処理は手動管理が必要（サーバは秘密鍵を保持しない）

## 参考: chain_configs 初期値サンプル（INSERT例）

```sql
INSERT INTO chain_configs (chain, network, asset, deposit_enabled, min_confirmations, min_deposit)
VALUES
  ('evm','ethereum','ETH', true, 12, 0.01),      -- ETH: 0.01〜0.05 ETH（推奨下限）
  ('evm','ethereum','USDT', true, 12, 1.0),      -- USDT(ERC-20): 1 USDT
  ('btc','bitcoin','BTC', true, 3, 0.0001),      -- BTC: 0.0001〜0.001 BTC（推奨下限）
  ('xrp','xrpl-mainnet','XRP', true, 1, 20.0),   -- XRP: 20〜50 XRP（推奨下限）
  ('tron','tron-mainnet','TRX', true, 19, 10.0), -- TRX: 10〜100 TRX（推奨下限）
  ('tron','tron-mainnet','USDT', true, 19, 1.0), -- USDT(TRC-20): 1 USDT
  ('ada','cardano-mainnet','ADA', true, 15, 1.0);
```
