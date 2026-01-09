-- ユーザー間送金機能のためのデータベーススキーマ
-- パターンB：中セキュリティ実装（独自ユーザーID + email検索、送金確認画面、日次限度額）

-- 1. プロフィールテーブルに独自ユーザーIDを追加
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS user_handle TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- 独自ユーザーIDの制約とインデックス
CREATE INDEX IF NOT EXISTS idx_profiles_user_handle ON public.profiles(user_handle);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON public.profiles(display_name);

-- 2. ユーザー間送金履歴テーブル
CREATE TABLE IF NOT EXISTS public.user_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL,
    amount NUMERIC(20,8) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    transaction_hash TEXT UNIQUE NOT NULL DEFAULT 'tx_' || replace(gen_random_uuid()::text, '-', ''),
    description TEXT,
    reference_number TEXT UNIQUE NOT NULL DEFAULT 'TXN-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    admin_notes TEXT,

    -- セキュリティ制約
    CONSTRAINT no_self_transfer CHECK (from_user_id != to_user_id),
    CONSTRAINT valid_currency CHECK (currency IN ('BTC', 'ETH', 'USDT', 'USDC', 'JPY'))
);

-- 3. 日次送金限度額テーブル
CREATE TABLE IF NOT EXISTS public.transfer_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL,
    daily_limit NUMERIC(20,8) NOT NULL DEFAULT 100000.00000000,
    monthly_limit NUMERIC(20,8) NOT NULL DEFAULT 1000000.00000000,
    single_transfer_limit NUMERIC(20,8) NOT NULL DEFAULT 50000.00000000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, currency),
    CONSTRAINT valid_limit_currency CHECK (currency IN ('BTC', 'ETH', 'USDT', 'USDC', 'JPY')),
    CONSTRAINT positive_limits CHECK (
        daily_limit > 0 AND
        monthly_limit > 0 AND
        single_transfer_limit > 0 AND
        single_transfer_limit <= daily_limit AND
        daily_limit <= monthly_limit
    )
);

