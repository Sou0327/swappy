-- 🛡️ セキュリティ復元: profilesテーブルのRLSを再有効化
-- 安全なポリシーで復元（has_role関数を避ける）

BEGIN;

-- RLSを再有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 軽量で安全なポリシーを設定（管理者権限チェック無し）
CREATE POLICY profiles_select_secure
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY profiles_update_secure
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '🛡️ profilesテーブルのセキュリティを復元しました';
  RAISE NOTICE '✅ 軽量なRLSポリシーで保護されています';
  RAISE NOTICE '⚠️  has_role関数を避けてユーザーのみアクセス可能です';
END $$;

COMMIT;