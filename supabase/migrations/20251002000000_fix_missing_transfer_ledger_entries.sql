-- 送金データの欠落したledger_entries記録を修正
-- 問題：古いtransfer_funds関数がledger_entriesに記録していなかった
-- 影響：user_transfers テーブルには記録があるが、ledger_entries には記録がない
-- 結果：user_balances_view と user_assets の不整合

-- 1. 診断：user_transfersにあるが、ledger_entriesにない送金を特定
DO $$
DECLARE
    missing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM public.user_transfers ut
    WHERE ut.status = 'completed'
      AND NOT EXISTS (
          SELECT 1 FROM public.ledger_entries le
          WHERE le.ref_id = ut.id AND le.ref_type = 'system'
      );

    RAISE NOTICE '🔍 ledger_entriesに記録されていない完了済み送金: % 件', missing_count;
END $$;

-- 2. 欠落している送金のledger_entries記録を作成
INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id, created_at)
SELECT
    ut.from_user_id,
    ut.currency,
    -ut.amount,  -- 送金者は減額
    0,
    'adj',
    'system',
    ut.id,
    ut.completed_at  -- 元の送金完了時刻を使用
FROM public.user_transfers ut
WHERE ut.status = 'completed'
  AND NOT EXISTS (
      SELECT 1 FROM public.ledger_entries le
      WHERE le.ref_id = ut.id
        AND le.ref_type = 'system'
        AND le.user_id = ut.from_user_id
  )
ON CONFLICT DO NOTHING;

-- 受信者のエントリ（増額）
INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id, created_at)
SELECT
    ut.to_user_id,
    ut.currency,
    ut.amount,  -- 受信者は増額
    0,
    'adj',
    'system',
    ut.id,
    ut.completed_at  -- 元の送金完了時刻を使用
FROM public.user_transfers ut
WHERE ut.status = 'completed'
  AND NOT EXISTS (
      SELECT 1 FROM public.ledger_entries le
      WHERE le.ref_id = ut.id
        AND le.ref_type = 'system'
        AND le.user_id = ut.to_user_id
  )
ON CONFLICT DO NOTHING;

-- 3. 修正結果の確認
DO $$
DECLARE
    fixed_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT ref_id) INTO fixed_count
    FROM public.ledger_entries
    WHERE ref_type = 'system'
      AND ref_id IN (
          SELECT id FROM public.user_transfers WHERE status = 'completed'
      );

    RAISE NOTICE '✅ ledger_entriesに記録された送金: % 件', fixed_count;
END $$;

-- 4. 整合性チェック：user_assets と user_balances_view の差分を確認
DO $$
DECLARE
    inconsistent_count INTEGER;
    rec RECORD;
BEGIN
    -- 不整合のあるレコードを表示
    FOR rec IN
        SELECT
            ua.user_id,
            ua.currency,
            ua.balance as user_assets_balance,
            COALESCE(ubv.total, 0) as user_balances_view_total,
            ua.balance - COALESCE(ubv.total, 0) as difference
        FROM public.user_assets ua
        LEFT JOIN public.user_balances_view ubv
            ON ua.user_id = ubv.user_id AND ua.currency = ubv.currency
        WHERE ABS(ua.balance - COALESCE(ubv.total, 0)) > 0.00000001
    LOOP
        RAISE NOTICE '⚠️ 不整合検出: user_id=%, currency=%, user_assets=%, user_balances_view=%, 差分=%',
            rec.user_id, rec.currency, rec.user_assets_balance,
            rec.user_balances_view_total, rec.difference;
    END LOOP;

    SELECT COUNT(*) INTO inconsistent_count
    FROM public.user_assets ua
    LEFT JOIN public.user_balances_view ubv
        ON ua.user_id = ubv.user_id AND ua.currency = ubv.currency
    WHERE ABS(ua.balance - COALESCE(ubv.total, 0)) > 0.00000001;

    IF inconsistent_count = 0 THEN
        RAISE NOTICE '✅ 整合性チェック完了：不整合なし';
    ELSE
        RAISE NOTICE '⚠️ 整合性チェック：% 件の不整合が残っています', inconsistent_count;
        RAISE NOTICE '💡 user_assetsを正とする場合は、追加のledger_entries調整が必要です';
    END IF;
END $$;

-- 完了ログ
DO $$
BEGIN
    RAISE NOTICE '✅ 欠落していた送金のledger_entries記録を追加しました';
    RAISE NOTICE '🔄 user_balances_view と user_assets の整合性を確認してください';
    RAISE NOTICE '📊 ダッシュボードの残高表示が正しく反映されるはずです';
END $$;
