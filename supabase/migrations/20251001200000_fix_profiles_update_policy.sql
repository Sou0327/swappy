-- 🔧 緊急修正: profilesテーブルのUPDATEポリシー問題を解決
-- 問題: public.requesting_user_id()関数経由の権限チェックでハングアップ
-- 解決: 直接的なauth.uid()チェックに戻す（動作実績のある方式）

BEGIN;

-- 現在の問題のあるポリシーを削除
DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;

-- 動作確認済みの直接的なポリシーを再作成
CREATE POLICY profiles_update_policy_direct
  ON public.profiles
  FOR UPDATE
  USING (
    -- 直接的なユーザーIDチェック（高速・確実）
    (id = auth.uid())
    -- 管理者権限チェック（関数は維持）
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    -- WITH CHECKも同様に修正
    (id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 念のため、SELECTポリシーも同様に修正（一貫性のため）
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;

CREATE POLICY profiles_select_policy_direct
  ON public.profiles
  FOR SELECT
  USING (
    (id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '✅ profilesテーブルのRLSポリシーを緊急修正しました';
  RAISE NOTICE '🔧 auth.uid()を直接使用する方式に戻しました';
  RAISE NOTICE '⚡ この修正により個人情報保存のハングアップ問題が解決されます';
END $$;

COMMIT;