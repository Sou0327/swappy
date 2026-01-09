-- 送金限度額システムの完全削除
-- ユーザー要求により送金限度額の概念を削除

-- 1. 送金限度額テーブルのポリシーを削除
DROP POLICY IF EXISTS "Users can view their own transfer limits" ON public.transfer_limits;
DROP POLICY IF EXISTS "Admins can manage transfer limits" ON public.transfer_limits;

-- 2. 送金限度額テーブルを削除
DROP TABLE IF EXISTS public.transfer_limits;

-- 3. 送金限度額関連の関数を削除
DROP FUNCTION IF EXISTS public.set_default_transfer_limits(UUID);

-- 4. 送金処理RPC関数を限度額チェック無しに更新
CREATE OR REPLACE FUNCTION public.transfer_funds(
    p_to_user_identifier TEXT,  -- ユーザーハンドル、email、またはUUID
    p_currency TEXT,
    p_amount NUMERIC,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_from_user_id UUID := auth.uid();
    v_to_user_id UUID;
    v_transfer_id UUID;
    v_from_balance NUMERIC;
    v_reference_number TEXT;
    v_affected_rows INTEGER; -- デバッグ用：ROW_COUNT取得用変数
BEGIN
    -- 認証チェック
    IF v_from_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- 受信者のユーザーIDを特定
    -- UUIDの場合
    IF p_to_user_identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT id INTO v_to_user_id
        FROM auth.users
        WHERE id = p_to_user_identifier::UUID;
    -- ユーザーハンドルの場合
    ELSIF p_to_user_identifier ~ '^[a-zA-Z0-9_]+$' THEN
        SELECT id INTO v_to_user_id
        FROM public.profiles
        WHERE user_handle = p_to_user_identifier;
    -- emailの場合
    ELSE
        SELECT id INTO v_to_user_id
        FROM public.profiles
        WHERE email = p_to_user_identifier;
    END IF;

    -- 受信者が見つからない場合
    IF v_to_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recipient not found');
    END IF;

    -- 自分自身への送金チェック
    IF v_from_user_id = v_to_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
    END IF;

    -- 送金者の残高チェック
    SELECT balance INTO v_from_balance
    FROM public.user_assets
    WHERE user_id = v_from_user_id AND currency = p_currency;

    IF v_from_balance IS NULL OR v_from_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- 取引開始（原子性確保）
    BEGIN
        -- 送金履歴レコード作成
        INSERT INTO public.user_transfers (
            from_user_id, to_user_id, currency, amount, description, status
        ) VALUES (
            v_from_user_id, v_to_user_id, p_currency, p_amount, p_description, 'pending'
        ) RETURNING id, reference_number INTO v_transfer_id, v_reference_number;

        -- 送金者の残高から減額　（デバッグログ付き）
        UPDATE public.user_assets
        SET balance = balance - p_amount,
            updated_at = NOW()
        WHERE user_id = v_from_user_id AND currency = p_currency;

        -- デバッグ: UPDATE結果をログ出力
        GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
        IF v_affected_rows = 0 THEN
            RAISE NOTICE '⚠️ 送金者のuser_assets更新失敗: user_id=%, currency=%', v_from_user_id, p_currency;
        ELSE
            RAISE NOTICE '✅ 送金者のuser_assets更新成功: % rows affected', v_affected_rows;
        END IF;

        -- 受信者の残高に加算（存在しない場合は作成）
        INSERT INTO public.user_assets (user_id, currency, balance)
        VALUES (v_to_user_id, p_currency, p_amount)
        ON CONFLICT (user_id, currency)
        DO UPDATE SET
            balance = user_assets.balance + p_amount,
            updated_at = NOW();

        -- デバッグ: 受信者の更新結果をログ出力
        RAISE NOTICE '✅ 受信者のuser_assets更新完了: user_id=%, currency=%, amount=%', v_to_user_id, p_currency, p_amount;

        -- ledger_entries にも記録を追加（ダッシュボードとの同期のため）
        -- 送金者のエントリ（減額）
        INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_from_user_id, p_currency, -p_amount, 0, 'adj', 'system', v_transfer_id);

        -- 受信者のエントリ（増額）
        INSERT INTO public.ledger_entries (user_id, currency, amount, locked_delta, kind, ref_type, ref_id)
        VALUES (v_to_user_id, p_currency, p_amount, 0, 'adj', 'system', v_transfer_id);

        -- 送金完了にステータス更新
        UPDATE public.user_transfers
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
        -- エラーが発生した場合は送金失敗にマーク
        UPDATE public.user_transfers
        SET status = 'failed',
            error_message = SQLERRM
        WHERE id = v_transfer_id;

        RETURN jsonb_build_object('success', false, 'error', 'Transfer failed: ' || SQLERRM);
    END;
END;
$$;

-- 5. 新規ユーザー登録時の関数も限度額設定を削除して更新
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- プロファイル作成
  INSERT INTO public.profiles (id, email, full_name, user_handle, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    public.generate_user_handle(split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  );

  -- デフォルトのユーザーロール付与
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  -- 初期資産レコードを作成（主要通貨のみ）
  INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
  VALUES
    (NEW.id, 'BTC', 0.00000000, 0.00000000),
    (NEW.id, 'ETH', 0.00000000, 0.00000000),
    (NEW.id, 'USDT', 0.00000000, 0.00000000),
    (NEW.id, 'USDC', 0.00000000, 0.00000000),
    (NEW.id, 'JPY', 0.00000000, 0.00000000);

  RETURN NEW;
END;
$$;

-- 完了ログ
DO $$
BEGIN
    RAISE NOTICE '✅ 送金限度額システムが正常に削除されました';
    RAISE NOTICE '🚫 送金限度額の制約が解除されました';
    RAISE NOTICE '⚡ シンプルな送金機能が利用可能になりました';
END $$;