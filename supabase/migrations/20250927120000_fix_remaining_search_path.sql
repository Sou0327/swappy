-- 残りの関数オーバーロードのSearch Path修正マイグレーション
-- 警告が出ている3つの関数の未修正オーバーロードを修正

-- ================================================
-- 1. _get_market関数の修正
-- ================================================

-- _get_market関数にSET search_path = publicを追加
CREATE OR REPLACE FUNCTION public._get_market(p_market text)
RETURNS TABLE(
  id text,
  base text,
  quote text,
  price_tick numeric,
  qty_step numeric,
  min_notional numeric,
  maker_fee_rate numeric,
  taker_fee_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    base,
    quote,
    price_tick,
    qty_step,
    min_notional,
    maker_fee_rate,
    taker_fee_rate
  FROM markets
  WHERE id = p_market AND status = 'active';
$$;

-- ================================================
-- 2. add_currency_to_all_users関数の2つ目のオーバーロード修正
-- ================================================

-- p_initial_balanceパラメータ付きのオーバーロードを修正
CREATE OR REPLACE FUNCTION public.add_currency_to_all_users(
  p_currency text,
  p_initial_balance numeric DEFAULT 0.00000000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    affected_count integer := 0;
    user_record RECORD;
BEGIN
    -- 各ユーザーに新しい通貨を追加
    FOR user_record IN
        SELECT id FROM auth.users
        WHERE id NOT IN (
            SELECT user_id FROM user_assets WHERE currency = p_currency
        )
    LOOP
        INSERT INTO user_assets (user_id, currency, balance, locked_balance)
        VALUES (user_record.id, p_currency, p_initial_balance, 0);

        affected_count := affected_count + 1;
    END LOOP;

    RETURN affected_count;
END;
$$;

-- ================================================
-- 3. get_user_conversion_history関数の2つ目のオーバーロード修正
-- ================================================

-- p_limitパラメータ付きのオーバーロードを修正
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
SET search_path = public
AS $$
    SELECT cc.id, cc.from_currency, cc.to_currency,
           cc.from_amount, cc.to_amount, cc.exchange_rate,
           cc.status, cc.created_at
    FROM currency_conversions cc
    WHERE cc.user_id = p_user_id
    ORDER BY cc.created_at DESC
    LIMIT p_limit;
$$;

-- ================================================
-- 4. 修正完了ログ
-- ================================================

INSERT INTO public.audit_logs (
    action,
    resource,
    resource_id,
    details
) VALUES (
    'SECURITY_UPDATE',
    'function_search_path_remaining',
    'remaining_search_path_fixes_20250927',
    jsonb_build_object(
        'fixed_function_overloads', ARRAY[
            '_get_market(text)',
            'add_currency_to_all_users(text, numeric)',
            'get_user_conversion_history(uuid, integer)'
        ],
        'security_improvement', '残りの関数オーバーロードのSET search_path = public追加完了',
        'total_overloads_fixed', 3
    )
);