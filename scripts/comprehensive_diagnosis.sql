-- ========================================
-- 包括的診断スクリプト
-- 本番環境で実行して全体の状態を把握
-- ========================================

-- ========================================
-- 1. 適用済みマイグレーション一覧
-- ========================================

SELECT
    version,
    name,
    inserted_at
FROM supabase_migrations.schema_migrations
WHERE version >= '20251001100000'
ORDER BY version DESC;

-- ========================================
-- 2. transfer_funds関数の現在の定義
-- ========================================

SELECT
    proname as function_name,
    pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'transfer_funds'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ========================================
-- 3. execute_conversion_with_fee関数の定義確認
-- ========================================

SELECT
    proname as function_name,
    pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'execute_conversion_with_fee'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ========================================
-- 4. 最新の送金記録とledger_entries対応状況
-- ========================================

SELECT
    ut.id as transfer_id,
    ut.from_user_id,
    pf.email as from_email,
    pf.user_handle as from_handle,
    ut.to_user_id,
    pt.email as to_email,
    pt.user_handle as to_handle,
    ut.currency,
    ut.amount,
    ut.status,
    ut.completed_at,
    -- ledger_entriesの記録状況を確認
    CASE
        WHEN EXISTS (
            SELECT 1 FROM public.ledger_entries le
            WHERE le.ref_id = ut.id
              AND le.ref_type = 'system'
              AND le.user_id = ut.from_user_id
              AND le.amount = -ut.amount
        ) THEN '送信側記録あり ✅'
        ELSE '送信側記録なし ❌'
    END as from_ledger_status,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM public.ledger_entries le
            WHERE le.ref_id = ut.id
              AND le.ref_type = 'system'
              AND le.user_id = ut.to_user_id
              AND le.amount = ut.amount
        ) THEN '受信側記録あり ✅'
        ELSE '受信側記録なし ❌'
    END as to_ledger_status
FROM public.user_transfers ut
LEFT JOIN public.profiles pf ON ut.from_user_id = pf.id
LEFT JOIN public.profiles pt ON ut.to_user_id = pt.id
WHERE ut.status = 'completed'
ORDER BY ut.completed_at DESC
LIMIT 10;

-- ========================================
-- 5. 最新の両替記録とledger_entries対応状況
-- ========================================

SELECT
    cc.id as conversion_id,
    cc.user_id,
    p.email,
    p.user_handle,
    cc.from_currency,
    cc.to_currency,
    cc.from_amount,
    cc.to_amount,
    cc.fee_amount,
    cc.status,
    cc.created_at,
    -- ledger_entriesの記録状況を確認
    CASE
        WHEN EXISTS (
            SELECT 1 FROM public.ledger_entries le
            WHERE le.ref_id = cc.id
              AND le.ref_type = 'system'
              AND le.user_id = cc.user_id
              AND le.currency = cc.from_currency
              AND le.amount = -cc.from_amount
        ) THEN '減額記録あり ✅'
        ELSE '減額記録なし ❌'
    END as from_ledger_status,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM public.ledger_entries le
            WHERE le.ref_id = cc.id
              AND le.ref_type = 'system'
              AND le.user_id = cc.user_id
              AND le.currency = cc.to_currency
        ) THEN '増額記録あり ✅'
        ELSE '増額記録なし ❌'
    END as to_ledger_status
FROM public.currency_conversions cc
LEFT JOIN public.profiles p ON cc.user_id = p.id
WHERE cc.status = 'completed'
ORDER BY cc.created_at DESC
LIMIT 10;

-- ========================================
-- 6. user_assetsとuser_balances_viewの不整合
-- ========================================

SELECT
    ua.user_id,
    p.email,
    p.user_handle,
    ua.currency,
    ua.balance as user_assets_balance,
    COALESCE(ubv.total, 0) as user_balances_view_total,
    ua.balance - COALESCE(ubv.total, 0) as difference,
    CASE
        WHEN ABS(ua.balance - COALESCE(ubv.total, 0)) < 0.00000001 THEN '整合性OK ✅'
        WHEN COALESCE(ubv.total, 0) < 0 THEN '負の残高 🚨'
        WHEN ua.balance - COALESCE(ubv.total, 0) > 0 THEN '実残高＞表示残高（お金が見えない）⚠️'
        WHEN ua.balance - COALESCE(ubv.total, 0) < 0 THEN '実残高＜表示残高（お金が複製されている）🚨'
        ELSE '不整合 ⚠️'
    END as status
FROM public.user_assets ua
LEFT JOIN public.user_balances_view ubv
    ON ua.user_id = ubv.user_id AND ua.currency = ubv.currency
LEFT JOIN public.profiles p ON ua.user_id = p.id
WHERE ABS(ua.balance - COALESCE(ubv.total, 0)) > 0.00000001
   OR COALESCE(ubv.total, 0) < 0
ORDER BY
    CASE
        WHEN COALESCE(ubv.total, 0) < 0 THEN 1
        WHEN ABS(ua.balance - COALESCE(ubv.total, 0)) > 0 THEN 2
        ELSE 3
    END,
    ABS(ua.balance - COALESCE(ubv.total, 0)) DESC;

