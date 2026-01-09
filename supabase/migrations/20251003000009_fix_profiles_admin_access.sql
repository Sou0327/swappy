-- 🚨 緊急修正: profilesテーブルの管理者アクセス権限を復元
-- 目的: KYC申請の承認・拒否ができない問題の修正
-- 問題: 20251001240000_restore_security.sqlで管理者権限チェックが削除された
-- 影響: 管理者がユーザーのprofilesを更新できず、KYC承認ができない

BEGIN;

-- 不完全なポリシーを削除
DROP POLICY IF EXISTS profiles_select_secure ON public.profiles;
DROP POLICY IF EXISTS profiles_update_secure ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_secure ON public.profiles;

-- 管理者権限を含む正しいポリシーを作成

-- SELECT: ユーザー自身 OR 管理者
CREATE POLICY profiles_select_with_admin
  ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- INSERT: ユーザー自身のみ（新規登録時）
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- UPDATE: ユーザー自身 OR 管理者
CREATE POLICY profiles_update_with_admin
  ON public.profiles
  FOR UPDATE
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '🚨 緊急修正: profilesテーブルの管理者アクセス権限を復元しました';
  RAISE NOTICE '✅ 管理者はユーザーのprofilesを更新可能になります';
  RAISE NOTICE '✅ KYC申請の承認・拒否が機能します';
  RAISE NOTICE '🔒 一般ユーザーは自分のprofilesのみアクセス可能です';
  RAISE NOTICE '📋 has_role関数で管理者権限を確認します';
END $$;

COMMIT;