-- 4. インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_user_transfers_from_user ON public.user_transfers(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_transfers_to_user ON public.user_transfers(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_transfers_status ON public.user_transfers(status);
CREATE INDEX IF NOT EXISTS idx_user_transfers_currency ON public.user_transfers(currency);
CREATE INDEX IF NOT EXISTS idx_user_transfers_created_at ON public.user_transfers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_limits_user_currency ON public.transfer_limits(user_id, currency);

-- 5. Row Level Security (RLS) 設定
ALTER TABLE public.user_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_limits ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: 送金履歴
CREATE POLICY "Users can view their own transfer history" ON public.user_transfers
    FOR SELECT USING (
        auth.uid() = from_user_id OR
        auth.uid() = to_user_id OR
        public.has_role(auth.uid(), 'admin'::public.app_role)
    );

CREATE POLICY "Users can insert their own transfers" ON public.user_transfers
    FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Admins can update transfers" ON public.user_transfers
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- RLS ポリシー: 送金限度額
CREATE POLICY "Users can view their own transfer limits" ON public.transfer_limits
    FOR SELECT USING (
        auth.uid() = user_id OR
        public.has_role(auth.uid(), 'admin'::public.app_role)
    );

CREATE POLICY "Admins can manage transfer limits" ON public.transfer_limits
    FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 6. 独自ユーザーIDを生成する関数
CREATE OR REPLACE FUNCTION public.generate_user_handle(base_name TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_handle TEXT;
    counter INTEGER := 0;
    base TEXT;
BEGIN
    -- ベース名を決定（emailの@前部分から生成）
    IF base_name IS NULL THEN
        SELECT COALESCE(
            substring(email FROM '^([^@]+)'),
            'user'
        ) INTO base
        FROM auth.users
        WHERE id = auth.uid();
    ELSE
        base := base_name;
    END IF;

    -- 英数字のみに変換
    base := lower(regexp_replace(base, '[^a-zA-Z0-9]', '', 'g'));

    -- 最低3文字確保
    IF length(base) < 3 THEN
        base := base || 'user';
    END IF;

    -- 重複しないハンドルを生成
    new_handle := base;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE user_handle = new_handle) LOOP
        counter := counter + 1;
        new_handle := base || counter::text;
    END LOOP;

    RETURN new_handle;
END;
$$;

-- 7. デフォルト送金限度額を設定する関数
CREATE OR REPLACE FUNCTION public.set_default_transfer_limits(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 主要通貨のデフォルト限度額を設定
    INSERT INTO public.transfer_limits (user_id, currency, daily_limit, monthly_limit, single_transfer_limit)
    VALUES
        (p_user_id, 'JPY', 1000000.00000000, 10000000.00000000, 500000.00000000),
        (p_user_id, 'USDT', 10000.00000000, 100000.00000000, 5000.00000000),
        (p_user_id, 'USDC', 10000.00000000, 100000.00000000, 5000.00000000),
        (p_user_id, 'BTC', 0.50000000, 5.00000000, 0.25000000),
        (p_user_id, 'ETH', 5.00000000, 50.00000000, 2.50000000)
    ON CONFLICT (user_id, currency) DO NOTHING;
END;
$$;

-- 8. 送金処理の核となるRPC関数
CREATE OR REPLACE FUNCTION public.transfer_funds(
    p_to_user_identifier TEXT,  -- ユーザーハンドル、email、またはUUID
    p_currency TEXT,
    p_amount NUMERIC,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_from_user_id UUID := auth.uid();
    v_to_user_id UUID;
    v_transfer_id UUID;
    v_from_balance NUMERIC;
    v_daily_used NUMERIC;
    v_daily_limit NUMERIC;
    v_single_limit NUMERIC;
    v_reference_number TEXT;
BEGIN
    -- 認証チェック
    IF v_from_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- 受信者のユーザーIDを特定
    -- UUIDの場合
    IF p_to_user_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_to_user_id
        FROM auth.users
        WHERE id = p_to_user_identifier::UUID;
    -- ユーザーハンドルの場合
    ELSIF p_to_user_identifier ~ '^[a-zA-Z0-9_]+$' THEN
        SELECT id INTO v_to_user_id
        FROM public.profiles
        WHERE user_handle = p_to_user_identifier;
    -- emailの場合
    ELSE
        SELECT id INTO v_to_user_id
        FROM public.profiles
        WHERE email = p_to_user_identifier;
    END IF;

    -- 受信者が見つからない場合
    IF v_to_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recipient not found');
    END IF;

    -- 自分自身への送金チェック
    IF v_from_user_id = v_to_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
    END IF;

    -- 送金者の残高チェック
    SELECT balance INTO v_from_balance
    FROM public.user_assets
    WHERE user_id = v_from_user_id AND currency = p_currency;

    IF v_from_balance IS NULL OR v_from_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- 送金限度額チェック
    SELECT daily_limit, single_transfer_limit INTO v_daily_limit, v_single_limit
    FROM public.transfer_limits
    WHERE user_id = v_from_user_id AND currency = p_currency;

    -- デフォルト限度額設定（存在しない場合）
    IF v_daily_limit IS NULL THEN
        PERFORM public.set_default_transfer_limits(v_from_user_id);
        SELECT daily_limit, single_transfer_limit INTO v_daily_limit, v_single_limit
        FROM public.transfer_limits
        WHERE user_id = v_from_user_id AND currency = p_currency;
    END IF;

    -- 単発送金限度額チェック
    IF p_amount > v_single_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'Amount exceeds single transfer limit');
    END IF;

    -- 日次送金限度額チェック
    SELECT COALESCE(SUM(amount), 0) INTO v_daily_used
    FROM public.user_transfers
    WHERE from_user_id = v_from_user_id
      AND currency = p_currency
      AND status = 'completed'
      AND created_at >= CURRENT_DATE;

    IF (v_daily_used + p_amount) > v_daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'Daily transfer limit exceeded');
    END IF;

    -- 取引開始（原子性確保）
    BEGIN
        -- 送金履歴レコード作成
        INSERT INTO public.user_transfers (
            from_user_id, to_user_id, currency, amount, description, status
        ) VALUES (
            v_from_user_id, v_to_user_id, p_currency, p_amount, p_description, 'pending'
        ) RETURNING id, reference_number INTO v_transfer_id, v_reference_number;

        -- 送金者の残高から減額
        UPDATE public.user_assets
        SET balance = balance - p_amount,
            updated_at = NOW()
        WHERE user_id = v_from_user_id AND currency = p_currency;

        -- 受信者の残高に加算（存在しない場合は作成）
        INSERT INTO public.user_assets (user_id, currency, balance)
        VALUES (v_to_user_id, p_currency, p_amount)
        ON CONFLICT (user_id, currency)
        DO UPDATE SET
            balance = user_assets.balance + p_amount,
            updated_at = NOW();

        -- 送金完了にステータス更新
        UPDATE public.user_transfers
        SET status = 'completed',
            completed_at = NOW()
        WHERE id = v_transfer_id;

        RETURN jsonb_build_object(
            'success', true,
            'transfer_id', v_transfer_id,
            'reference_number', v_reference_number,
            'message', 'Transfer completed successfully'
        );

    EXCEPTION WHEN OTHERS THEN
        -- エラーが発生した場合は送金失敗にマーク
        UPDATE public.user_transfers
        SET status = 'failed',
            error_message = SQLERRM
        WHERE id = v_transfer_id;

        RETURN jsonb_build_object('success', false, 'error', 'Transfer failed: ' || SQLERRM);
    END;
END;
$$;

-- 9. 既存ユーザーにデフォルト設定を適用
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN
        SELECT u.id
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.id
        WHERE p.user_handle IS NULL
    LOOP
        -- 独自ユーザーIDを生成
        UPDATE public.profiles
        SET user_handle = public.generate_user_handle(),
            display_name = COALESCE(full_name, split_part(email, '@', 1))
        WHERE id = user_record.id;

        -- デフォルト送金限度額を設定
        PERFORM public.set_default_transfer_limits(user_record.id);
    END LOOP;
END $$;

-- 10. 新規ユーザー登録時の自動設定更新
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- プロファイル作成
  INSERT INTO public.profiles (id, email, full_name, user_handle, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    public.generate_user_handle(split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
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

  -- デフォルト送金限度額を設定
  PERFORM public.set_default_transfer_limits(NEW.id);

  RETURN NEW;
END;
$$;

-- 完了ログ
DO $$
BEGIN
    RAISE NOTICE '✅ ユーザー間送金システムが正常に作成されました';
    RAISE NOTICE '🔒 中セキュリティレベル実装完了';
    RAISE NOTICE '📝 独自ユーザーID、日次限度額、送金履歴機能が利用可能です';
END $$;