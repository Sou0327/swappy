-- Undefined HDウォレット・マスターキー管理システム
-- Phase 1-A: master_keys テーブル作成
-- 作成日: 2025年9月20日

-- ====================================
-- 1. master_keys テーブル作成
-- ====================================

CREATE TABLE IF NOT EXISTS public.master_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 暗号化されたニーモニック（AES-256-GCM）
  encrypted_mnemonic TEXT NOT NULL,

  -- 暗号化用の初期化ベクター（12バイト、base64エンコード）
  mnemonic_iv TEXT NOT NULL,

  -- PBKDF2用ソルト（32バイト、base64エンコード）
  salt TEXT NOT NULL,

  -- 作成者（admin権限必須）
  created_by UUID NOT NULL REFERENCES auth.users(id),

  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- ステータス管理
  active BOOLEAN DEFAULT true,
  backup_verified BOOLEAN DEFAULT false,

  -- 説明・メモ
  description TEXT,

  -- 制約: アクティブなマスターキーは1つのみ（一意インデックスで実装）
  CHECK (active IS NOT NULL)
);

-- ====================================
-- 2. RLS (Row Level Security) 設定
-- ====================================

-- RLS有効化
ALTER TABLE public.master_keys ENABLE ROW LEVEL SECURITY;

-- Admin権限のみアクセス可能
CREATE POLICY "admin_only_master_keys_policy"
  ON public.master_keys FOR ALL
  TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- ====================================
-- 3. インデックス・最適化
-- ====================================

-- アクティブなマスターキー検索用 & 一意制約（アクティブは1つのみ）
CREATE UNIQUE INDEX idx_master_keys_single_active ON public.master_keys((true)) WHERE active = true;

-- 作成者別検索用
CREATE INDEX idx_master_keys_created_by ON public.master_keys(created_by);

-- 作成日時順ソート用
CREATE INDEX idx_master_keys_created_at ON public.master_keys(created_at DESC);

-- ====================================
-- 4. トリガー設定
-- ====================================

-- updated_at自動更新
CREATE OR REPLACE FUNCTION update_master_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_master_keys_updated_at
  BEFORE UPDATE ON public.master_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_master_keys_updated_at();

-- ====================================
-- 5. コメント・ドキュメント
-- ====================================

COMMENT ON TABLE public.master_keys IS 'HDウォレット マスターキー管理テーブル（BIP39ニーモニック暗号化保存）';
COMMENT ON COLUMN public.master_keys.encrypted_mnemonic IS 'AES-256-GCM暗号化されたBIP39ニーモニック';
COMMENT ON COLUMN public.master_keys.mnemonic_iv IS 'AES-256-GCM初期化ベクター（12バイト、base64）';
COMMENT ON COLUMN public.master_keys.salt IS 'PBKDF2ソルト（32バイト、base64）';
COMMENT ON COLUMN public.master_keys.backup_verified IS 'バックアップ検証済みフラグ';

-- ====================================
-- 6. セキュリティ設定の検証
-- ====================================

-- RLS設定確認（PostgreSQL互換）
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE relname = 'master_keys'
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    RAISE EXCEPTION 'RLS is not enabled for master_keys table';
  END IF;

  RAISE NOTICE 'master_keys table created successfully with RLS enabled';
END $$;