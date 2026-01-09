-- Fix admin_wallets UNIQUE constraint
--
-- 問題: UNIQUE(chain, network, asset, address) では、同じアセットに対して
--      異なるアドレスを登録すると新規レコードが追加される
-- 解決: UNIQUE(chain, network, asset) に変更して、1つのアセットに対して
--      1つのアドレスのみを許可

-- 1. 既存の間違った制約を削除
ALTER TABLE public.admin_wallets
  DROP CONSTRAINT IF EXISTS admin_wallets_chain_network_asset_address_key;

-- 2. 重複レコードのクリーンアップ（最新のレコードを残す）
-- 同じ(chain, network, asset)の組み合わせで複数のレコードがある場合、
-- created_atが最新のものを残して古いものを削除
DELETE FROM public.admin_wallets a
USING (
  SELECT chain, network, asset, MAX(created_at) as max_created_at
  FROM public.admin_wallets
  GROUP BY chain, network, asset
  HAVING COUNT(*) > 1
) b
WHERE a.chain = b.chain
  AND a.network = b.network
  AND a.asset = b.asset
  AND a.created_at < b.max_created_at;

-- 3. 正しい制約を追加
-- 同じ(chain, network, asset)の組み合わせに対して1つのアドレスのみ許可
ALTER TABLE public.admin_wallets
  ADD CONSTRAINT admin_wallets_chain_network_asset_key
  UNIQUE (chain, network, asset);

COMMENT ON CONSTRAINT admin_wallets_chain_network_asset_key ON public.admin_wallets IS
  '各チェーン/ネットワーク/アセットの組み合わせに対して1つの集約先アドレスのみを許可';