-- ========================================
-- 7. ledger_entriesの統計情報
-- ========================================

SELECT
    ref_type,
    COUNT(*) as entry_count,
    MIN(created_at) as first_entry,
    MAX(created_at) as last_entry
FROM public.ledger_entries
GROUP BY ref_type
ORDER BY ref_type;

-- ========================================
-- 8. 送金・両替の総数とledger_entries記録率
-- ========================================

WITH transfer_stats AS (
    SELECT
        COUNT(*) as total_transfers,
        COUNT(DISTINCT CASE
            WHEN EXISTS (
                SELECT 1 FROM public.ledger_entries le
                WHERE le.ref_id = ut.id AND le.ref_type = 'system'
            ) THEN ut.id
        END) as transfers_with_ledger
    FROM public.user_transfers ut
    WHERE ut.status = 'completed'
),
conversion_stats AS (
    SELECT
        COUNT(*) as total_conversions,
        COUNT(DISTINCT CASE
            WHEN EXISTS (
                SELECT 1 FROM public.ledger_entries le
                WHERE le.ref_id = cc.id AND le.ref_type = 'system'
            ) THEN cc.id
        END) as conversions_with_ledger
    FROM public.currency_conversions cc
    WHERE cc.status = 'completed'
)
SELECT
    'transfers' as transaction_type,
    ts.total_transfers as total_count,
    ts.transfers_with_ledger as with_ledger_count,
    ts.total_transfers - ts.transfers_with_ledger as missing_ledger_count,
    CASE
        WHEN ts.total_transfers > 0 THEN
            ROUND((ts.transfers_with_ledger::numeric / ts.total_transfers * 100), 2)
        ELSE 0
    END as ledger_coverage_percent
FROM transfer_stats ts
UNION ALL
SELECT
    'conversions' as transaction_type,
    cs.total_conversions as total_count,
    cs.conversions_with_ledger as with_ledger_count,
    cs.total_conversions - cs.conversions_with_ledger as missing_ledger_count,
    CASE
        WHEN cs.total_conversions > 0 THEN
            ROUND((cs.conversions_with_ledger::numeric / cs.total_conversions * 100), 2)
        ELSE 0
    END as ledger_coverage_percent
FROM conversion_stats cs;

-- ========================================
-- 9. 致命的な問題の要約
-- ========================================

DO $$
DECLARE
    v_negative_balances INTEGER;
    v_missing_transfer_ledgers INTEGER;
    v_missing_conversion_ledgers INTEGER;
    v_total_inconsistencies INTEGER;
BEGIN
    -- 負の残高
    SELECT COUNT(*) INTO v_negative_balances
    FROM public.user_balances_view
    WHERE total < 0;

    -- ledger_entriesに記録されていない送金
    SELECT COUNT(*) INTO v_missing_transfer_ledgers
    FROM public.user_transfers ut
    WHERE ut.status = 'completed'
      AND NOT EXISTS (
          SELECT 1 FROM public.ledger_entries le
          WHERE le.ref_id = ut.id AND le.ref_type = 'system'
      );

    -- ledger_entriesに記録されていない両替
    SELECT COUNT(*) INTO v_missing_conversion_ledgers
    FROM public.currency_conversions cc
    WHERE cc.status = 'completed'
      AND NOT EXISTS (
          SELECT 1 FROM public.ledger_entries le
          WHERE le.ref_id = cc.id AND le.ref_type = 'system'
      );

    -- 総不整合数
    SELECT COUNT(*) INTO v_total_inconsistencies
    FROM public.user_assets ua
    LEFT JOIN public.user_balances_view ubv
        ON ua.user_id = ubv.user_id AND ua.currency = ubv.currency
    WHERE ABS(ua.balance - COALESCE(ubv.total, 0)) > 0.00000001;

    RAISE NOTICE '========================================';
    RAISE NOTICE '致命的な問題の要約';
    RAISE NOTICE '========================================';
    RAISE NOTICE '🚨 負の残高: % 件', v_negative_balances;
    RAISE NOTICE '❌ ledger_entriesに記録されていない送金: % 件', v_missing_transfer_ledgers;
    RAISE NOTICE '❌ ledger_entriesに記録されていない両替: % 件', v_missing_conversion_ledgers;
    RAISE NOTICE '⚠️ 残高不整合: % 件', v_total_inconsistencies;
    RAISE NOTICE '========================================';

    IF v_missing_transfer_ledgers > 0 OR v_missing_conversion_ledgers > 0 THEN
        RAISE NOTICE '💡 修正が必要: transfer_funds または execute_conversion_with_fee 関数が';
        RAISE NOTICE '   ledger_entriesに記録していない可能性があります';
    END IF;

    IF v_total_inconsistencies > 0 THEN
        RAISE NOTICE '💡 データ修正が必要: 過去の取引のledger_entries記録を復元する必要があります';
    END IF;
END $$;