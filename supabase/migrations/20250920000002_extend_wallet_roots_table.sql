-- Undefined HDウォレット・マスターキー管理システム
-- Phase 1-A: wallet_roots テーブル拡張
-- 作成日: 2025年9月20日
-- 目的: 既存wallet_rootsテーブルにHDウォレット対応カラムを追加

-- ====================================
-- 1. 新カラム追加（既存データ保持）
-- ====================================

-- マスターキー参照（外部キー）
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS master_key_id UUID REFERENCES public.master_keys(id);

-- BIP32導出パス（実際の導出パス記録）
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS derivation_path TEXT;

-- チェーンコード（HDKey導出に必要）
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS chain_code TEXT;

-- 自動生成フラグ（新システムで生成されたxpub）
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

-- レガシーデータフラグ（手動で挿入されたxpub）
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS legacy_data BOOLEAN DEFAULT true;

-- 検証済みフラグ（xpub導出の正確性確認済み）
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- 最終検証日時
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- ====================================
-- 2. 既存データの更新
-- ====================================

-- 既存レコードをlegacyデータとしてマーク
UPDATE public.wallet_roots
SET
  legacy_data = true,
  auto_generated = false,
  verified = false
WHERE legacy_data IS NULL OR legacy_data = false;

-- ====================================
-- 3. インデックス追加・最適化
-- ====================================

-- マスターキー参照検索用
CREATE INDEX IF NOT EXISTS idx_wallet_roots_master_key_id
ON public.wallet_roots(master_key_id);

-- 自動生成xpub検索用（新システム専用）
CREATE INDEX IF NOT EXISTS idx_wallet_roots_auto_generated
ON public.wallet_roots(auto_generated, active)
WHERE auto_generated = true;

-- レガシーデータ検索用（既存システム用）
CREATE INDEX IF NOT EXISTS idx_wallet_roots_legacy_data
ON public.wallet_roots(legacy_data, active)
WHERE legacy_data = true;

-- チェーン・ネットワーク・アセット・タイプ別検索用
CREATE INDEX IF NOT EXISTS idx_wallet_roots_chain_network_asset_type
ON public.wallet_roots(chain, network, asset, auto_generated, active);

-- ====================================
-- 4. 制約・バリデーション追加
-- ====================================

-- 自動生成の場合はmaster_key_idとderivation_pathが必須
ALTER TABLE public.wallet_roots
ADD CONSTRAINT check_auto_generated_requirements
CHECK (
  NOT auto_generated OR (
    master_key_id IS NOT NULL AND
    derivation_path IS NOT NULL
  )
);

-- レガシーデータと自動生成データの排他制御
ALTER TABLE public.wallet_roots
ADD CONSTRAINT check_legacy_auto_exclusive
CHECK (NOT (legacy_data = true AND auto_generated = true));

-- ====================================
-- 5. コメント・ドキュメント更新
-- ====================================

COMMENT ON COLUMN public.wallet_roots.master_key_id IS 'マスターキー参照（HDウォレット用）';
COMMENT ON COLUMN public.wallet_roots.derivation_path IS 'BIP32導出パス（例: m/44''/60''/0''）';
COMMENT ON COLUMN public.wallet_roots.chain_code IS 'HDKey チェーンコード（16進数）';
COMMENT ON COLUMN public.wallet_roots.auto_generated IS '新システムで自動生成されたxpub';
COMMENT ON COLUMN public.wallet_roots.legacy_data IS '手動で挿入されたレガシーxpub';
COMMENT ON COLUMN public.wallet_roots.verified IS 'xpub導出の正確性確認済み';
COMMENT ON COLUMN public.wallet_roots.last_verified_at IS '最終検証実行日時';

-- ====================================
-- 6. ヘルパー関数作成
-- ====================================

-- アクティブなwallet_rootを取得（新システム優先）
CREATE OR REPLACE FUNCTION get_active_wallet_root(
  p_chain TEXT,
  p_network TEXT,
  p_asset TEXT
)
RETURNS TABLE(
  id UUID,
  xpub TEXT,
  derivation_path TEXT,
  master_key_id UUID,
  auto_generated BOOLEAN,
  legacy_data BOOLEAN
) AS $$
BEGIN
  -- 新システム（auto_generated）を優先
  RETURN QUERY
  SELECT
    wr.id,
    wr.xpub,
    wr.derivation_path,
    wr.master_key_id,
    wr.auto_generated,
    wr.legacy_data
  FROM public.wallet_roots wr
  WHERE
    wr.chain = p_chain AND
    wr.network = p_network AND
    wr.asset = p_asset AND
    wr.active = true AND
    wr.auto_generated = true
  ORDER BY wr.created_at ASC
  LIMIT 1;

  -- 新システムにない場合はレガシーを返す
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      wr.id,
      wr.xpub,
      wr.derivation_path,
      wr.master_key_id,
      wr.auto_generated,
      wr.legacy_data
    FROM public.wallet_roots wr
    WHERE
      wr.chain = p_chain AND
      wr.network = p_network AND
      wr.asset = p_asset AND
      wr.active = true AND
      wr.legacy_data = true
    ORDER BY wr.created_at ASC
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================
-- 7. 統計・検証クエリ
-- ====================================

-- 拡張完了の確認
DO $$
DECLARE
  legacy_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM public.wallet_roots;
  SELECT COUNT(*) INTO legacy_count FROM public.wallet_roots WHERE legacy_data = true;

  RAISE NOTICE 'wallet_roots table extension completed:';
  RAISE NOTICE '  Total records: %', total_count;
  RAISE NOTICE '  Legacy records: %', legacy_count;
  RAISE NOTICE '  New system ready for implementation';
END $$;