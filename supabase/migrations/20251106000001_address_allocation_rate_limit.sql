-- P0-②: レート制限＆冪等性保護の実装
--
-- 目的:
-- 1. 1ユーザー・1資産あたり "active" アドレスは1件に制限
-- 2. idempotency_key による重複実行防止
-- 3. レート制限でアドレス乱発を防止

-- ================================================
-- Step 1: 既存のユニーク制約を部分ユニーク制約に変更
-- ================================================

-- 既存の制約を削除
ALTER TABLE public.user_deposit_addresses
DROP CONSTRAINT IF EXISTS user_deposit_addresses_user_id_currency_network_key;

-- 部分ユニーク制約を追加（is_active = true の場合のみ）
-- これにより、同じユーザー・通貨・ネットワークでactiveなアドレスは1件のみ
CREATE UNIQUE INDEX idx_user_deposit_addresses_active_unique
ON public.user_deposit_addresses(user_id, currency, network)
WHERE is_active = true;

COMMENT ON INDEX idx_user_deposit_addresses_active_unique IS
  '1ユーザー・1資産あたりactiveアドレスは1件のみに制限';

-- ================================================
-- Step 2: idempotency_key管理テーブルの作成
-- ================================================

-- アドレス発行リクエスト記録テーブル
CREATE TABLE IF NOT EXISTS public.deposit_address_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 冪等性キー（同じリクエストの重複実行を防ぐ）
  idempotency_key text NOT NULL UNIQUE,

  -- リクエスト情報
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL,
  network text NOT NULL,

  -- 結果
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  deposit_address_id uuid REFERENCES public.user_deposit_addresses(id) ON DELETE SET NULL,
  error_message text,

  -- タイムスタンプ
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,

  -- 有効期限（24時間後に自動削除される古いレコード用）
  expires_at timestamptz DEFAULT (now() + interval '24 hours')
);

COMMENT ON TABLE public.deposit_address_requests IS
  'アドレス発行リクエストの冪等性管理とレート制限チェック用';

-- インデックス
CREATE INDEX idx_deposit_address_requests_user_id
ON public.deposit_address_requests(user_id);

CREATE INDEX idx_deposit_address_requests_created_at
ON public.deposit_address_requests(created_at);

CREATE INDEX idx_deposit_address_requests_expires_at
ON public.deposit_address_requests(expires_at);

-- 古いリクエスト記録を自動削除（24時間経過後）
CREATE INDEX idx_deposit_address_requests_expired
ON public.deposit_address_requests(expires_at)
WHERE status IN ('completed', 'failed');

-- RLS有効化
ALTER TABLE public.deposit_address_requests ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "Users can view their own address requests"
ON public.deposit_address_requests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all address requests"
ON public.deposit_address_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ================================================
-- Step 3: レート制限チェック関数
-- ================================================

