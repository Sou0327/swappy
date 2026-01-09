-- 新規ユーザー登録時に初期資産レコードを自動作成する機能を追加
-- ユーザーが登録されると、主要通貨（BTC, ETH, USDT, USDC, JPY）の残高0のレコードが作成される

-- handle_new_user関数を更新
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- プロファイル作成
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  -- デフォルトのユーザーロール付与
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  -- 初期資産レコードを作成（主要通貨のみ）
  INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
  VALUES 
    (NEW.id, 'BTC', 0.00000000, 0.00000000),
    (NEW.id, 'ETH', 0.00000000, 0.00000000),
    (NEW.id, 'USDT', 0.00000000, 0.00000000),
    (NEW.id, 'USDC', 0.00000000, 0.00000000),
    (NEW.id, 'JPY', 0.00000000, 0.00000000);
  
  RETURN NEW;
END;
$$;

-- 既存ユーザーに対しても初期資産レコードを作成（存在しない場合のみ）
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT u.id 
        FROM auth.users u 
        WHERE NOT EXISTS (
            SELECT 1 FROM public.user_assets ua 
            WHERE ua.user_id = u.id
        )
    LOOP
        INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
        VALUES 
            (user_record.id, 'BTC', 0.00000000, 0.00000000),
            (user_record.id, 'ETH', 0.00000000, 0.00000000),
            (user_record.id, 'USDT', 0.00000000, 0.00000000),
            (user_record.id, 'USDC', 0.00000000, 0.00000000),
            (user_record.id, 'JPY', 0.00000000, 0.00000000)
        ON CONFLICT (user_id, currency) DO NOTHING;
    END LOOP;
END $$;

-- 新しい通貨の資産レコードを特定ユーザーに追加する関数
CREATE OR REPLACE FUNCTION public.add_user_asset(
    p_user_id uuid,
    p_currency text,
    p_initial_balance numeric(20,8) DEFAULT 0.00000000
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
    VALUES (p_user_id, p_currency, p_initial_balance, 0.00000000)
    ON CONFLICT (user_id, currency) DO NOTHING;
    
    RETURN FOUND;
END;
$$;

-- 管理者用：全ユーザーに新しい通貨の資産レコードを追加する関数
CREATE OR REPLACE FUNCTION public.add_currency_to_all_users(
    p_currency text,
    p_initial_balance numeric(20,8) DEFAULT 0.00000000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_count integer := 0;
    user_record RECORD;
BEGIN
    -- 管理者権限チェック
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
        RAISE EXCEPTION 'Permission denied: admin role required';
    END IF;
    
    FOR user_record IN 
        SELECT u.id 
        FROM auth.users u 
        WHERE NOT EXISTS (
            SELECT 1 FROM public.user_assets ua 
            WHERE ua.user_id = u.id AND ua.currency = p_currency
        )
    LOOP
        INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
        VALUES (user_record.id, p_currency, p_initial_balance, 0.00000000);
        
        affected_count := affected_count + 1;
    END LOOP;
    
    RETURN affected_count;
END;
$$;