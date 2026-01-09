-- transfer_funds関数の修正：locked_balanceを考慮した残高チェック
-- 問題：balance のみをチェックしているため、出金申請でロックされた資金も送金可能になっている
-- 修正：balance - locked_balance で利用可能残高を計算し、それをチェックする

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
    v_from_locked NUMERIC;
    v_from_available NUMERIC;
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

        -- 🔒 送金者の残高とロック残高をロック付きで取得
        SELECT COALESCE(balance, 0), COALESCE(locked_balance, 0)
        INTO v_from_balance, v_from_locked
        FROM user_assets
        WHERE user_id = v_from_user_id AND currency = p_currency
        FOR UPDATE;

        -- 利用可能残高を計算（balance - locked_balance）
        v_from_available := v_from_balance - v_from_locked;

        -- 利用可能残高チェック（locked_balanceを考慮）
        IF v_from_available < p_amount THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient available balance',
                'available', v_from_available,
                'requested', p_amount,
                'locked', v_from_locked
            );
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

-- 完了ログ
DO $$
BEGIN
    RAISE NOTICE '✅ transfer_funds関数を修正しました';
    RAISE NOTICE '   - balance と locked_balance の両方を取得';
    RAISE NOTICE '   - available = balance - locked_balance で利用可能残高を計算';
    RAISE NOTICE '   - 利用可能残高を基に送金可否を判定';
END $$;