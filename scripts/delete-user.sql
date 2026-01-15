-- ユーザー削除スクリプト
-- 使用方法: supabase db execute scripts/delete-user.sql --use-migrations

-- テストユーザー削除（emailを指定）
DELETE FROM auth.users WHERE email = 'test@example.com';

-- 全テストユーザー削除（注意: 全ユーザー削除）
-- DELETE FROM auth.users WHERE email LIKE '%test%' OR email LIKE '%@example.com';

-- ユーザー確認
SELECT id, email, created_at FROM auth.users;
