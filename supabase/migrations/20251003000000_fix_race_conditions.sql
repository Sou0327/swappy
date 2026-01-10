-- user_assets更新処理のrace condition修正
-- 発見された4つのCRITICAL/HIGH脆弱性を修正

-- ============================================
-- 1. transfer_funds関数の修正（CRITICAL）
-- ============================================
-- 問題：SELECT → CHECK → UPDATEの間にrace conditionがあり、資金の無限生成が可能
-- 修正：FOR UPDATEでロックを取得し、デッドロック対策も実装

CREATE OR REPLACE FUNCTION public.transfer_funds(
    p_to_user_identifier TEXT,
    p_currency TEXT,
    p_amount NUMERIC,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_from_user_id UUID := auth.uid();
    v_to_user_id UUID;
    v_transfer_id UUID;
    v_from_balance NUMERIC;
    v_reference_number TEXT;
    v_affected_rows INTEGER;
    v_first_user_id UUID;
    v_second_user_id UUID;
BEGIN
    -- 認証チェック
    IF v_from_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- 受信者のユーザーIDを特定
    IF p_to_user_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_to_user_id
        FROM auth.users
        WHERE id = p_to_user_identifier::UUID;
    ELSIF p_to_user_identifier ~ '^[a-zA-Z0-9_]+$' THEN
        SELECT id INTO v_to_user_id
        FROM profiles
        WHERE user_handle = p_to_user_identifier;
    ELSE
        SELECT id INTO v_to_user_id
        FROM profiles
        WHERE email = p_to_user_identifier;
    END IF;

    IF v_to_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recipient not found');
    END IF;

    IF v_from_user_id = v_to_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
    END IF;

    -- デッドロック対策：user_idの小さい方から順にロックを取得
    IF v_from_user_id < v_to_user_id THEN
        v_first_user_id := v_from_user_id;
        v_second_user_id := v_to_user_id;
    ELSE
        v_first_user_id := v_to_user_id;
        v_second_user_id := v_from_user_id;
    END IF;

    BEGIN
        -- 送金履歴レコード作成
        INSERT INTO user_transfers (
            from_user_id, to_user_id, currency, amount, description, status
        ) VALUES (
            v_from_user_id, v_to_user_id, p_currency, p_amount, p_description, 'pending'
        ) RETURNING id, reference_number INTO v_transfer_id, v_reference_number;

        -- 🔒 デッドロック対策：順序付きロック取得
        -- まず最初のユーザーの行をロック
        PERFORM id FROM user_assets
        WHERE user_id = v_first_user_id AND currency = p_currency
        FOR UPDATE;

        -- 次に2番目のユーザーの行をロック
        PERFORM id FROM user_assets
        WHERE user_id = v_second_user_id AND currency = p_currency
        FOR UPDATE;

        -- 🔒 送金者の残高をロック付きで取得
        SELECT balance INTO v_from_balance
        FROM user_assets
        WHERE user_id = v_from_user_id AND currency = p_currency
        FOR UPDATE;

        -- 残高チェック
        IF v_from_balance IS NULL OR v_from_balance < p_amount THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
        END IF;

        -- 送金者の残高から減額
        UPDATE user_assets
        SET balance = balance - p_amount,
            updated_at = NOW()
        WHERE user_id = v_from_user_id AND currency = p_currency;

        GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
        IF v_affected_rows = 0 THEN
            RAISE NOTICE '⚠️ 送金者のuser_assets更新失敗: user_id=%, currency=%', v_from_user_id, p_currency;
        ELSE
            RAISE NOTICE '✅ 送金者のuser_assets更新成功: % rows affected', v_affected_rows;
        END IF;

        -- 受信者の残高に加算（存在しない場合は作成）
        INSERT INTO user_assets (user_id, currency, balance)
        VALUES (v_to_user_id, p_currency, p_amount)
        ON CONFLICT (user_id, currency)
        DO UPDATE SET
            balance = user_assets.balance + p_amount,
            updated_at = NOW();

        RAISE NOTICE '✅ 受信者のuser_assets更新完了: user_id=%, currency=%, amount=%', v_to_user_id, p_currency, p_amount;

        -- ledger_entriesにも記録
        INSERT INTO ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_from_user_id, p_currency, -p_amount, 0, 'adj', 'system', v_transfer_id);

        INSERT INTO ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_to_user_id, p_currency, p_amount, 0, 'adj', 'system', v_transfer_id);

        -- 送金完了にステータス更新
        UPDATE user_transfers
        SET status = 'completed',
            completed_at = NOW()
        WHERE id = v_transfer_id;

        RETURN jsonb_build_object(
            'success', true,
            'transfer_id', v_transfer_id,
            'reference_number', v_reference_number,
            'message', 'Transfer completed successfully'
        );

    EXCEPTION WHEN OTHERS THEN
        UPDATE user_transfers
        SET status = 'failed',
            error_message = SQLERRM
        WHERE id = v_transfer_id;

        RETURN jsonb_build_object('success', false, 'error', 'Transfer failed: ' || SQLERRM);
    END;
