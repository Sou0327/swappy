-- 両替機能のためのデータベーステーブルと関数を作成

-- 1. 両替履歴テーブルの作成
CREATE TABLE IF NOT EXISTS public.currency_conversions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_currency text NOT NULL,
    to_currency text NOT NULL,
    from_amount numeric(20,8) NOT NULL CHECK (from_amount > 0),
    to_amount numeric(20,8) NOT NULL CHECK (to_amount > 0),
    exchange_rate numeric(20,10) NOT NULL CHECK (exchange_rate > 0),
    status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. インデックス作成
CREATE INDEX IF NOT EXISTS idx_currency_conversions_user_id ON public.currency_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_currency_conversions_created_at ON public.currency_conversions(created_at DESC);

-- 3. RLS設定
ALTER TABLE public.currency_conversions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の両替履歴のみ参照可能
CREATE POLICY "Users can view own conversions" ON public.currency_conversions
    FOR SELECT USING (auth.uid() = user_id);

-- 管理者は全ての両替履歴を参照可能
CREATE POLICY "Admins can view all conversions" ON public.currency_conversions
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. updated_atトリガー
CREATE TRIGGER update_currency_conversions_updated_at
    BEFORE UPDATE ON public.currency_conversions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 5. 両替実行関数
CREATE OR REPLACE FUNCTION public.execute_conversion(
    p_user_id uuid,
    p_from_currency text,
    p_to_currency text,
    p_from_amount numeric,
    p_to_amount numeric,
    p_exchange_rate numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_from_asset_id uuid;
    v_to_asset_id uuid;
    v_current_balance numeric;
BEGIN
    -- 両替元の資産を確認
    SELECT id, balance INTO v_from_asset_id, v_current_balance
    FROM public.user_assets
    WHERE user_id = p_user_id AND currency = p_from_currency;
    
    IF v_from_asset_id IS NULL THEN
        RAISE EXCEPTION '両替元の通貨が見つかりません: %', p_from_currency;
    END IF;
    
    IF v_current_balance < p_from_amount THEN
        RAISE EXCEPTION '残高が不足しています。必要: %, 利用可能: %', p_from_amount, v_current_balance;
    END IF;
    
    -- 両替先の資産を確認（存在しない場合は作成）
    SELECT id INTO v_to_asset_id
    FROM public.user_assets
    WHERE user_id = p_user_id AND currency = p_to_currency;
    
    IF v_to_asset_id IS NULL THEN
        INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
        VALUES (p_user_id, p_to_currency, 0, 0)
        RETURNING id INTO v_to_asset_id;
    END IF;
    
    -- 両替処理を実行
    BEGIN
        -- 両替元の残高を減らす
        UPDATE public.user_assets
        SET balance = balance - p_from_amount,
            updated_at = now()
        WHERE id = v_from_asset_id;
        
        -- 両替先の残高を増やす
        UPDATE public.user_assets
        SET balance = balance + p_to_amount,
            updated_at = now()
        WHERE id = v_to_asset_id;
        
        -- 両替履歴を記録
        INSERT INTO public.currency_conversions (
            user_id, from_currency, to_currency, 
            from_amount, to_amount, exchange_rate, status
        ) VALUES (
            p_user_id, p_from_currency, p_to_currency,
            p_from_amount, p_to_amount, p_exchange_rate, 'completed'
        );
        
        RETURN true;
        
    EXCEPTION WHEN OTHERS THEN
        -- エラーが発生した場合はロールバック
        RAISE EXCEPTION '両替処理に失敗しました: %', SQLERRM;
    END;
END;
$$;

-- 6. ユーザーの両替履歴を取得する関数
CREATE OR REPLACE FUNCTION public.get_user_conversion_history(
    p_user_id uuid,
    p_limit integer DEFAULT 10
)
RETURNS TABLE(
    id uuid,
    from_currency text,
    to_currency text,
    from_amount numeric,
    to_amount numeric,
    exchange_rate numeric,
    status text,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT cc.id, cc.from_currency, cc.to_currency, 
           cc.from_amount, cc.to_amount, cc.exchange_rate,
           cc.status, cc.created_at
    FROM public.currency_conversions cc
    WHERE cc.user_id = p_user_id
    ORDER BY cc.created_at DESC
    LIMIT p_limit;
$$;

-- 7. コメント追加
COMMENT ON TABLE public.currency_conversions IS '通貨両替履歴テーブル';
COMMENT ON FUNCTION public.execute_conversion IS 'ユーザーの通貨両替を実行する関数';
COMMENT ON FUNCTION public.get_user_conversion_history IS 'ユーザーの両替履歴を取得する関数';