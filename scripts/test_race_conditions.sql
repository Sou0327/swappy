-- race condition修正の検証テストスクリプト
-- 使用方法：2つの異なるpsqlターミナルで同時に実行

-- ============================================
-- テスト準備
-- ============================================

-- テスト用ユーザーの作成（既存の場合はスキップ）
DO $$
DECLARE
  v_test_user_1 UUID;
  v_test_user_2 UUID;
BEGIN
  -- テストユーザー1
  SELECT id INTO v_test_user_1 FROM auth.users WHERE email = 'test_user_1@example.com';
  IF v_test_user_1 IS NULL THEN
    INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'test_user_1@example.com') RETURNING id INTO v_test_user_1;
    INSERT INTO public.profiles (id, email, user_handle, display_name) VALUES (v_test_user_1, 'test_user_1@example.com', 'testuser1', 'Test User 1');
  END IF;

  -- テストユーザー2
  SELECT id INTO v_test_user_2 FROM auth.users WHERE email = 'test_user_2@example.com';
  IF v_test_user_2 IS NULL THEN
    INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'test_user_2@example.com') RETURNING id INTO v_test_user_2;
    INSERT INTO public.profiles (id, email, user_handle, display_name) VALUES (v_test_user_2, 'test_user_2@example.com', 'testuser2', 'Test User 2');
  END IF;

  -- 初期残高を設定（USDT: 1000）
  INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
  VALUES (v_test_user_1, 'USDT', 1000, 0)
  ON CONFLICT (user_id, currency) DO UPDATE SET balance = 1000, locked_balance = 0;

  INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
  VALUES (v_test_user_2, 'USDT', 0, 0)
  ON CONFLICT (user_id, currency) DO UPDATE SET balance = 0, locked_balance = 0;

  RAISE NOTICE 'テスト準備完了：user_1 = %, user_2 = %', v_test_user_1, v_test_user_2;
  RAISE NOTICE 'user_1の初期残高：1000 USDT';
  RAISE NOTICE 'user_2の初期残高：0 USDT';
END $$;

-- ============================================
-- テスト1：並行送金テスト（transfer_funds）
-- ============================================
-- 期待結果：片方の送金が「Insufficient balance」エラーになる

-- ターミナル1で実行：
/*
BEGIN;
SELECT transfer_funds('testuser2', 'USDT', 900, 'Test transfer 1');
-- 5秒待つ
SELECT pg_sleep(5);
COMMIT;

-- 結果確認
SELECT user_id, currency, balance FROM public.user_assets
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE user_handle IN ('testuser1', 'testuser2')
);
*/

-- ターミナル2で同時に実行：
/*
BEGIN;
SELECT transfer_funds('testuser2', 'USDT', 900, 'Test transfer 2');
-- 5秒待つ
SELECT pg_sleep(5);
COMMIT;

-- 結果確認
SELECT user_id, currency, balance FROM public.user_assets
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE user_handle IN ('testuser1', 'testuser2')
);
*/

-- 期待される結果：
-- - user_1の残高：100 USDT（1000 - 900）
-- - user_2の残高：900 USDT（0 + 900）
-- - 2回目の送金は「Insufficient balance」エラー
-- - 合計残高：1000 USDT（変化なし）

-- ============================================
-- テスト2：並行出金申請テスト（request_withdrawal）
-- ============================================
-- 期待結果：片方の出金申請が「insufficient balance」エラーになる

-- リセット
DO $$
DECLARE
  v_user UUID;
BEGIN
  SELECT id INTO v_user FROM public.profiles WHERE user_handle = 'testuser1';
  UPDATE public.user_assets SET balance = 1000, locked_balance = 0 WHERE user_id = v_user AND currency = 'USDT';
  RAISE NOTICE 'テスト2準備完了：user_1の残高を1000 USDTにリセット';
END $$;

-- ターミナル1で実行：
/*
BEGIN;
SELECT request_withdrawal('USDT', 900, '0x1234567890abcdef', 'ERC20');
SELECT pg_sleep(5);
COMMIT;

-- 結果確認
SELECT user_id, currency, balance, locked_balance FROM public.user_assets
WHERE user_id = (SELECT id FROM public.profiles WHERE user_handle = 'testuser1');
*/

