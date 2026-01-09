-- メール確認環境での紹介記録問題を解決
-- profilesテーブルにreferral_code_usedカラムを追加し、トリガーで自動記録

-- ========================================
-- 1. profilesテーブルにreferral_code_usedカラム追加
-- ========================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code_used TEXT;

COMMENT ON COLUMN public.profiles.referral_code_used IS 'サインアップ時に使用した紹介コード（トリガーで紹介関係を自動記録）';

-- ========================================
-- 1.5. handle_new_user関数を修正してreferral_code_usedを保存
-- ========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, user_handle, display_name, is_public, referral_code_used)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    public.generate_user_handle(split_part(NEW.email, '@', 1), NEW.id),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    true,
    NULLIF(UPPER(TRIM(NEW.raw_user_meta_data ->> 'referral_code_used')), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    user_handle = EXCLUDED.user_handle,
    display_name = EXCLUDED.display_name,
    referral_code_used = EXCLUDED.referral_code_used;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
  VALUES
    (NEW.id, 'BTC', 0.00000000, 0.00000000),
    (NEW.id, 'ETH', 0.00000000, 0.00000000),
    (NEW.id, 'USDT', 0.00000000, 0.00000000),
    (NEW.id, 'USDC', 0.00000000, 0.00000000),
    (NEW.id, 'JPY', 0.00000000, 0.00000000)
  ON CONFLICT (user_id, currency) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS 'auth.usersトリガーで実行: profilesテーブル作成時にメタデータからreferral_code_usedを取得';

-- ========================================
-- 2. トリガー関数を拡張: 紹介関係の自動記録
-- ========================================

-- 既存のauto_generate_referral_code関数を置き換え
CREATE OR REPLACE FUNCTION public.auto_generate_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referral_code_record RECORD;
BEGIN
  -- 1. 紹介コードを自動生成
  BEGIN
    PERFORM public.generate_referral_code(NEW.id);
  EXCEPTION
    WHEN OTHERS THEN
      -- エラーが発生してもプロフィール作成は継続
      RAISE WARNING 'Failed to generate referral code for user %: %', NEW.id, SQLERRM;
  END;

  -- 2. 紹介コードが使用されていた場合、紹介関係を記録
  IF NEW.referral_code_used IS NOT NULL AND NEW.referral_code_used != '' THEN
    BEGIN
      -- 紹介コード情報を取得
      SELECT id, user_id, is_active INTO v_referral_code_record
      FROM public.referral_codes
      WHERE code = UPPER(NEW.referral_code_used)
      AND is_active = true;

      -- 紹介コードが有効な場合、紹介関係を記録
      IF FOUND THEN
        INSERT INTO public.referrals (referrer_id, referee_id, referral_code_id)
        VALUES (
          v_referral_code_record.user_id,
          NEW.id,
          v_referral_code_record.id
        );

        RAISE NOTICE 'Referral relationship created for user % using code %', NEW.id, NEW.referral_code_used;
      ELSE
        RAISE WARNING 'Invalid or inactive referral code: %', NEW.referral_code_used;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        -- すでに紹介関係が存在する場合（重複エラー）
        RAISE WARNING 'User % already has a referral relationship', NEW.id;
      WHEN OTHERS THEN
        -- その他のエラー（プロフィール作成は継続）
        RAISE WARNING 'Failed to create referral relationship for user %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_generate_referral_code IS 'プロフィール作成時に紹介コードを自動発行し、referral_code_usedがあれば紹介関係も自動記録（メール確認環境でも動作）';

-- ========================================
-- 3. referrals挿入ポリシーの変更
-- ========================================

-- クライアント側からの直接挿入は不要になったため、ポリシーを削除
-- トリガーはSECURITY DEFINERで実行されるため、RLSをバイパス可能
DROP POLICY IF EXISTS referrals_insert_on_signup ON public.referrals;

-- 念のため、管理者のみが直接挿入可能なポリシーを追加（手動修正用）
CREATE POLICY referrals_insert_admin_only ON public.referrals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON POLICY referrals_insert_admin_only ON public.referrals IS '紹介関係はトリガーで自動記録されるため、管理者のみが直接挿入可能';
