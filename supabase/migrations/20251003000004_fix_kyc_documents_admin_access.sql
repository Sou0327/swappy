-- 🛠️ KYC書類の管理者アクセス復元
-- 目的: 管理画面でKYC書類が確認できない本番バグの修正
-- 問題: 20251001250000のマイグレーションで管理者のSELECT権限が削除されていた
-- 解決: has_role関数を使わずにuser_rolesテーブルを直接参照して管理者アクセスを復元

BEGIN;

-- kyc_documents テーブルの既存ポリシーを削除
DROP POLICY IF EXISTS kyc_documents_select_lightweight ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_insert_lightweight ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_update_lightweight ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_delete_lightweight ON public.kyc_documents;

-- SELECT ポリシー: ユーザー自身 OR 管理者 OR モデレーター
CREATE POLICY kyc_documents_select_with_admin
  ON public.kyc_documents
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- INSERT ポリシー: ユーザー自身 OR 管理者
CREATE POLICY kyc_documents_insert_with_admin
  ON public.kyc_documents
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- UPDATE ポリシー: ユーザー自身 OR 管理者（ステータス変更用）
CREATE POLICY kyc_documents_update_with_admin
  ON public.kyc_documents
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- DELETE ポリシー: ユーザー自身 OR 管理者
CREATE POLICY kyc_documents_delete_with_admin
  ON public.kyc_documents
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '🛠️ KYC書類の管理者アクセスを復元しました';
  RAISE NOTICE '✅ 管理者・モデレーターは全てのKYC書類にアクセス可能';
  RAISE NOTICE '✅ has_role関数を使わないためパフォーマンスも維持';
  RAISE NOTICE '🔒 一般ユーザーは自分のKYC書類のみアクセス可能';
  RAISE NOTICE '📋 本番環境のバグが修正されます';
END $$;

COMMIT;