-- ターミナル2で同時に実行：
/*
BEGIN;
SELECT request_withdrawal('USDT', 900, '0xfedcba0987654321', 'ERC20');
SELECT pg_sleep(5);
COMMIT;

-- 結果確認
SELECT user_id, currency, balance, locked_balance FROM public.user_assets
WHERE user_id = (SELECT id FROM public.profiles WHERE user_handle = 'testuser1');
*/

-- 期待される結果：
-- - balance: 1000 USDT（変化なし）
-- - locked_balance: 900 USDT
-- - 2回目の出金申請は「insufficient balance」エラー

-- ============================================
-- テスト3：並行両替テスト（execute_conversion）
-- ============================================
-- 期待結果：片方の両替が「残高が不足しています」エラーになる

-- リセット
DO $$
DECLARE
  v_user UUID;
BEGIN
  SELECT id INTO v_user FROM public.profiles WHERE user_handle = 'testuser1';
  UPDATE public.user_assets SET balance = 1000, locked_balance = 0 WHERE user_id = v_user AND currency = 'USDT';
  DELETE FROM public.user_assets WHERE user_id = v_user AND currency = 'BTC';
  RAISE NOTICE 'テスト3準備完了：user_1の残高を1000 USDTにリセット';
END $$;

-- ターミナル1で実行：
/*
BEGIN;
SELECT execute_conversion(
  (SELECT id FROM public.profiles WHERE user_handle = 'testuser1'),
  'USDT', 'BTC', 900, 0.01, 90000
);
SELECT pg_sleep(5);
COMMIT;

-- 結果確認
SELECT currency, balance FROM public.user_assets
WHERE user_id = (SELECT id FROM public.profiles WHERE user_handle = 'testuser1');
*/

-- ターミナル2で同時に実行：
/*
BEGIN;
SELECT execute_conversion(
  (SELECT id FROM public.profiles WHERE user_handle = 'testuser1'),
  'USDT', 'BTC', 900, 0.01, 90000
);
SELECT pg_sleep(5);
COMMIT;

-- 結果確認
SELECT currency, balance FROM public.user_assets
WHERE user_id = (SELECT id FROM public.profiles WHERE user_handle = 'testuser1');
*/

-- 期待される結果：
-- - USDT残高：100（1000 - 900）
-- - BTC残高：0.01
-- - 2回目の両替は「残高が不足しています」エラー
-- - USD換算の合計残高は変化なし（1000 USD = 100 USDT + 0.01 BTC）

-- ============================================
-- テスト4：並行入金テスト（upsert_user_asset）
-- ============================================
-- 期待結果：両方の入金が正しく反映される

-- リセット
DO $$
DECLARE
  v_user UUID;
BEGIN
  SELECT id INTO v_user FROM public.profiles WHERE user_handle = 'testuser1';
  UPDATE public.user_assets SET balance = 0, locked_balance = 0 WHERE user_id = v_user AND currency = 'USDT';
  RAISE NOTICE 'テスト4準備完了：user_1の残高を0 USDTにリセット';
END $$;

-- ターミナル1で実行：
/*
BEGIN;
SELECT upsert_user_asset(
  (SELECT id FROM public.profiles WHERE user_handle = 'testuser1'),
  'USDT', 500
);
SELECT pg_sleep(5);
COMMIT;

-- 結果確認
SELECT currency, balance FROM public.user_assets
WHERE user_id = (SELECT id FROM public.profiles WHERE user_handle = 'testuser1');
*/

-- ターミナル2で同時に実行：
/*
BEGIN;
SELECT upsert_user_asset(
  (SELECT id FROM public.profiles WHERE user_handle = 'testuser1'),
  'USDT', 300
);
SELECT pg_sleep(5);
COMMIT;

-- 結果確認
SELECT currency, balance FROM public.user_assets
WHERE user_id = (SELECT id FROM public.profiles WHERE user_handle = 'testuser1');
*/

