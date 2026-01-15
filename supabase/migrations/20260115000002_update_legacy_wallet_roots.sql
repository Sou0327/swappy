-- ====================================
-- Fix legacy_data flags for existing wallet_roots
-- ====================================
-- Purpose: Update incorrectly flagged wallet_roots records
--
-- Problem:
-- - Old seed data had auto_generated=true, legacy_data=false
-- - Should be auto_generated=false, legacy_data=true for admin centralized wallets
-- - User-specific wallets should have auto_generated=true, legacy_data=false, user_id=<user_id>
--
-- Solution:
-- 1. Set user_id=NULL wallets to legacy (admin centralized system)
-- 2. Ensure user-specific wallets are marked as new system
-- ====================================

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Update admin centralized wallets (user_id=NULL) to legacy data
  UPDATE public.wallet_roots
  SET
    auto_generated = false,
    legacy_data = true
  WHERE user_id IS NULL
    AND auto_generated = true
    AND legacy_data = false;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % admin centralized wallet(s) to legacy data', updated_count;

  -- Ensure user-specific wallets are correctly flagged as new system
  UPDATE public.wallet_roots
  SET
    auto_generated = true,
    legacy_data = false
  WHERE user_id IS NOT NULL
    AND (auto_generated = false OR legacy_data = true);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % user-specific wallet(s) to new system', updated_count;

  RAISE NOTICE '✅ legacy_dataフラグ更新完了';
  RAISE NOTICE '📊 管理者用集権型ウォレット: user_id=NULL, auto_generated=false, legacy_data=true';
  RAISE NOTICE '📊 ユーザー個別HDウォレット: user_id=<user_id>, auto_generated=true, legacy_data=false';
END $$;

-- Verification query
SELECT
  chain,
  network,
  asset,
  user_id IS NOT NULL as has_user_id,
  auto_generated,
  legacy_data,
  COUNT(*) as count
FROM public.wallet_roots
GROUP BY
  chain,
  network,
  asset,
  user_id IS NOT NULL,
  auto_generated,
  legacy_data
ORDER BY
  chain,
  network,
  asset,
  has_user_id;
