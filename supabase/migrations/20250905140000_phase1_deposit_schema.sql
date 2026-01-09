-- フェーズ1: ETH/USDT入金検知対応のDBスキーマ更新

-- 1. depositsテーブルに確認数カラムを追加
ALTER TABLE deposits 
ADD COLUMN confirmations_required integer DEFAULT 0,
ADD COLUMN confirmations_observed integer DEFAULT 0;

-- 2. deposit_addressesテーブル作成（ユーザー毎のアドレス管理）
CREATE TABLE IF NOT EXISTS deposit_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chain text NOT NULL,          -- 'evm' | 'btc' | 'xrp' など
    network text NOT NULL,        -- 'ethereum' | 'sepolia' | 'bitcoin' | 'xrpl-mainnet' など
    asset text,                   -- 省略可（チェーン単位の時はNULL）
    address text NOT NULL,        -- 受取用アドレス（XRPは固定アドレス）
    memo_tag text,                -- XRP: Destination Tag 等
    derivation_path text,         -- EVM/BTC: HDの派生パス、XRPはNULL
    address_index integer,        -- HDのindex
    active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, chain, network, asset)
);

-- 3. chain_configsテーブル作成（チェーン/資産別設定）
CREATE TABLE IF NOT EXISTS chain_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chain text NOT NULL,                -- 'evm' | 'btc' | 'xrp' など
    network text NOT NULL,              -- 'ethereum' | 'sepolia' | 'bitcoin' | 'xrpl-mainnet' 等
    asset text NOT NULL,                -- 'ETH' | 'USDT' | 'BTC' | 'XRP' 等
    deposit_enabled boolean NOT NULL DEFAULT false,
    min_confirmations integer NOT NULL DEFAULT 0,
    min_deposit decimal(20,8) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(chain, network, asset)
);

-- 4. インデックス作成
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_user_chain 
ON deposit_addresses(user_id, chain, network);

CREATE INDEX IF NOT EXISTS idx_deposits_confirmations 
ON deposits(confirmations_required, confirmations_observed);

CREATE INDEX IF NOT EXISTS idx_chain_configs_enabled 
ON chain_configs(deposit_enabled);

-- 5. RLS設定

-- deposit_addresses: 本人のみ参照可、管理者は全件操作可
ALTER TABLE deposit_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deposit addresses" ON deposit_addresses
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deposit addresses" ON deposit_addresses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deposit addresses" ON deposit_addresses
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all deposit addresses" ON deposit_addresses
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin')
        )
    );

-- chain_configs: 管理者のみ操作可、一般ユーザーは参照のみ
ALTER TABLE chain_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All users can view chain configs" ON chain_configs
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage chain configs" ON chain_configs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin')
        )
    );

-- 6. トリガー設定
CREATE TRIGGER update_deposit_addresses_updated_at
    BEFORE UPDATE ON deposit_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chain_configs_updated_at
    BEFORE UPDATE ON chain_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. 初期データ投入（フェーズ1: ETH/USDT(ERC-20)対応）
INSERT INTO chain_configs (chain, network, asset, deposit_enabled, min_confirmations, min_deposit) VALUES
('evm', 'ethereum', 'ETH', true, 12, 0.001),
('evm', 'ethereum', 'USDT', true, 12, 1.0)
ON CONFLICT (chain, network, asset) DO UPDATE SET
    deposit_enabled = EXCLUDED.deposit_enabled,
    min_confirmations = EXCLUDED.min_confirmations,
    min_deposit = EXCLUDED.min_deposit,
    updated_at = now();

-- テスト環境用（Sepolia）
INSERT INTO chain_configs (chain, network, asset, deposit_enabled, min_confirmations, min_deposit) VALUES
('evm', 'sepolia', 'ETH', true, 3, 0.001),
('evm', 'sepolia', 'USDT', true, 3, 1.0)
ON CONFLICT (chain, network, asset) DO UPDATE SET
    deposit_enabled = EXCLUDED.deposit_enabled,
    min_confirmations = EXCLUDED.min_confirmations,
    min_deposit = EXCLUDED.min_deposit,
    updated_at = now();

-- 8. ビュー作成（アクティブな設定のみ）
CREATE OR REPLACE VIEW active_chain_configs AS
SELECT * FROM chain_configs 
WHERE deposit_enabled = true
ORDER BY chain, network, asset;

-- 9. コメント追加
COMMENT ON TABLE deposit_addresses IS 'ユーザー毎のチェーン/ネットワーク別受取アドレス管理（フェーズ1: EVM EOA/HD派生対応）';
COMMENT ON TABLE chain_configs IS 'チェーン/資産毎の入金設定（受付可否、確認数、最小入金額）';
COMMENT ON COLUMN deposits.confirmations_required IS '必要確認数';
COMMENT ON COLUMN deposits.confirmations_observed IS '観測済み確認数';