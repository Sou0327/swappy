-- wallet_roots テーブルにテスト用データを挿入
-- 開発環境でのアドレス生成をテストするための拡張公開鍵（xpub）データ
-- ⚠️ 注意: これらは開発用のテストキーです。本番環境では絶対に使用しないでください

-- EVM (Ethereum Mainnet) 用のテスト xpub
INSERT INTO public.wallet_roots (
  chain,
  network,
  asset,
  xpub,
  derivation_template,
  address_type,
  next_index,
  active
) VALUES
-- Ethereum Mainnet ETH
(
  'evm',
  'ethereum',
  'ETH',
  'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj',
  '0/{index}',
  'default',
  0,
  true
),
-- Ethereum Mainnet USDT
(
  'evm',
  'ethereum',
  'USDT',
  'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj',
  '0/{index}',
  'default',
  0,
  true
),
-- Ethereum Sepolia ETH (テストネット)
(
  'evm',
  'sepolia',
  'ETH',
  'xpub6DKdJBs59j1uq5q6PjsaG8JhmlGtQjSFFR2rdaxqCUyHMJ1F8zSgHHYM4Rj3wJUjqkN6HGdwpTwFMgYqKFG5nE4kdKEjh2LjCjdqMKjyXpV',
  '0/{index}',
  'default',
  0,
  true
),
-- Ethereum Sepolia USDT (テストネット)
(
  'evm',
  'sepolia',
  'USDT',
  'xpub6DKdJBs59j1uq5q6PjsaG8JhmlGtQjSFFR2rdaxqCUyHMJ1F8zSgHHYM4Rj3wJUjqkN6HGdwpTwFMgYqKFG5nE4kdKEjh2LjCjdqMKjyXpV',
  '0/{index}',
  'default',
  0,
  true
)

ON CONFLICT (chain, network, asset, xpub) DO UPDATE SET
  active = EXCLUDED.active,
  updated_at = now();

-- 作成したレコードを確認
SELECT
  id,
  chain,
  network,
  asset,
  LEFT(xpub, 20) || '...' as xpub_truncated,
  derivation_template,
  next_index,
  active,
  created_at
FROM public.wallet_roots
WHERE active = true
ORDER BY chain, network, asset;