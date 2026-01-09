-- 🛠️ KYCテーブルのRLSポリシー修正: has_role関数を避ける
-- 目的: アップロードセクション無限ローディング問題の解決

BEGIN;

-- kyc_settings テーブルのポリシー修正
DROP POLICY IF EXISTS kyc_settings_select_policy ON public.kyc_settings;
DROP POLICY IF EXISTS kyc_settings_insert_policy ON public.kyc_settings;
DROP POLICY IF EXISTS kyc_settings_update_policy ON public.kyc_settings;
DROP POLICY IF EXISTS kyc_settings_delete_policy ON public.kyc_settings;

-- 軽量で安全なポリシーを設定（has_role関数無し）
CREATE POLICY kyc_settings_select_lightweight
  ON public.kyc_settings
  FOR SELECT
  USING (true);  -- 全ユーザーが設定を参照可能

CREATE POLICY kyc_settings_insert_admin_only
  ON public.kyc_settings
  FOR INSERT
  WITH CHECK (false);  -- 挿入は管理機能のみ

CREATE POLICY kyc_settings_update_admin_only
  ON public.kyc_settings
  FOR UPDATE
  USING (false);  -- 更新は管理機能のみ

CREATE POLICY kyc_settings_delete_admin_only
  ON public.kyc_settings
  FOR DELETE
  USING (false);  -- 削除は管理機能のみ

-- kyc_documents テーブルのポリシー修正
DROP POLICY IF EXISTS kyc_documents_select_policy ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_insert_policy ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_update_policy ON public.kyc_documents;
DROP POLICY IF EXISTS kyc_documents_delete_policy ON public.kyc_documents;

-- 軽量で安全なポリシーを設定（has_role関数無し）
CREATE POLICY kyc_documents_select_lightweight
  ON public.kyc_documents
  FOR SELECT
  USING (user_id = auth.uid());  -- 自分の書類のみ参照可能

CREATE POLICY kyc_documents_insert_lightweight
  ON public.kyc_documents
  FOR INSERT
  WITH CHECK (user_id = auth.uid());  -- 自分の書類のみ挿入可能

CREATE POLICY kyc_documents_update_lightweight
  ON public.kyc_documents
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());  -- 自分の書類のみ更新可能

CREATE POLICY kyc_documents_delete_lightweight
  ON public.kyc_documents
  FOR DELETE
  USING (user_id = auth.uid());  -- 自分の書類のみ削除可能

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '🛠️ KYCテーブルのRLSポリシーを軽量版に修正しました';
  RAISE NOTICE '✅ has_role関数を避けてパフォーマンス問題を解決';
  RAISE NOTICE '🔒 ユーザーは自分のKYC書類のみアクセス可能';
  RAISE NOTICE '📋 KYC設定は全ユーザーが参照可能（管理操作は無効）';
END $$;

COMMIT;