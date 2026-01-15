-- wallet_roots テーブルに管理者用ルートのみ挿入
-- ユーザー個別HDウォレット実装後は、各ユーザーが個別のwallet_rootsを持つ
-- このシードは管理者集中型ルートのみ作成する（レガシーデータとしてマーク）
--
-- ⚠️ 重要: 新しい一意制約 (master_key_id, chain, network) により、
--         1チェーン=1レコードのみ許可されます（Trust Wallet標準）
--         例: EthereumのETH/USDT/USDCはすべて同じアドレスを使用
--
-- ⚠️ 注意: これらは開発用のテストキーです。本番環境では絶対に使用しないでください

-- 注意: TRUNCATEは削除しました。ユーザー個別のwallet_rootsを保持するため。

-- マスターキーが存在しない場合はダミー管理者用を作成（開発環境のみ）
-- 本番環境では管理者用マスターキーを手動で作成してください
INSERT INTO public.master_keys (
  id,
  encrypted_mnemonic,
  mnemonic_iv,
  salt,
  created_by,
  description,
  active,
  backup_verified
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'encrypted_dummy_value', -- 実際の暗号化されたニーモニックを設定してください
  'dGVzdGl2MTIzNDU2', -- base64エンコードされたIV
  'dGVzdHNhbHQzMiYxNDU=', -- base64エンコードされたソルト
  '00000000-0000-0000-0000-000000000001', -- 作成者（管理者ID）
  '開発環境用ダミーマスターキー',
  true,
  false
) ON CONFLICT (id) DO NOTHING;

-- EVM (Ethereum) 用の管理者ルート
-- 注意: 1チェーン=1レコードのみ（ETH/USDT/USDCなどはすべてこのxpubを使用）
INSERT INTO public.wallet_roots (
  id,
  chain,
  network,
  asset,
  xpub,
  derivation_template,
  address_type,
  derivation_path,
  master_key_id,
  user_id,
  auto_generated,
  legacy_data,
  verified,
  active,
  next_index
) VALUES
-- Ethereum Mainnet (ETH/USDT/USDC共通)
(
  gen_random_uuid(),
  'evm',
  'ethereum',
  'ETH',
  'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj',
  '0/{index}',
  'default',
  "m/44'/60'/0'",
  '00000000-0000-0000-0000-000000000001',
  NULL, -- 管理者用はuser_id=NULL
  false, -- auto_generated=false (管理者集中型は自動生成ではない)
  true,  -- legacy_data=true (レガシーデータとしてマーク)
  false,
  true,
  0
),
-- Ethereum Sepolia (テストネット)
(
  gen_random_uuid(),
  'evm',
  'sepolia',
  'ETH',
  'xpub6DKdJBs59j1uq5q6PjsaG8JhmlGtQjSFFR2rdaxqCUyHMJ1F8zSgHHYM4Rj3wJUjqkN6HGdwpTwFMgYqKFG5nE4kdKEjh2LjCjdqMKjyXpV',
  '0/{index}',
  'default',
  "m/44'/11155111'/0'",
  '00000000-0000-0000-0000-000000000001',
  NULL, -- 管理者用はuser_id=NULL
  false, -- auto_generated=false (管理者集中型は自動生成ではない)
  true,  -- legacy_data=true (レガシーデータとしてマーク)
  false,
  true,
  0
);

-- 作成したレコードを確認
SELECT
  id,
  chain,
  network,
  asset,
  LEFT(xpub, 20) || '...' as xpub_truncated,
  derivation_template,
  derivation_path,
  user_id,
  auto_generated,
  active,
  next_index,
  created_at
FROM public.wallet_roots
ORDER BY chain, network, asset;

RAISE NOTICE '✅ 管理者用wallet_rootsシード完了';
RAISE NOTICE '⚠️ ユーザー個別HDウォレットはユーザー登録時に自動作成されます';
