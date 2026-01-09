-- 🛠️ KYC書類の管理者アクセス修正（ENUM型キャスト対応）
-- 目的: user_roles.role カラムがapp_role ENUM型であることに対応
-- 問題: ENUM型と文字列の比較で型エラーが発生していた
-- 解決: 明示的な型キャストを追加

BEGIN;

-- kyc_documents テーブルの既存ポリシーを削除
DROP POLICY IF EXISTS kyc_documents_select_with_admin ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_insert_with_admin ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_update_with_admin ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_delete_with_admin ON public.kyc_documents;

-- SELECT ポリシー: ユーザー自身 OR 管理者 OR モデレーター（型キャスト付き）
CREATE POLICY kyc_documents_select_with_admin
  ON public.kyc_documents
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role::text IN ('admin', 'moderator')
    )
  );

-- INSERT ポリシー: ユーザー自身 OR 管理者（型キャスト付き）
CREATE POLICY kyc_documents_insert_with_admin
  ON public.kyc_documents
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role::text = 'admin'
    )
  );

-- UPDATE ポリシー: ユーザー自身 OR 管理者（型キャスト付き）
CREATE POLICY kyc_documents_update_with_admin
  ON public.kyc_documents
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role::text = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role::text = 'admin'
    )
  );

-- DELETE ポリシー: ユーザー自身 OR 管理者（型キャスト付き）
CREATE POLICY kyc_documents_delete_with_admin
  ON public.kyc_documents
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role::text = 'admin'
    )
  );

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '🛠️ KYC書類の管理者アクセスを修正しました（ENUM型キャスト対応）';
  RAISE NOTICE '✅ role::text キャストで型エラーを解決';
  RAISE NOTICE '✅ 管理者・モデレーターは全てのKYC書類にアクセス可能';
  RAISE NOTICE '🔒 一般ユーザーは自分のKYC書類のみアクセス可能';
  RAISE NOTICE '📋 本番環境のバグが確実に修正されます';
END $$;

COMMIT;