-- プロフィール検索のためのRLSポリシー修正
-- 送金機能でユーザー検索を可能にするため

-- 公開プロフィールの検索を許可するポリシーを追加
CREATE POLICY "Users can view public profiles for search"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    is_public = true AND
    user_handle IS NOT NULL AND
    user_handle != ''
  );

-- 完了ログ
DO $$
BEGIN
    RAISE NOTICE '✅ プロフィール検索用RLSポリシーが正常に追加されました';
    RAISE NOTICE '🔍 認証済みユーザーが公開プロフィールを検索可能になりました';
    RAISE NOTICE '🔒 is_public=trueかつuser_handleが設定されたプロフィールのみアクセス可能です';
END $$;