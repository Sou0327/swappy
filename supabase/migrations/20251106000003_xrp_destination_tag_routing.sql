-- P0-④: XRP Destination Tagルーティング
--
-- 目的:
-- 1. 個別アドレス方式から共有アドレス+Destination Tag方式へ移行
-- 2. 10 XRP準備金を1アドレス分のみに削減
-- 3. 4.2億ユーザーまでスケール可能

-- ================================================
-- Step 1: XRP Master Address管理テーブル
-- ================================================

-- XRPマスターアドレス管理（hot wallet）
CREATE TABLE IF NOT EXISTS public.xrp_master_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- マスターアドレス情報
  address text NOT NULL UNIQUE,
  network text NOT NULL CHECK (network IN ('mainnet', 'testnet')),

  -- 秘密鍵（AES-256-GCM暗号化）
  encrypted_private_key text NOT NULL,
  private_key_iv text NOT NULL,
  salt text NOT NULL,
  key_version integer DEFAULT 2 NOT NULL, -- P0-③と整合

  -- Tag管理
  next_tag integer DEFAULT 1 NOT NULL CHECK (next_tag >= 1 AND next_tag <= 4294967295),
  max_tag integer DEFAULT 4294967295 NOT NULL,

  -- ステータス
  is_active boolean DEFAULT true,
  is_hot_wallet boolean DEFAULT true, -- 自動転送用hot wallet

  -- タイムスタンプ
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- 説明
  description text
);

COMMENT ON TABLE public.xrp_master_addresses IS
  'XRP共有マスターアドレス管理（Destination Tag方式）';

-- インデックス
CREATE INDEX idx_xrp_master_addresses_active
ON public.xrp_master_addresses(network, is_active)
WHERE is_active = true;

-- RLS有効化
ALTER TABLE public.xrp_master_addresses ENABLE ROW LEVEL SECURITY;

-- Admin権限のみアクセス可能
CREATE POLICY "admin_only_xrp_master_addresses"
ON public.xrp_master_addresses FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at自動更新
CREATE TRIGGER update_xrp_master_addresses_updated_at
  BEFORE UPDATE ON public.xrp_master_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================
-- Step 2: Deposit Routesテーブル（Tag管理）
-- ================================================

-- ユーザーごとのDestination Tag割り当て
CREATE TABLE IF NOT EXISTS public.deposit_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ユーザー識別
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- チェーン・ネットワーク
  chain text NOT NULL,
  network text NOT NULL,

  -- ルーティング方式
  routing_type text NOT NULL CHECK (routing_type IN ('destination_tag', 'address', 'memo')),

  -- XRP固有
  master_address_id uuid REFERENCES public.xrp_master_addresses(id) ON DELETE SET NULL,
  destination_tag integer CHECK (destination_tag >= 1 AND destination_tag <= 4294967295),

  -- ステータス
  is_active boolean DEFAULT true,

  -- タイムスタンプ
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.deposit_routes IS
  'Destination Tag等によるルーティング情報管理';

-- ユニーク制約
CREATE UNIQUE INDEX idx_deposit_routes_user_chain_active
ON public.deposit_routes(user_id, chain, network)
WHERE is_active = true;

-- XRP: master_address + destination_tagのユニーク制約
CREATE UNIQUE INDEX idx_deposit_routes_xrp_tag_unique
ON public.deposit_routes(master_address_id, destination_tag)
WHERE chain = 'xrp' AND is_active = true;

-- インデックス
CREATE INDEX idx_deposit_routes_user_id ON public.deposit_routes(user_id);
CREATE INDEX idx_deposit_routes_master_address_tag
ON public.deposit_routes(master_address_id, destination_tag)
WHERE chain = 'xrp';

