-- 本番環境のマイグレーション状態を確認するSQLスクリプト
-- 使用方法: Supabase ダッシュボードのSQL Editorで実行

-- 1. 適用済みマイグレーションの一覧を表示
SELECT
    version,
    name,
    executed_at
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 20;

-- 2. transfer_funds関数の現在の定義を確認
SELECT
    proname as function_name,
    pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'transfer_funds'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 3. 欠落している送金のledger_entries記録を特定
SELECT
    ut.id as transfer_id,
    ut.from_user_id,
    ut.to_user_id,
    ut.currency,
    ut.amount,
    ut.status,
    ut.created_at,
    ut.completed_at,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM public.ledger_entries le
            WHERE le.ref_id = ut.id AND le.ref_type = 'system'
        ) THEN 'ledger_entries記録あり'
        ELSE 'ledger_entries記録なし ⚠️'
    END as ledger_status
FROM public.user_transfers ut
WHERE ut.status = 'completed'
ORDER BY ut.completed_at DESC;

-- 4. user_assets と user_balances_view の不整合を確認
SELECT
    ua.user_id,
    p.email,
    p.user_handle,
    ua.currency,
    ua.balance as user_assets_balance,
    COALESCE(ubv.total, 0) as user_balances_view_total,
    ua.balance - COALESCE(ubv.total, 0) as difference,
    CASE
        WHEN ABS(ua.balance - COALESCE(ubv.total, 0)) > 0.00000001 THEN '不整合あり ⚠️'
        ELSE '整合性OK ✅'
    END as status
FROM public.user_assets ua
LEFT JOIN public.user_balances_view ubv
    ON ua.user_id = ubv.user_id AND ua.currency = ubv.currency
LEFT JOIN public.profiles p ON ua.user_id = p.id
WHERE ABS(ua.balance - COALESCE(ubv.total, 0)) > 0.00000001
   OR ua.user_id IN (
       SELECT DISTINCT from_user_id FROM public.user_transfers
       UNION
       SELECT DISTINCT to_user_id FROM public.user_transfers
   )
ORDER BY ua.user_id, ua.currency;

-- 5. 各ユーザーのledger_entries詳細を表示
SELECT
    le.user_id,
    p.email,
    p.user_handle,
    le.currency,
    le.amount,
    le.kind,
    le.ref_type,
    le.ref_id,
    le.created_at,
    CASE
        WHEN le.ref_type = 'system' AND EXISTS (
            SELECT 1 FROM public.user_transfers ut WHERE ut.id = le.ref_id
        ) THEN 'user_transfers参照'
        WHEN le.ref_type = 'system' AND EXISTS (
            SELECT 1 FROM public.currency_conversions cc WHERE cc.id = le.ref_id
        ) THEN 'currency_conversions参照'
        ELSE 'その他'
    END as reference_type
FROM public.ledger_entries le
LEFT JOIN public.profiles p ON le.user_id = p.id
ORDER BY le.created_at DESC;