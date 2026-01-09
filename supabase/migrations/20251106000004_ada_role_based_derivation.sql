-- P0-⑤: Cardano (ADA) Role-Based Derivation
--
-- 目的:
-- 1. CIP-1852標準に準拠したCardanoアドレス生成
-- 2. Role-based derivation（external/stake）の実装
-- 3. BaseAddress（payment + stake credentials）の正しい生成

-- ================================================
-- Step 1: deposit_addressesテーブルの拡張
-- ================================================

-- Cardano固有のroleカラムを追加
ALTER TABLE public.user_deposit_addresses
ADD COLUMN IF NOT EXISTS role integer CHECK (role IN (0, 1, 2));

COMMENT ON COLUMN public.user_deposit_addresses.role IS
  'Cardano derivation role: 0=external(受信), 1=internal(change), 2=stake';

-- Stake addressカラムを追加
ALTER TABLE public.user_deposit_addresses
ADD COLUMN IF NOT EXISTS stake_address text;

COMMENT ON COLUMN public.user_deposit_addresses.stake_address IS
  'Cardano stake address (reward address)';

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_user_deposit_addresses_role
ON public.user_deposit_addresses(user_id, currency, network, role)
WHERE currency = 'ADA';

-- ================================================
-- Step 2: wallet_rootsテーブルの拡張
-- ================================================

-- Cardano chain xpub格納用カラム
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS external_chain_xpub text;

ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS stake_chain_xpub text;

COMMENT ON COLUMN public.wallet_roots.external_chain_xpub IS
  'Cardano external chain xpub (role=0, 受信用)';

COMMENT ON COLUMN public.wallet_roots.stake_chain_xpub IS
  'Cardano stake chain xpub (role=2, ステーキング用)';

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_wallet_roots_ada_xpubs
ON public.wallet_roots(chain, network, external_chain_xpub, stake_chain_xpub)
WHERE chain = 'ada';

-- ================================================
-- Step 3: アドレスバージョン管理
-- ================================================

-- address_versionカラムを追加（key_versionと同様のパターン）
ALTER TABLE public.user_deposit_addresses
ADD COLUMN IF NOT EXISTS address_version integer DEFAULT 1 NOT NULL;

COMMENT ON COLUMN public.user_deposit_addresses.address_version IS
  'アドレス生成バージョン: 1=legacy(単純導出), 2=CIP-1852(role-based)';

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_user_deposit_addresses_version
ON public.user_deposit_addresses(address_version)
WHERE currency = 'ADA';

-- ================================================
-- Step 4: Cardano BaseAddress検証関数
-- ================================================

CREATE OR REPLACE FUNCTION validate_cardano_base_address(
  p_address text,
  p_network text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- BaseAddressの基本検証
  -- Mainnet: addr1で始まる
  -- Testnet: addr_testで始まる
  IF p_network = 'mainnet' THEN
    RETURN p_address ~ '^addr1[a-z0-9]+$';
  ELSIF p_network = 'testnet' THEN
    RETURN p_address ~ '^addr_test[a-z0-9]+$';
  ELSE
    RETURN false;
  END IF;
END;
$$;

COMMENT ON FUNCTION validate_cardano_base_address IS
  'Cardano BaseAddressの基本フォーマット検証';

-- ================================================
-- Step 5: 統計情報取得関数
-- ================================================

CREATE OR REPLACE FUNCTION get_cardano_address_stats()
RETURNS TABLE(
  address_version integer,
  role integer,
  count bigint,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      uda.address_version,
      uda.role,
      COUNT(*) as count
    FROM user_deposit_addresses uda
    WHERE uda.currency = 'ADA'
      AND uda.is_active = true
    GROUP BY uda.address_version, uda.role
  ),
  total AS (
    SELECT SUM(count) as total_count FROM stats
  )
  SELECT
    s.address_version,
    s.role,
    s.count,
    ROUND((s.count::numeric / NULLIF(t.total_count, 0)::numeric) * 100, 2) as percentage
  FROM stats s
  CROSS JOIN total t
  ORDER BY s.address_version, s.role;
END;
$$;

COMMENT ON FUNCTION get_cardano_address_stats IS
  'Cardanoアドレス生成バージョンとrole別の統計（運用監視用）';

-- ================================================
-- Step 6: 既存データの整合性確認
-- ================================================

-- 既存のADAアドレスは全てaddress_version=1（legacy）
-- roleはNULL（単純導出方式では不要）

DO $$
DECLARE
  v_legacy_ada_count integer;
BEGIN
  SELECT COUNT(*) INTO v_legacy_ada_count
  FROM user_deposit_addresses
  WHERE currency = 'ADA'
    AND is_active = true;

  RAISE NOTICE 'Existing active ADA addresses (legacy): %', v_legacy_ada_count;
  RAISE NOTICE 'These will continue to work with legacy derivation';
  RAISE NOTICE 'New ADA addresses will use address_version=2 (CIP-1852 role-based)';
END $$;

-- ================================================
-- Step 7: Cardano導出パステンプレート
-- ================================================

COMMENT ON TABLE public.wallet_roots IS
  'HDウォレット Root鍵管理

Cardano (ADA) 導出パス:
- Account: m/1852''/1815''/0''
- External chain (role=0): account_xpub/0/X (受信用)
- Stake chain (role=2): account_xpub/2/X (ステーキング用)
- BaseAddress = Payment(external/X) + Stake(stake/0)';