-- RLS有効化
ALTER TABLE public.deposit_routes ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "Users can view their own deposit routes"
ON public.deposit_routes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all deposit routes"
ON public.deposit_routes FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- P0-④ 修正: INSERT/UPDATEポリシー追加（ユーザーが自分のルーティングを作成・更新可能に）
CREATE POLICY "Users can insert own deposit routes"
ON public.deposit_routes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deposit routes"
ON public.deposit_routes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- updated_at自動更新
CREATE TRIGGER update_deposit_routes_updated_at
  BEFORE UPDATE ON public.deposit_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================
-- Step 3: Atomic Destination Tag割り当て関数
-- ================================================

CREATE OR REPLACE FUNCTION allocate_next_destination_tag(
  p_master_address_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_tag integer;
  v_max_tag integer;
BEGIN
  -- 原子的にnext_tagを取得・インクリメント
  UPDATE xrp_master_addresses
  SET
    next_tag = next_tag + 1,
    updated_at = now()
  WHERE id = p_master_address_id
    AND is_active = true
    AND next_tag < max_tag -- タグ枯渇チェック
  RETURNING next_tag - 1, max_tag INTO v_next_tag, v_max_tag;

  IF v_next_tag IS NULL THEN
    -- マスターアドレスが見つからないか、タグ枯渇
    SELECT max_tag INTO v_max_tag
    FROM xrp_master_addresses
    WHERE id = p_master_address_id;

    IF v_max_tag IS NULL THEN
      RAISE EXCEPTION 'Master address not found: %', p_master_address_id;
    ELSE
      RAISE EXCEPTION 'Destination tags exhausted for master address: %', p_master_address_id;
    END IF;
  END IF;

  RETURN v_next_tag;
END;
$$;

COMMENT ON FUNCTION allocate_next_destination_tag IS
  'XRP Destination Tagの原子的割り当て（競合制御）';

-- ================================================
-- Step 4: アクティブなマスターアドレス取得関数
-- ================================================

CREATE OR REPLACE FUNCTION get_active_xrp_master_address(
  p_network text DEFAULT 'mainnet'
)
RETURNS TABLE(
  id uuid,
  address text,
  network text,
  next_tag integer,
  max_tag integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    xma.id,
    xma.address,
    xma.network,
    xma.next_tag,
    xma.max_tag
  FROM xrp_master_addresses xma
  WHERE xma.network = p_network
    AND xma.is_active = true
    AND xma.next_tag < xma.max_tag -- タグ枯渇していない
  ORDER BY xma.next_tag ASC -- 最も使用率の低いものを優先
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_active_xrp_master_address IS
  'アクティブなXRPマスターアドレスを取得（タグ枯渇チェック付き）';

-- ================================================
-- Step 5: 統計情報取得関数
-- ================================================

CREATE OR REPLACE FUNCTION get_xrp_routing_stats()
RETURNS TABLE(
  network text,
  master_address text,
  total_tags_allocated integer,
  available_tags integer,
  utilization_percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    xma.network,
    xma.address as master_address,
    (xma.next_tag - 1) as total_tags_allocated,
    (xma.max_tag - xma.next_tag + 1) as available_tags,
    ROUND(((xma.next_tag - 1)::numeric / xma.max_tag::numeric) * 100, 2) as utilization_percentage
  FROM xrp_master_addresses xma
  WHERE xma.is_active = true
  ORDER BY xma.network, xma.next_tag DESC;
END;
$$;

COMMENT ON FUNCTION get_xrp_routing_stats IS
  'XRP Destination Tag使用状況の統計（運用監視用）';

-- ================================================
-- Step 6: 初期データ作成の準備
-- ================================================

-- 注意: マスターアドレスの実際の作成はadmin操作で行う
-- マイグレーション時点ではテーブル構造のみ作成

COMMENT ON COLUMN public.xrp_master_addresses.encrypted_private_key IS
  '秘密鍵（AES-256-GCM暗号化、P0-③のKDF強化適用）';

COMMENT ON COLUMN public.deposit_routes.destination_tag IS
  'XRP Destination Tag (1-4294967295)';
