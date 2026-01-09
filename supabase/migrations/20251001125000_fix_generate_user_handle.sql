-- generate_user_handle の修正と既存プロフィールの更新

DROP FUNCTION IF EXISTS public.generate_user_handle(TEXT);

CREATE OR REPLACE FUNCTION public.generate_user_handle(p_base_name TEXT DEFAULT NULL, p_user_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    base TEXT := p_base_name;
    target_user_id UUID := p_user_id;
    new_handle TEXT;
    counter INTEGER := 0;
BEGIN
    target_user_id := COALESCE(target_user_id, auth.uid());

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'generate_user_handle requires a user id';
    END IF;

    IF base IS NULL THEN
        SELECT COALESCE(substring(email FROM '^([^@]+)'), 'user')
        INTO base
        FROM auth.users
        WHERE id = target_user_id;
    END IF;

    IF base IS NULL OR base = '' THEN
        base := 'user';
    END IF;

    base := lower(regexp_replace(base, '[^a-zA-Z0-9]', '', 'g'));

    IF length(base) < 3 THEN
        base := base || 'user';
    END IF;

    new_handle := base;
    WHILE EXISTS (
        SELECT 1 FROM public.profiles WHERE user_handle = new_handle AND id <> target_user_id
    ) LOOP
        counter := counter + 1;
        new_handle := base || counter::text;
    END LOOP;

    RETURN new_handle;
END;
$$;

-- handle_new_user を最新仕様に合わせて再定義
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, user_handle, display_name, is_public)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    public.generate_user_handle(split_part(NEW.email, '@', 1), NEW.id),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    user_handle = EXCLUDED.user_handle,
    display_name = EXCLUDED.display_name;

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

-- 既存プロフィールのハンドルと公開設定をリペア
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN
        SELECT u.id, u.email, p.display_name, p.full_name, p.is_public
        FROM auth.users u
        JOIN public.profiles p ON p.id = u.id
    LOOP
        UPDATE public.profiles
        SET
            user_handle = public.generate_user_handle(split_part(user_record.email, '@', 1), user_record.id),
            display_name = COALESCE(user_record.display_name, user_record.full_name, split_part(user_record.email, '@', 1)),
            is_public = COALESCE(user_record.is_public, true)
        WHERE id = user_record.id;
    END LOOP;
END $$;
