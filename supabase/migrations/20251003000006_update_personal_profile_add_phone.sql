-- update_personal_profile RPC関数に電話番号パラメータを追加
-- 目的: KYC申請時に電話番号を保存できるようにする

BEGIN;

-- 既存の関数を削除
DROP FUNCTION IF EXISTS public.update_personal_profile(
  p_first_name text,
  p_last_name text,
  p_first_name_kana text,
  p_last_name_kana text,
  p_birth_date date,
  p_postal_code text,
  p_prefecture text,
  p_city text,
  p_address text,
  p_building text
);

-- 電話番号パラメータを追加した新しい関数を作成
CREATE OR REPLACE FUNCTION public.update_personal_profile(
  p_first_name text,
  p_last_name text,
  p_first_name_kana text,
  p_last_name_kana text,
  p_birth_date date,
  p_phone_number text,
  p_postal_code text,
  p_prefecture text,
  p_city text,
  p_address text,
  p_building text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
BEGIN
  IF target_user IS NULL THEN
    RAISE EXCEPTION '認証が必要です' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    first_name = p_first_name,
    last_name = p_last_name,
    first_name_kana = p_first_name_kana,
    last_name_kana = p_last_name_kana,
    birth_date = p_birth_date,
    phone_number = p_phone_number,
    postal_code = p_postal_code,
    prefecture = p_prefecture,
    city = p_city,
    address = p_address,
    building = p_building
  WHERE id = target_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'プロフィールが見つかりません' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- 権限設定
REVOKE ALL ON FUNCTION public.update_personal_profile(
  p_first_name text,
  p_last_name text,
  p_first_name_kana text,
  p_last_name_kana text,
  p_birth_date date,
  p_phone_number text,
  p_postal_code text,
  p_prefecture text,
  p_city text,
  p_address text,
  p_building text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_personal_profile(
  p_first_name text,
  p_last_name text,
  p_first_name_kana text,
  p_last_name_kana text,
  p_birth_date date,
  p_phone_number text,
  p_postal_code text,
  p_prefecture text,
  p_city text,
  p_address text,
  p_building text
) TO authenticated;

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '📞 update_personal_profile関数に電話番号パラメータを追加しました';
  RAISE NOTICE '✅ KYC申請で電話番号を保存できるようになります';
END $$;

COMMIT;