-- 期待される結果：
-- - USDT残高：800（500 + 300）
-- - 両方の入金が正しく反映される（Lost Updateが発生しない）

-- ============================================
-- 負荷テスト（pgbench用）
-- ============================================
-- pgbenchを使用した並行負荷テスト

-- test_transfer.sql ファイルを作成：
/*
\set user1 (SELECT id FROM public.profiles WHERE user_handle = 'testuser1')
\set user2 (SELECT id FROM public.profiles WHERE user_handle = 'testuser2')
SELECT transfer_funds('testuser2', 'USDT', 10, 'Load test');
*/

-- 実行コマンド：
-- pgbench -c 10 -t 100 -f test_transfer.sql your_database

-- 期待される結果：
-- - 一部の送金は「Insufficient balance」エラー
-- - 最終残高の合計 = 初期残高の合計
-- - データの不整合が発生しない

-- ============================================
-- テスト後のクリーンアップ
-- ============================================
/*
-- テストユーザーとデータを削除
DELETE FROM public.user_assets WHERE user_id IN (
  SELECT id FROM public.profiles WHERE user_handle IN ('testuser1', 'testuser2')
);
DELETE FROM public.user_transfers WHERE from_user_id IN (
  SELECT id FROM public.profiles WHERE user_handle IN ('testuser1', 'testuser2')
);
DELETE FROM public.withdrawal_requests WHERE user_id IN (
  SELECT id FROM public.profiles WHERE user_handle IN ('testuser1', 'testuser2')
);
DELETE FROM public.currency_conversions WHERE user_id IN (
  SELECT id FROM public.profiles WHERE user_handle IN ('testuser1', 'testuser2')
);
DELETE FROM public.profiles WHERE user_handle IN ('testuser1', 'testuser2');
DELETE FROM auth.users WHERE email IN ('test_user_1@example.com', 'test_user_2@example.com');
*/

-- ============================================
-- 整合性監査スクリプト
-- ============================================
-- user_assetsとledger_entriesの整合性を確認

DO $$
DECLARE
  rec RECORD;
  v_inconsistent_count INTEGER := 0;
BEGIN
  RAISE NOTICE '🔍 ===== 整合性監査開始 =====';

  FOR rec IN
    SELECT
      ua.user_id,
      ua.currency,
      ua.balance as user_assets_balance,
      COALESCE(SUM(le.amount), 0) as ledger_total,
      ua.locked_balance as user_assets_locked,
      COALESCE(SUM(le.locked_delta), 0) as ledger_locked,
      ABS(ua.balance - COALESCE(SUM(le.amount), 0)) as balance_diff,
      ABS(ua.locked_balance - COALESCE(SUM(le.locked_delta), 0)) as locked_diff
    FROM public.user_assets ua
    LEFT JOIN public.ledger_entries le
      ON ua.user_id = le.user_id AND ua.currency = le.currency
    GROUP BY ua.user_id, ua.currency, ua.balance, ua.locked_balance
    HAVING ABS(ua.balance - COALESCE(SUM(le.amount), 0)) > 0.00000001
        OR ABS(ua.locked_balance - COALESCE(SUM(le.locked_delta), 0)) > 0.00000001
  LOOP
    v_inconsistent_count := v_inconsistent_count + 1;
    RAISE NOTICE '⚠️ 不整合: user_id=%, currency=%', rec.user_id, rec.currency;
    RAISE NOTICE '   user_assets.balance=%, ledger合計=%, 差分=%',
      rec.user_assets_balance, rec.ledger_total, rec.balance_diff;
    RAISE NOTICE '   user_assets.locked=%, ledger locked合計=%, 差分=%',
      rec.user_assets_locked, rec.ledger_locked, rec.locked_diff;
  END LOOP;

  IF v_inconsistent_count = 0 THEN
    RAISE NOTICE '✅ 整合性チェック完了：不整合なし';
  ELSE
    RAISE NOTICE '⚠️ 整合性チェック：% 件の不整合を検出', v_inconsistent_count;
  END IF;

  RAISE NOTICE '===========================';
END $$;