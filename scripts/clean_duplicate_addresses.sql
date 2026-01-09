-- 重複アドレスのクリーンアップスクリプト
-- 使用前に必ずバックアップを取ってください

-- 1. 重複アドレスの確認
SELECT
    address,
    COUNT(*) as count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM user_deposit_addresses
GROUP BY address
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 2. 重複アドレスの詳細確認
SELECT
    id,
    user_id,
    currency,
    network,
    address,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY address ORDER BY created_at) as rn
FROM user_deposit_addresses
WHERE address IN (
    SELECT address
    FROM user_deposit_addresses
    GROUP BY address
    HAVING COUNT(*) > 1
)
ORDER BY address, created_at;

-- 3. 重複アドレスの削除（最初のレコード以外を削除）
-- 注意: このクエリは実際の削除を行います。実行前に必ずバックアップを取ってください。
/*
DELETE FROM user_deposit_addresses
WHERE id NOT IN (
    SELECT DISTINCT first_id
    FROM (
        SELECT
            address,
            MIN(id) as first_id
        FROM user_deposit_addresses
        GROUP BY address
    ) as keep_first
);
*/

-- 4. 削除後の確認
-- SELECT COUNT(*) as total_addresses FROM user_deposit_addresses;
-- SELECT COUNT(DISTINCT address) as unique_addresses FROM user_deposit_addresses;