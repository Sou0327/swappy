-- ====================================
-- Check current wallet_roots data
-- ====================================
-- Run this in Supabase Studio SQL Editor to see current state
-- ====================================

SELECT
  id,
  chain,
  network,
  asset,
  user_id,
  auto_generated,
  legacy_data,
  active,
  created_at
FROM public.wallet_roots
ORDER BY
  user_id NULLS LAST,
  chain,
  network,
  asset;
