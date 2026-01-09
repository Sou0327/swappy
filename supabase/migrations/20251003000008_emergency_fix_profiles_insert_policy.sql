-- 🚨 緊急修正: profilesテーブルのINSERTポリシー追加
-- 目的: ログイン・ログアウトができない問題の修正
-- 問題: 20251001240000_restore_security.sqlでINSERTポリシーが欠けていた
-- 影響: 新規ユーザーのprofilesレコード作成が失敗し、ログインができない

BEGIN;

-- INSERTポリシーを追加（handle_new_user()トリガー用）
CREATE POLICY profiles_insert_secure
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '🚨 緊急修正: profilesテーブルのINSERTポリシーを追加しました';
  RAISE NOTICE '✅ 新規ユーザーのprofilesレコード作成が可能になります';
  RAISE NOTICE '✅ ログイン・ログアウト機能が復旧します';
  RAISE NOTICE '📋 handle_new_user()トリガーが正常に動作します';
END $$;

COMMIT;