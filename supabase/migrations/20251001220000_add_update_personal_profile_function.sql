BEGIN;

-- 利用者本人がプロフィール情報を更新するためのRPC関数
CREATE OR REPLACE FUNCTION public.update_personal_profile(
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

REVOKE ALL ON FUNCTION public.update_personal_profile(
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
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_personal_profile(
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
) TO authenticated;

COMMIT;