END;
$$;

-- ============================================
-- 2. request_withdrawal関数の修正（CRITICAL）
-- ============================================
-- 問題：SELECT → CHECK → UPDATEの間にrace conditionがあり、二重出金が可能
-- 修正：user_assetsにFOR UPDATEでロックを取得

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_currency TEXT,
  p_amount NUMERIC,
  p_wallet_address TEXT,
  p_network TEXT DEFAULT NULL,
  p_memo TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_asset_balance NUMERIC;
  v_asset_locked NUMERIC;
  v_available NUMERIC;
  v_request_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- 🔒 user_assetsの残高をロック付きで取得
  SELECT COALESCE(balance,0), COALESCE(locked_balance,0)
  INTO v_asset_balance, v_asset_locked
  FROM user_assets
  WHERE user_id = v_user AND currency = p_currency
  FOR UPDATE;  -- ロック取得！

  -- 利用可能残高チェック
  v_available := (v_asset_balance - v_asset_locked);

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'insufficient balance: available=%, requested=%', v_available, p_amount;
  END IF;

  -- 出金申請レコード作成（withdrawalsテーブルを使用）
  INSERT INTO withdrawals (
    user_id, currency, amount, wallet_address, status, notes
  ) VALUES (
    v_user, p_currency, p_amount, p_wallet_address, 'pending',
    NULLIF(CONCAT('network=', COALESCE(p_network,''), '; memo=', COALESCE(p_memo,'')), 'network=; memo=')
  ) RETURNING id INTO v_request_id;

  -- ledger_entriesにロック記録
  INSERT INTO ledger_entries (
    user_id, currency, amount, locked_delta, kind, ref_type, ref_id
  ) VALUES (
    v_user, p_currency, 0, p_amount, 'withdrawal', 'withdrawal', v_request_id
  );

  -- user_assetsのlocked_balance更新
  INSERT INTO user_assets (user_id, currency, balance, locked_balance, updated_at)
  VALUES (v_user, p_currency, 0, p_amount, NOW())
  ON CONFLICT (user_id, currency)
  DO UPDATE SET
    locked_balance = user_assets.locked_balance + p_amount,
    updated_at = NOW();

  RETURN v_request_id;
END;
$$;

-- ============================================
-- 3. execute_conversion関数の修正（HIGH）
-- ============================================
-- 問題：SELECT → CHECK → UPDATEの間にrace conditionがあり、二重引き落としが可能
-- 修正：両替元と両替先の両方にFOR UPDATEでロックを取得
-- 注意：戻り値型とパラメータ名は既存の定義に合わせる（boolean, p_exchange_rate）

-- 既存関数を削除（戻り値型を変更できないため）
DROP FUNCTION IF EXISTS public.execute_conversion(uuid, text, text, numeric, numeric, numeric);

