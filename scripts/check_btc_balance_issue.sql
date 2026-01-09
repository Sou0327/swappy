-- ユーザーBのBTC残高問題を調査するSQLクエリ
-- ユーザーBのIDを指定して実行してください

-- 使用方法：
-- 1. ユーザーBのuser_idを取得（profilesテーブルから）
-- 2. 以下のクエリの'USER_B_ID'を実際のUUIDに置き換え
-- 3. Supabaseダッシュボードで実行

-- ==================================================
-- 1. ユーザーBのプロフィール情報を確認
-- ==================================================
SELECT
    id,
    email,
    user_handle,
    display_name
FROM public.profiles
WHERE email LIKE '%user_b%'  -- ユーザーBのメールアドレスに合わせて変更
   OR user_handle LIKE '%user_b%';

-- ==================================================
-- 2. ユーザーBのuser_assets残高
-- ==================================================
SELECT
    user_id,
    currency,
    balance,
    locked_balance,
    updated_at
FROM public.user_assets
WHERE user_id = 'USER_B_ID'  -- 実際のUUIDに置き換え
ORDER BY currency;

-- ==================================================
-- 3. ユーザーBのuser_balances_view残高（ledger_entriesから計算）
-- ==================================================
SELECT
    user_id,
    currency,
    total,
    locked
FROM public.user_balances_view
WHERE user_id = 'USER_B_ID'  -- 実際のUUIDに置き換え
ORDER BY currency;

-- ==================================================
-- 4. ユーザーBの全ledger_entries（時系列順）
-- ==================================================
SELECT
    id,
    user_id,
    currency,
    amount,
    locked_delta,
    kind,
    ref_type,
    ref_id,
    created_at,
    CASE
        WHEN ref_type = 'system' AND EXISTS (
            SELECT 1 FROM public.user_transfers ut WHERE ut.id = ref_id
        ) THEN '送金'
        WHEN ref_type = 'system' AND EXISTS (
            SELECT 1 FROM public.currency_conversions cc WHERE cc.id = ref_id
        ) THEN '両替'
        WHEN ref_type = 'deposit' THEN '入金'
        WHEN ref_type = 'withdrawal' THEN '出金'
        ELSE ref_type
    END as transaction_type,
    -- 累計残高を計算
    SUM(amount) OVER (PARTITION BY currency ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as running_balance
FROM public.ledger_entries
WHERE user_id = 'USER_B_ID'  -- 実際のUUIDに置き換え
ORDER BY created_at ASC, currency;

-- ==================================================
-- 5. ユーザーBのBTC関連のledger_entries詳細
-- ==================================================
SELECT
    le.id,
    le.currency,
    le.amount,
    le.kind,
    le.ref_type,
    le.created_at,
    CASE
        WHEN le.ref_type = 'system' AND cc.id IS NOT NULL THEN
            CONCAT('両替: ', cc.from_currency, ' → ', cc.to_currency, ' (', cc.from_amount, ' → ', cc.to_amount, ')')
        WHEN le.ref_type = 'system' AND ut.id IS NOT NULL THEN
            CONCAT('送金: ', ut.amount, ' ', ut.currency)
        ELSE
            '不明'
    END as transaction_detail,
    -- 累計BTCを計算
    SUM(le.amount) OVER (ORDER BY le.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as btc_running_balance
FROM public.ledger_entries le
LEFT JOIN public.currency_conversions cc ON le.ref_id = cc.id AND le.ref_type = 'system'
LEFT JOIN public.user_transfers ut ON le.ref_id = ut.id AND le.ref_type = 'system'
WHERE le.user_id = 'USER_B_ID'  -- 実際のUUIDに置き換え
  AND le.currency = 'BTC'
ORDER BY le.created_at ASC;

-- ==================================================
-- 6. ユーザーBの両替履歴
-- ==================================================
SELECT
    id,
    user_id,
    from_currency,
    to_currency,
    from_amount,
    to_amount,
    exchange_rate,
    fee_amount,
    fee_percentage,
    status,
    created_at
FROM public.currency_conversions
WHERE user_id = 'USER_B_ID'  -- 実際のUUIDに置き換え
ORDER BY created_at DESC;

-- ==================================================
-- 7. ユーザーBの送金履歴（送信・受信両方）
-- ==================================================
SELECT
    id,
    CASE
        WHEN from_user_id = 'USER_B_ID' THEN '送信'
        WHEN to_user_id = 'USER_B_ID' THEN '受信'
    END as direction,
    from_user_id,
    to_user_id,
    currency,
    amount,
    status,
    created_at,
    completed_at
FROM public.user_transfers
WHERE from_user_id = 'USER_B_ID'  -- 実際のUUIDに置き換え
   OR to_user_id = 'USER_B_ID'    -- 実際のUUIDに置き換え
ORDER BY created_at DESC;

-- ==================================================
-- 8. 不整合の詳細診断（BTC）
-- ==================================================
WITH ledger_balance AS (
    SELECT
        user_id,
        currency,
        SUM(amount) as ledger_total
    FROM public.ledger_entries
    WHERE user_id = 'USER_B_ID'  -- 実際のUUIDに置き換え
      AND currency = 'BTC'
    GROUP BY user_id, currency
),
asset_balance AS (
    SELECT
        user_id,
        currency,
        balance as asset_total
    FROM public.user_assets
    WHERE user_id = 'USER_B_ID'  -- 実際のUUIDに置き換え
      AND currency = 'BTC'
)
SELECT
    COALESCE(lb.user_id, ab.user_id) as user_id,
    'BTC' as currency,
    COALESCE(lb.ledger_total, 0) as ledger_entries_total,
    COALESCE(ab.asset_total, 0) as user_assets_total,
    COALESCE(ab.asset_total, 0) - COALESCE(lb.ledger_total, 0) as difference,
    CASE
        WHEN ABS(COALESCE(ab.asset_total, 0) - COALESCE(lb.ledger_total, 0)) < 0.00000001 THEN '整合性OK ✅'
        WHEN COALESCE(lb.ledger_total, 0) < 0 THEN '負の残高 ⚠️'
        ELSE '不整合あり ⚠️'
    END as status
FROM ledger_balance lb
FULL OUTER JOIN asset_balance ab ON lb.user_id = ab.user_id AND lb.currency = ab.currency;