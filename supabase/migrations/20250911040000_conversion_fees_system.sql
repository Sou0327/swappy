-- 両替手数料システムの実装

-- 1. 手数料設定テーブルの作成
CREATE TABLE IF NOT EXISTS public.conversion_fees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency text NOT NULL,
    to_currency text NOT NULL,
    fee_percentage numeric(5,4) NOT NULL CHECK (fee_percentage >= 0 AND fee_percentage <= 1),
    minimum_fee numeric(20,8) DEFAULT 0,
    maximum_fee numeric(20,8) DEFAULT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(from_currency, to_currency)
);

-- 2. インデックス作成
CREATE INDEX IF NOT EXISTS idx_conversion_fees_currencies ON public.conversion_fees(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_conversion_fees_active ON public.conversion_fees(is_active);

-- 3. RLS設定
ALTER TABLE public.conversion_fees ENABLE ROW LEVEL SECURITY;

-- 手数料設定は全ユーザーが参照可能
CREATE POLICY "Anyone can view active fees" ON public.conversion_fees
    FOR SELECT USING (is_active = true);

-- 管理者のみ手数料設定を管理可能
CREATE POLICY "Admins can manage fees" ON public.conversion_fees
    FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. updated_atトリガー
CREATE TRIGGER update_conversion_fees_updated_at
    BEFORE UPDATE ON public.conversion_fees
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 5. 手数料計算関数
CREATE OR REPLACE FUNCTION public.calculate_conversion_fee(
    p_from_currency text,
    p_to_currency text,
    p_from_amount numeric
)
RETURNS TABLE(
    fee_amount numeric,
    fee_percentage numeric,
    net_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_fee_config record;
    v_calculated_fee numeric;
BEGIN
    -- デフォルト手数料設定 (0.1% = 0.001)
    v_fee_config.fee_percentage := 0.001;
    v_fee_config.minimum_fee := 0;
    v_fee_config.maximum_fee := NULL;
    
    -- 通貨ペア固有の手数料設定を取得
    SELECT cf.fee_percentage, cf.minimum_fee, cf.maximum_fee
    INTO v_fee_config
    FROM public.conversion_fees cf
    WHERE cf.from_currency = p_from_currency 
    AND cf.to_currency = p_to_currency 
    AND cf.is_active = true;
    
    -- 手数料計算
    v_calculated_fee := p_from_amount * v_fee_config.fee_percentage;
    
    -- 最小手数料の適用
    IF v_calculated_fee < v_fee_config.minimum_fee THEN
        v_calculated_fee := v_fee_config.minimum_fee;
    END IF;
    
    -- 最大手数料の適用
    IF v_fee_config.maximum_fee IS NOT NULL AND v_calculated_fee > v_fee_config.maximum_fee THEN
        v_calculated_fee := v_fee_config.maximum_fee;
    END IF;
    
    RETURN QUERY SELECT 
        v_calculated_fee as fee_amount,
        v_fee_config.fee_percentage as fee_percentage,
        p_from_amount - v_calculated_fee as net_amount;
END;
$$;

-- 6. 手数料を考慮した両替実行関数（既存関数を更新）
CREATE OR REPLACE FUNCTION public.execute_conversion_with_fee(
    p_user_id uuid,
    p_from_currency text,
    p_to_currency text,
    p_from_amount numeric,
    p_to_amount numeric,
    p_exchange_rate numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_from_asset_id uuid;
    v_to_asset_id uuid;
    v_current_balance numeric;
    v_fee_info record;
    v_net_from_amount numeric;
    v_actual_to_amount numeric;
    v_conversion_id uuid;
BEGIN
    -- 手数料計算
    SELECT fee_amount, fee_percentage, net_amount
    INTO v_fee_info
    FROM public.calculate_conversion_fee(p_from_currency, p_to_currency, p_from_amount);
    
    v_net_from_amount := v_fee_info.net_amount;
    v_actual_to_amount := v_net_from_amount * p_exchange_rate;
    
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
        -- 両替元の残高を減らす（手数料込み）
        UPDATE public.user_assets
        SET balance = balance - p_from_amount,
            updated_at = now()
        WHERE id = v_from_asset_id;
        
        -- 両替先の残高を増やす（手数料差し引き後）
        UPDATE public.user_assets
        SET balance = balance + v_actual_to_amount,
            updated_at = now()
        WHERE id = v_to_asset_id;
        
        -- 両替履歴を記録（手数料情報も含む）
        INSERT INTO public.currency_conversions (
            user_id, from_currency, to_currency, 
            from_amount, to_amount, exchange_rate, 
            status, fee_amount, fee_percentage
        ) VALUES (
            p_user_id, p_from_currency, p_to_currency,
            p_from_amount, v_actual_to_amount, p_exchange_rate, 
            'completed', v_fee_info.fee_amount, v_fee_info.fee_percentage
        ) RETURNING id INTO v_conversion_id;
        
        -- 結果を返す
        RETURN json_build_object(
            'success', true,
            'conversion_id', v_conversion_id,
            'from_amount', p_from_amount,
            'fee_amount', v_fee_info.fee_amount,
            'fee_percentage', v_fee_info.fee_percentage,
            'net_from_amount', v_net_from_amount,
            'to_amount', v_actual_to_amount,
            'exchange_rate', p_exchange_rate
        );
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '両替処理に失敗しました: %', SQLERRM;
    END;
END;
$$;

-- 7. 手数料情報取得関数
CREATE OR REPLACE FUNCTION public.get_conversion_fee_info(
    p_from_currency text DEFAULT NULL,
    p_to_currency text DEFAULT NULL
)
RETURNS TABLE(
    from_currency text,
    to_currency text,
    fee_percentage numeric,
    minimum_fee numeric,
    maximum_fee numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT cf.from_currency, cf.to_currency, cf.fee_percentage, 
           cf.minimum_fee, cf.maximum_fee
    FROM public.conversion_fees cf
    WHERE cf.is_active = true
    AND (p_from_currency IS NULL OR cf.from_currency = p_from_currency)
    AND (p_to_currency IS NULL OR cf.to_currency = p_to_currency)
    ORDER BY cf.from_currency, cf.to_currency;
$$;

-- 8. currency_conversionsテーブルに手数料カラムを追加
ALTER TABLE public.currency_conversions 
ADD COLUMN IF NOT EXISTS fee_amount numeric(20,8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fee_percentage numeric(5,4) DEFAULT 0;

-- 9. デフォルト手数料設定を挿入
INSERT INTO public.conversion_fees (from_currency, to_currency, fee_percentage, minimum_fee) VALUES
('BTC', 'USDT', 0.001, 0.00000001),
('BTC', 'ETH', 0.001, 0.00000001),
('BTC', 'USDC', 0.001, 0.00000001),
('BTC', 'JPY', 0.002, 1),
('ETH', 'BTC', 0.001, 0.00000001),
('ETH', 'USDT', 0.001, 0.00000001),
('ETH', 'USDC', 0.001, 0.00000001),
('ETH', 'JPY', 0.002, 1),
('USDT', 'BTC', 0.001, 0.00000001),
('USDT', 'ETH', 0.001, 0.00000001),
('USDT', 'USDC', 0.0005, 0.01),
('USDT', 'JPY', 0.002, 1),
('USDC', 'BTC', 0.001, 0.00000001),
('USDC', 'ETH', 0.001, 0.00000001),
('USDC', 'USDT', 0.0005, 0.01),
('USDC', 'JPY', 0.002, 1),
('JPY', 'BTC', 0.002, 0.00000001),
('JPY', 'ETH', 0.002, 0.00000001),
('JPY', 'USDT', 0.002, 1),
('JPY', 'USDC', 0.002, 1)
ON CONFLICT (from_currency, to_currency) DO NOTHING;

-- 10. コメント追加
COMMENT ON TABLE public.conversion_fees IS '両替手数料設定テーブル';
COMMENT ON FUNCTION public.calculate_conversion_fee IS '両替手数料を計算する関数';
COMMENT ON FUNCTION public.execute_conversion_with_fee IS '手数料を考慮した両替処理を実行する関数';
COMMENT ON FUNCTION public.get_conversion_fee_info IS '手数料設定情報を取得する関数';