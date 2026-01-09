-- マイグレーション: 入金承認のアトミック処理
-- 目的: 残高更新とdepositステータス更新を同一トランザクション内で実行し、
--       二重計上のリスクを完全に排除する

-- approve_deposit_and_credit_balance:
-- 入金を承認し、ユーザー残高を更新する（アトミック操作）
CREATE OR REPLACE FUNCTION public.approve_deposit_and_credit_balance(
  p_deposit_id UUID,
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
  v_current_status TEXT;
  v_db_user_id UUID;
  v_db_asset TEXT;
  v_db_amount NUMERIC;
BEGIN
  -- セキュリティ重要: depositsテーブルから実際の値を取得（行ロック付き）
  -- 引数を信用せず、データベースの値を使用することで改竄を防止
  SELECT status, user_id, asset, amount
  INTO v_current_status, v_db_user_id, v_db_asset, v_db_amount
  FROM deposits
  WHERE id = p_deposit_id
  FOR UPDATE;

  -- depositが存在しない場合
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found: %', p_deposit_id;
  END IF;

  -- セキュリティチェック: user_idの一致確認
  IF v_db_user_id != p_user_id THEN
    RAISE EXCEPTION 'User ID mismatch for deposit: %', p_deposit_id;
  END IF;

  -- データ整合性チェック: 引数とDBの値が一致するか確認
  -- （クライアント側のバグや改竄の検出）
  IF v_db_asset != p_currency OR v_db_amount != p_amount THEN
    RAISE EXCEPTION 'Data mismatch detected - DB: % %, Args: % %',
      v_db_asset, v_db_amount, p_currency, p_amount;
  END IF;

  -- 既にcredited済みの場合はスキップ（冪等性を保証）
  IF v_current_status = 'credited' THEN
    RAISE NOTICE 'Deposit already credited: %', p_deposit_id;
    RETURN;
  END IF;

  -- confirmedでない場合はエラー
  IF v_current_status != 'confirmed' THEN
    RAISE EXCEPTION 'Deposit status must be confirmed, but is: %', v_current_status;
  END IF;

  -- 1. ユーザー残高を更新
  -- ★ 重要: 引数ではなく、DBから取得した値を使用
  PERFORM upsert_user_asset(v_db_user_id, v_db_asset, v_db_amount);

  -- 2. depositステータスをcreditedに更新
  UPDATE deposits
  SET status = 'credited',
      updated_at = now()
  WHERE id = p_deposit_id;

  -- トランザクション内で両方の操作が完了
  -- どちらかが失敗した場合、PostgreSQLが自動的に両方ロールバック
END;
$$;

-- コメント追加
COMMENT ON FUNCTION public.approve_deposit_and_credit_balance IS
  '入金承認と残高更新をアトミックに実行。二重計上を防止し、データ整合性を保証する。';

-- 権限付与: authenticated ロールに実行権限を付与
-- SECURITY DEFINERでも、関数を実行する権限は別途必要
GRANT EXECUTE ON FUNCTION public.approve_deposit_and_credit_balance(UUID, UUID, TEXT, NUMERIC)
  TO authenticated;
