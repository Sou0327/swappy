-- 重複アドレス制約の削除
-- ETH/USDTおよびTRC/USDTが同一アドレスを使用できるようにする

-- 理由: ブロックチェーンでは以下が技術的に正しい
-- - Ethereum: ETHとUSDT(ERC20)は同一アドレス
-- - Tron: TRXとUSDT(TRC20)は同一アドレス
-- - 現在のUNIQUE(address)制約がこの正常な動作を阻害している

-- 既存のUNIQUE(address)制約を削除
ALTER TABLE user_deposit_addresses
DROP CONSTRAINT IF EXISTS user_deposit_addresses_address_key;

-- 確認: UNIQUE(user_id, currency, network)制約は保持
-- これにより同一ユーザーが同一通貨で複数アドレスを持つことは防ぐが、
-- 同一アドレスで複数通貨を管理することは許可される

-- 削除後の制約確認クエリ
-- SELECT conname, contype FROM pg_constraint WHERE conrelid = 'user_deposit_addresses'::regclass;