-- 新しい定義で作成（戻り値型はbooleanのまま、パラメータ名もp_exchange_rateのまま）
CREATE FUNCTION public.execute_conversion(
  p_user_id UUID,
  p_from_currency TEXT,
  p_to_currency TEXT,
  p_from_amount NUMERIC,
  p_to_amount NUMERIC,
  p_exchange_rate NUMERIC
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_asset_id UUID;
  v_to_asset_id UUID;
  v_current_balance NUMERIC;
BEGIN
  -- 🔒 両替元の残高をロック付きで取得
  SELECT id, balance INTO v_from_asset_id, v_current_balance
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_from_currency
  FOR UPDATE;  -- ロック取得！

  IF v_from_asset_id IS NULL THEN
    RAISE EXCEPTION '両替元の通貨が見つかりません: %', p_from_currency;
  END IF;

  IF v_current_balance < p_from_amount THEN
    RAISE EXCEPTION '残高が不足しています。必要: %, 利用可能: %', p_from_amount, v_current_balance;
  END IF;

  -- 🔒 両替先もロック（存在しない場合は作成）
  SELECT id INTO v_to_asset_id
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_to_currency
  FOR UPDATE;  -- ロック取得！

  IF v_to_asset_id IS NULL THEN
    INSERT INTO user_assets (user_id, currency, balance, locked_balance)
    VALUES (p_user_id, p_to_currency, 0, 0)
    RETURNING id INTO v_to_asset_id;
  END IF;

  -- 両替処理を実行
  BEGIN
    -- 両替元の残高を減らす
    UPDATE user_assets
    SET balance = balance - p_from_amount,
        updated_at = now()
    WHERE id = v_from_asset_id;

    -- 両替先の残高を増やす
    UPDATE user_assets
    SET balance = balance + p_to_amount,
        updated_at = now()
    WHERE id = v_to_asset_id;

    -- 両替記録を作成
    INSERT INTO currency_conversions (
      user_id,
      from_currency,
      to_currency,
      from_amount,
      to_amount,
      rate,
      status
    ) VALUES (
      p_user_id,
      p_from_currency,
      p_to_currency,
      p_from_amount,
      p_to_amount,
      p_exchange_rate,
      'completed'
    );

    RETURN true;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION '両替処理に失敗しました: %', SQLERRM;
      RETURN false;
  END;
END;
$$;

-- ============================================
-- 4. upsert_user_asset関数の修正（HIGH）
-- ============================================
-- 問題：ON CONFLICT DO UPDATEでのLost Update Problem
-- 修正：明示的なFOR UPDATEでロックを取得し、二段階処理に変更

CREATE OR REPLACE FUNCTION public.upsert_user_asset(
  p_user_id UUID,
  p_currency TEXT,
  p_amount NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_exists BOOLEAN;
BEGIN
  -- 🔒 ロック付きで現在の残高を取得
  SELECT balance, TRUE INTO v_current_balance, v_exists
  FROM user_assets
  WHERE user_id = p_user_id AND currency = p_currency
  FOR UPDATE;

  IF v_exists THEN
    -- 既存レコードを更新
    UPDATE user_assets
    SET balance = balance + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id AND currency = p_currency;
  ELSE
    -- 新規レコードを挿入（例外処理付き）
    BEGIN
      INSERT INTO user_assets (user_id, currency, balance, locked_balance)
      VALUES (p_user_id, p_currency, p_amount, 0);
    EXCEPTION WHEN unique_violation THEN
      -- 同時挿入の場合、再試行
      UPDATE user_assets
      SET balance = balance + p_amount,
          updated_at = now()
      WHERE user_id = p_user_id AND currency = p_currency;
    END;
  END IF;
END;
$$;

-- ============================================
-- 権限の付与
-- ============================================
-- request_withdrawal関数をauthenticatedユーザーが呼び出せるようにする
GRANT EXECUTE ON FUNCTION public.request_withdrawal(text, numeric, text, text, text) TO authenticated, anon;

-- ============================================
-- 完了ログ
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '🔒 ===== RACE CONDITION修正完了 =====';
    RAISE NOTICE '✅ transfer_funds: FOR UPDATEロック + デッドロック対策実装';
    RAISE NOTICE '✅ request_withdrawal: FOR UPDATEロック実装 + GRANT追加';
    RAISE NOTICE '✅ execute_conversion: 両替元・両替先の両方にロック実装';
    RAISE NOTICE '✅ upsert_user_asset: 明示的ロックで書き直し';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️ 次のステップ：';
    RAISE NOTICE '1. 並行実行テストの実施';
    RAISE NOTICE '2. user_assetsとledger_entriesの整合性監査';
    RAISE NOTICE '3. 本番環境への慎重な適用';
    RAISE NOTICE '=====================================';
END $$;