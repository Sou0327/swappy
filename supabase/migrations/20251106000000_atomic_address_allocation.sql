-- P0-①: 原子的なアドレスインデックス割り当て関数
-- 競合を防ぎ、同じアドレスが複数ユーザーに割り当てられるのを防止
--
-- トランザクション設計について:
-- - allocate_next_address_index: next_indexの原子的インクリメント（PL/pgSQL）
-- - アドレス生成・保存: Edge Functionで実行（別トランザクション）
--
-- 理由:
-- 1. HDKey導出、Cardano WASM等はEdge Functionでのみ動作
-- 2. PL/pgSQLでアドレス生成まで実装すると複雑度が激増
-- 3. upsertのonConflict処理により、ユーザーごとに同一アドレスを保証
--
-- 影響:
-- - 競合時にindex空き番号が発生する可能性がある
-- - ただし、upsertにより同一ユーザーは常に同じアドレスを取得
-- - 運用上の実害は限定的（大量発生しない限り許容範囲）

CREATE OR REPLACE FUNCTION allocate_next_address_index(
  p_wallet_root_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_index integer;
BEGIN
  -- wallet_rootsのnext_indexを原子的にインクリメント
  -- 同時実行されても各リクエストは異なるindexを取得
  UPDATE wallet_roots
  SET
    next_index = next_index + 1,
    updated_at = now()
  WHERE id = p_wallet_root_id
    AND active = true
  RETURNING next_index - 1 INTO v_next_index;

  -- wallet_rootが見つからない場合
  IF v_next_index IS NULL THEN
    RAISE EXCEPTION 'Wallet root not found or inactive: %', p_wallet_root_id;
  END IF;

  RETURN v_next_index;
END;
$$;

-- 関数の説明を追加
COMMENT ON FUNCTION allocate_next_address_index(uuid) IS
'アドレス生成用のインデックスを原子的に割り当てる。
競合制御により、同じインデックスが複数のリクエストに返されることを防ぐ。
wallet_rootのnext_indexをインクリメントし、インクリメント前の値を返す。';

-- Supabase Edge Functionsからの実行を許可
GRANT EXECUTE ON FUNCTION allocate_next_address_index(uuid) TO service_role;
