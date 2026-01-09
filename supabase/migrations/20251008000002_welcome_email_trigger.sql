-- ウェルカムメール自動送信トリガー
-- 新規ユーザー登録時に自動的にウェルカムメールをキューに追加

-- トリガー関数: 新規プロフィール作成時にウェルカムメールをキュー
CREATE OR REPLACE FUNCTION public.queue_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  user_email text;
BEGIN
  -- auth.usersからメールアドレスを取得
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = NEW.id;

  -- ウェルカムメールをキューに追加
  -- メールアドレスが存在する場合のみ実行
  IF user_email IS NOT NULL THEN
    PERFORM public.queue_email(
      NEW.id,
      'welcome',
      user_email,
      jsonb_build_object(
        'user_name', COALESCE(NEW.full_name, 'お客様'),
        'email', user_email,
        'login_url', 'https://yourdomain.com/dashboard',
        'platform_name', 'Undefined Platform'
      )
    );

    RAISE LOG 'Welcome email queued for user %', NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーが発生してもプロフィール作成はブロックしない
    RAISE WARNING 'Failed to queue welcome email for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガー作成: public.profilesテーブルへの新規挿入時に実行
-- auth.usersの代わりにpublic.profilesを使用（権限の問題を回避）
DROP TRIGGER IF EXISTS queue_welcome_email_trigger ON public.profiles;
CREATE TRIGGER queue_welcome_email_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_welcome_email();

COMMENT ON FUNCTION public.queue_welcome_email IS '新規ユーザー登録時にウェルカムメールを自動的にキューに追加';
COMMENT ON TRIGGER queue_welcome_email_trigger ON public.profiles IS 'プロフィール作成後にウェルカムメールをキュー';