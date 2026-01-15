-- Undefined HDウォレット・マスターキー管理システム
-- Phase 2: ユーザー個別HDウォレット対応
-- 作成日: 2026年1月15日

BEGIN;

-- ====================================
-- 1. master_keysテーブル拡張
-- ====================================

-- user_idカラム追加（ユーザー個別HDマスターキー用）
ALTER TABLE public.master_keys ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 認証ハッシュ追加（PBKDF2派生前の確認用）
ALTER TABLE public.master_keys ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ユーザー毎に1つのアクティブキー制約
CREATE UNIQUE INDEX idx_master_keys_user_active
  ON master_keys(user_id, active)
  WHERE user_id IS NOT NULL AND active = true;

-- 既存のアクティブキー制約を管理者用に限定
DROP INDEX IF EXISTS idx_master_keys_single_active;
CREATE UNIQUE INDEX idx_master_keys_admin_single
  ON master_keys((true))
  WHERE user_id IS NULL AND active = true;

-- 既存の制約チェックを調整
ALTER TABLE public.master_keys
  DROP CONSTRAINT IF EXISTS master_keys_active_check;

-- active is not null チェックは維持
ALTER TABLE public.master_keys
  ADD CONSTRAINT master_keys_active_check CHECK (active IS NOT NULL);

-- コメント更新
COMMENT ON COLUMN public.master_keys.user_id IS 'ユーザー個別HDマスターキーの場合はユーザーID、管理者用はNULL';
COMMENT ON COLUMN public.master_keys.password_hash IS 'PBKDF2派生前のパスワードハッシュ（認証確認用）';

-- ====================================
-- 2. wallet_rootsテーブル拡張
-- ====================================

-- user_idカラム追加
ALTER TABLE public.wallet_roots ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 既存の一意制約削除
DROP INDEX IF EXISTS wallet_roots_unique;

-- 管理者用：user_id=NULL, master_key_id+chain+networkで一意
CREATE UNIQUE INDEX idx_wallet_roots_admin
  ON wallet_roots(master_key_id, chain, network)
  WHERE user_id IS NULL;

-- ユーザー用：user_id+chain+networkで一意
CREATE UNIQUE INDEX idx_wallet_roots_user
  ON wallet_roots(user_id, chain, network)
  WHERE user_id IS NOT NULL;

-- 既存の制約チェックを調整
ALTER TABLE public.wallet_roots
  DROP CONSTRAINT IF EXISTS check_auto_generated_requirements;

ALTER TABLE public.wallet_roots
  ADD CONSTRAINT check_auto_generated_requirements
  CHECK (
    NOT auto_generated OR (
      master_key_id IS NOT NULL AND
      derivation_path IS NOT NULL AND
      user_id IS NOT NULL
    )
  );

-- コメント更新
COMMENT ON COLUMN public.wallet_roots.user_id IS 'ユーザー個別HDウォレットの場合はユーザーID、管理者用はNULL';

-- ====================================
-- 3. profilesテーブル拡張
-- ====================================

-- ウォレットセットアップ完了フラグ追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_setup_completed BOOLEAN DEFAULT false;

-- コメント追加
COMMENT ON COLUMN public.profiles.wallet_setup_completed IS 'ユーザー個別HDウォレットセットアップ完了フラグ';

COMMIT;

-- ====================================
-- 4. RLSポリシー更新
-- ====================================

BEGIN;

-- master_keys: ユーザーは自身のキーをSELECT可能
DROP POLICY IF EXISTS "master_keys_admin_policy" ON public.master_keys;

CREATE POLICY "Admins can manage all master keys"
  ON public.master_keys FOR ALL
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY "Users can view own master keys"
  ON public.master_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- wallet_roots: ユーザーは自身のルートをSELECT可能
DROP POLICY IF EXISTS "wallet_roots_policy" ON public.wallet_roots;

CREATE POLICY "Admins can manage all wallet roots"
  ON public.wallet_roots FOR ALL
  TO authenticated
  USING (public.has_role(public.requesting_user_id(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(public.requesting_user_id(), 'admin'::public.app_role));

CREATE POLICY "Users can view own wallet roots"
  ON public.wallet_roots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- profiles: ユーザーはwallet_setup_completedを更新可能
CREATE POLICY "Users can update own wallet_setup_completed"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMIT;

-- ====================================
-- 5. 既存データ移行
-- ====================================

BEGIN;

-- 既存wallet_rootsは保持されます（管理者用ルートとしてuser_id=NULL）
-- seed_wallet_roots.sqlで管理者用ルートが挿入されます

-- 全ユーザーのwallet_setup_completedをfalseに設定
UPDATE public.profiles SET wallet_setup_completed = false WHERE wallet_setup_completed IS NULL;

COMMIT;

-- ====================================
-- 6. 検証クエリ
-- ====================================

DO $$
DECLARE
  master_keys_count INTEGER;
  wallet_roots_count INTEGER;
  profiles_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO master_keys_count FROM public.master_keys;
  SELECT COUNT(*) INTO wallet_roots_count FROM public.wallet_roots;
  SELECT COUNT(*) INTO profiles_count FROM public.profiles WHERE wallet_setup_completed = false;

  RAISE NOTICE '====================================';
  RAISE NOTICE 'マイグレーション検証結果';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'master_keysレコード数: %', master_keys_count;
  RAISE NOTICE 'wallet_rootsレコード数: %', wallet_roots_count;
  RAISE NOTICE 'wallet_setup_completed=falseのユーザー数: %', profiles_count;
  RAISE NOTICE '====================================';
  RAISE NOTICE '✅ マイグレーション成功';
  RAISE NOTICE '====================================';
END $$;
