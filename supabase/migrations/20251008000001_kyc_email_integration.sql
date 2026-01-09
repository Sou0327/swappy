-- KYC承認・拒否時のメール送信統合
-- process_referral_reward 関数を拡張してメールキューに追加

CREATE OR REPLACE FUNCTION public.process_referral_reward()
RETURNS TRIGGER AS $$
DECLARE
  referral_record RECORD;
  referrer_reward numeric := 10.0; -- USDT
  referred_reward numeric := 5.0; -- USDT
  reward_currency text := 'USDT';
  user_email text;
  user_full_name text;
BEGIN
  -- KYC承認された場合
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- ユーザー情報を取得
    SELECT u.email, p.full_name INTO user_email, user_full_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = NEW.user_id;

    -- KYC承認メールをキューに追加
    IF user_email IS NOT NULL THEN
      PERFORM public.queue_email(
        NEW.user_id,
        'kyc_approved',
        user_email,
        jsonb_build_object(
          'user_name', COALESCE(user_full_name, 'お客様'),
          'kyc_level', NEW.kyc_level,
          'dashboard_url', 'https://yourdomain.com/dashboard'
        )
      );
    END IF;

    -- 紹介関係を検索
    SELECT * INTO referral_record
    FROM public.referrals
    WHERE referred_id = NEW.user_id
    AND status = 'pending'
    LIMIT 1;

    IF FOUND THEN
      -- 紹介関係をactiveに更新
      UPDATE public.referrals
      SET status = 'active', completed_at = NOW()
      WHERE id = referral_record.id;

      -- 紹介者への報酬（referrer_bonus）
      IF referral_record.referrer_id IS NOT NULL THEN
        INSERT INTO public.referral_rewards (referral_id, user_id, reward_type, currency, amount, status, notes)
        VALUES (
          referral_record.id,
          referral_record.referrer_id,
          'referrer_bonus',
          reward_currency,
          referrer_reward,
          'pending',
          'KYC approval bonus for referrer'
        );
      END IF;

      -- 被紹介者への報酬（referred_bonus）
      INSERT INTO public.referral_rewards (referral_id, user_id, reward_type, currency, amount, status, notes)
      VALUES (
        referral_record.id,
        NEW.user_id,
        'referred_bonus',
        reward_currency,
        referred_reward,
        'pending',
        'KYC approval welcome bonus'
      );
    END IF;

  -- KYC拒否された場合
  ELSIF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
    -- ユーザー情報を取得
    SELECT u.email, p.full_name INTO user_email, user_full_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = NEW.user_id;

    -- KYC拒否メールをキューに追加
    IF user_email IS NOT NULL THEN
      PERFORM public.queue_email(
        NEW.user_id,
        'kyc_rejected',
        user_email,
        jsonb_build_object(
          'user_name', COALESCE(user_full_name, 'お客様'),
          'reason', NEW.rejection_reason,
          'kyc_url', 'https://yourdomain.com/kyc'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーをログに記録
    RAISE WARNING 'Error processing referral reward for user %: %', NEW.user_id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.process_referral_reward IS 'KYC承認時の紹介報酬処理とメール送信';