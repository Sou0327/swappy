-- P0-④ 修正: XRP FK違反の解決
--
-- 目的:
-- 1. deposit_address_requests.deposit_address_idをNULLABLE化
-- 2. XRPの場合はdeposit_routesで管理するため、deposit_address_idはNULL
-- 3. 他チェーンは従来通りuser_deposit_addresses(id)を参照

-- ================================================
-- Step 1: deposit_address_idをNULLABLE化
-- ================================================

ALTER TABLE public.deposit_address_requests
ALTER COLUMN deposit_address_id DROP NOT NULL;

COMMENT ON COLUMN public.deposit_address_requests.deposit_address_id IS
  'user_deposit_addresses(id)参照。
  XRP Destination Tag方式の場合はNULL（deposit_routesで管理）。
  他チェーンは従来通りuser_deposit_addresses.idを格納。';

-- ================================================
-- Step 2: 既存データの整合性確認
-- ================================================

DO $$
DECLARE
  v_null_count integer;
  v_total_count integer;
BEGIN
  SELECT COUNT(*) INTO v_total_count
  FROM deposit_address_requests;

  SELECT COUNT(*) INTO v_null_count
  FROM deposit_address_requests
  WHERE deposit_address_id IS NULL;

  RAISE NOTICE 'Total address requests: %', v_total_count;
  RAISE NOTICE 'Requests with NULL deposit_address_id: %', v_null_count;

  IF v_null_count > 0 THEN
    RAISE NOTICE 'XRP Destination Tag方式のリクエストが存在します';
  END IF;
END $$;