-- レート制限設定
-- - 1分間に3回まで
-- - 1時間に10回まで
-- - 1日に20回まで
CREATE OR REPLACE FUNCTION check_address_allocation_rate_limit(
  p_user_id uuid,
  p_currency text,
  p_network text
)
RETURNS TABLE(
  allowed boolean,
  reason text,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_1min integer;
  v_count_1hour integer;
  v_count_1day integer;
  v_active_count integer;
BEGIN
  -- 既にactiveなアドレスがあるかチェック
  SELECT COUNT(*) INTO v_active_count
  FROM user_deposit_addresses
  WHERE user_id = p_user_id
    AND currency = p_currency
    AND network = p_network
    AND is_active = true;

  IF v_active_count > 0 THEN
    RETURN QUERY SELECT
      false,
      'この通貨・ネットワークには既にactiveなアドレスが存在します'::text,
      0;
    RETURN;
  END IF;

  -- 1分間のリクエスト数をチェック
  SELECT COUNT(*) INTO v_count_1min
  FROM deposit_address_requests
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 minute';

  IF v_count_1min >= 3 THEN
    RETURN QUERY SELECT
      false,
      '1分間のリクエスト制限に達しました'::text,
      60;
    RETURN;
  END IF;

  -- 1時間のリクエスト数をチェック
  SELECT COUNT(*) INTO v_count_1hour
  FROM deposit_address_requests
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 hour';

  IF v_count_1hour >= 10 THEN
    RETURN QUERY SELECT
      false,
      '1時間のリクエスト制限に達しました'::text,
      3600;
    RETURN;
  END IF;

  -- 1日のリクエスト数をチェック
  SELECT COUNT(*) INTO v_count_1day
  FROM deposit_address_requests
  WHERE user_id = p_user_id
    AND created_at > now() - interval '1 day';

  IF v_count_1day >= 20 THEN
    RETURN QUERY SELECT
      false,
      '1日のリクエスト制限に達しました'::text,
      86400;
    RETURN;
  END IF;

  -- すべてのチェックをパス
  RETURN QUERY SELECT
    true,
    'OK'::text,
    0;
END;
$$;

COMMENT ON FUNCTION check_address_allocation_rate_limit IS
  'アドレス割り当てのレート制限チェック（1分3回、1時間10回、1日20回）';

-- ================================================
-- Step 4: 冪等性を考慮したアドレス割り当て関数
-- ================================================

CREATE OR REPLACE FUNCTION allocate_address_with_idempotency(
  p_user_id uuid,
  p_currency text,
  p_network text,
  p_idempotency_key text
)
RETURNS TABLE(
  success boolean,
  request_id uuid,
  deposit_address_id uuid,
  status text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_request record;
  v_rate_limit record;
  v_request_id uuid;
BEGIN
  -- 既存のidempotency_keyをチェック
  SELECT * INTO v_existing_request
  FROM deposit_address_requests
  WHERE idempotency_key = p_idempotency_key;

  -- 既存リクエストがある場合
  IF FOUND THEN
    -- completedなら成功レスポンスを返す
    IF v_existing_request.status = 'completed' THEN
      RETURN QUERY SELECT
        true,
        v_existing_request.id,
        v_existing_request.deposit_address_id,
        v_existing_request.status,
        '既に処理済みのリクエストです'::text;
      RETURN;
    END IF;

    -- failedなら失敗レスポンスを返す
    IF v_existing_request.status = 'failed' THEN
      RETURN QUERY SELECT
        false,
        v_existing_request.id,
        v_existing_request.deposit_address_id,
        v_existing_request.status,
        COALESCE(v_existing_request.error_message, '処理に失敗しました')::text;
      RETURN;
    END IF;

    -- pendingなら処理中を返す
    RETURN QUERY SELECT
      false,
      v_existing_request.id,
      v_existing_request.deposit_address_id,
      v_existing_request.status,
      '処理中のリクエストです。しばらくお待ちください'::text;
    RETURN;
  END IF;

  -- 新規リクエスト：レート制限をチェック
  SELECT * INTO v_rate_limit
  FROM check_address_allocation_rate_limit(p_user_id, p_currency, p_network);

  IF NOT v_rate_limit.allowed THEN
    -- レート制限に引っかかった場合、failedレコードを作成
    INSERT INTO deposit_address_requests (
      idempotency_key,
      user_id,
      currency,
      network,
      status,
      error_message,
      completed_at
    ) VALUES (
      p_idempotency_key,
      p_user_id,
      p_currency,
      p_network,
      'failed',
      v_rate_limit.reason,
      now()
    ) RETURNING id INTO v_request_id;

    RETURN QUERY SELECT
      false,
      v_request_id,
      NULL::uuid,
      'failed'::text,
      v_rate_limit.reason;
    RETURN;
  END IF;

  -- レート制限OK：pendingレコードを作成
  INSERT INTO deposit_address_requests (
    idempotency_key,
    user_id,
    currency,
    network,
    status
  ) VALUES (
    p_idempotency_key,
    p_user_id,
    p_currency,
    p_network,
    'pending'
  ) RETURNING id INTO v_request_id;

  -- 成功レスポンスを返す（実際のアドレス割り当てはEdge Functionで行う）
  RETURN QUERY SELECT
    true,
    v_request_id,
    NULL::uuid,
    'pending'::text,
    'アドレス割り当て処理を開始しました'::text;
END;
$$;

COMMENT ON FUNCTION allocate_address_with_idempotency IS
  '冪等性キーを使用したアドレス割り当てリクエストの記録と検証';

-- ================================================
-- Step 5: リクエスト完了時の更新関数
-- ================================================

CREATE OR REPLACE FUNCTION complete_address_request(
  p_request_id uuid,
  p_deposit_address_id uuid DEFAULT NULL,
  p_success boolean DEFAULT true,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE deposit_address_requests
  SET
    status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    deposit_address_id = p_deposit_address_id,
    error_message = p_error_message,
    completed_at = now()
  WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION complete_address_request IS
  'アドレス割り当てリクエストの完了処理';

-- ================================================
-- Step 6: 古いリクエスト記録の自動削除（メンテナンス）
-- ================================================

-- 24時間経過した完了/失敗レコードを削除する関数
CREATE OR REPLACE FUNCTION cleanup_expired_address_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM deposit_address_requests
  WHERE expires_at < now()
    AND status IN ('completed', 'failed');

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_address_requests IS
  '24時間経過した完了/失敗レコードを削除（定期実行推奨）';
