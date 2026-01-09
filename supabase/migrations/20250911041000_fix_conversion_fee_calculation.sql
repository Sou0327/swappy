-- 手数料計算関数のバグ修正

-- 5. 手数料計算関数を修正
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
    v_fee_percentage numeric := 0.001; -- デフォルト 0.1%
    v_minimum_fee numeric := 0;
    v_maximum_fee numeric := NULL;
    v_calculated_fee numeric;
BEGIN
    -- 通貨ペア固有の手数料設定を取得
    SELECT cf.fee_percentage, cf.minimum_fee, cf.maximum_fee
    INTO v_fee_percentage, v_minimum_fee, v_maximum_fee
    FROM public.conversion_fees cf
    WHERE cf.from_currency = p_from_currency 
    AND cf.to_currency = p_to_currency 
    AND cf.is_active = true;
    
    -- 設定が見つからない場合はデフォルト値を使用
    IF v_fee_percentage IS NULL THEN
        v_fee_percentage := 0.001;
        v_minimum_fee := 0;
        v_maximum_fee := NULL;
    END IF;
    
    -- 手数料計算
    v_calculated_fee := p_from_amount * v_fee_percentage;
    
    -- 最小手数料の適用
    IF v_calculated_fee < v_minimum_fee THEN
        v_calculated_fee := v_minimum_fee;
    END IF;
    
    -- 最大手数料の適用
    IF v_maximum_fee IS NOT NULL AND v_calculated_fee > v_maximum_fee THEN
        v_calculated_fee := v_maximum_fee;
    END IF;
    
    RETURN QUERY SELECT 
        v_calculated_fee as fee_amount,
        v_fee_percentage as fee_percentage,
        p_from_amount - v_calculated_fee as net_amount;
END;
$$;

-- 6. 手数料を考慮した両替実行関数を修正
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
    v_fee_amount numeric;
    v_fee_percentage numeric;
    v_net_from_amount numeric;
    v_actual_to_amount numeric;
    v_conversion_id uuid;
BEGIN
    -- 手数料計算
    SELECT calc.fee_amount, calc.fee_percentage, calc.net_amount
    INTO v_fee_amount, v_fee_percentage, v_net_from_amount
    FROM public.calculate_conversion_fee(p_from_currency, p_to_currency, p_from_amount) calc;
    
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
            'completed', v_fee_amount, v_fee_percentage
        ) RETURNING id INTO v_conversion_id;
        
        -- 結果を返す
        RETURN json_build_object(
            'success', true,
            'conversion_id', v_conversion_id,
            'from_amount', p_from_amount,
            'fee_amount', v_fee_amount,
            'fee_percentage', v_fee_percentage,
            'net_from_amount', v_net_from_amount,
            'to_amount', v_actual_to_amount,
            'exchange_rate', p_exchange_rate
        );
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '両替処理に失敗しました: %', SQLERRM;
    END;
END;
$$;

COMMENT ON FUNCTION public.calculate_conversion_fee IS '修正版: 両替手数料を計算する関数';
COMMENT ON FUNCTION public.execute_conversion_with_fee IS '修正版: 手数料を考慮した両替処理を実行する関数';