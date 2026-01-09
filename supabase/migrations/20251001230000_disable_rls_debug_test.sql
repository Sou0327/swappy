-- 🧪 緊急デバッグ: profilesテーブルのRLSを完全無効化してテスト
-- ⚠️ セキュリティ警告: 本番環境では絶対に使用しない
-- 目的: RLSが問題の根本原因かを厳密に特定

BEGIN;

-- 現在のすべてのprofilesポリシーを削除
DROP POLICY IF EXISTS profiles_select_debug ON public.profiles;
DROP POLICY IF EXISTS profiles_update_debug ON public.profiles;
DROP POLICY IF EXISTS profiles_select_policy_direct ON public.profiles;
DROP POLICY IF EXISTS profiles_update_policy_direct ON public.profiles;

-- ⚠️ 一時的にRLS自体を無効化（デバッグ目的のみ）
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '🚨 緊急デバッグ: profilesテーブルのRLSを完全無効化しました';
  RAISE NOTICE '⚠️  セキュリティが無効です - テスト後すぐに復元してください';
  RAISE NOTICE '🎯 この状態で保存が動作すればRLSが根本原因です';
END $$;

COMMIT;