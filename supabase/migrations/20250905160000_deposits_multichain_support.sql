-- フェーズ1-2: depositsテーブルのマルチチェーン対応拡張
-- docs/04-database-schema.md仕様に完全対応

-- 1. depositsテーブルにマルチチェーン対応カラムを追加
DO $$ 
BEGIN
    -- chain カラムを追加（存在しない場合のみ）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposits' AND column_name='chain') THEN
        ALTER TABLE deposits ADD COLUMN chain text;
    END IF;
    
    -- network カラムを追加（存在しない場合のみ）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposits' AND column_name='network') THEN
        ALTER TABLE deposits ADD COLUMN network text;
    END IF;
    
    -- asset カラムを追加（存在しない場合のみ）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposits' AND column_name='asset') THEN
        ALTER TABLE deposits ADD COLUMN asset text;
    END IF;
    
    -- wallet_address カラムを追加（存在しない場合のみ）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposits' AND column_name='wallet_address') THEN
        ALTER TABLE deposits ADD COLUMN wallet_address text;
    END IF;
    
    -- memo_tag カラムを追加（存在しない場合のみ）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposits' AND column_name='memo_tag') THEN
        ALTER TABLE deposits ADD COLUMN memo_tag text;
    END IF;
END $$;

-- 2. 既存データの移行（currencyからassetへの移行）
UPDATE deposits 
SET 
    chain = 'evm',
    network = 'ethereum', 
    asset = CASE 
        WHEN currency = 'ETH' THEN 'ETH'
        WHEN currency = 'USDT' THEN 'USDT'
        WHEN currency = 'USD' THEN 'USDT'  -- レガシーデータ対応
        ELSE currency
    END
WHERE chain IS NULL;

-- 3. chain_configs テーブルの初期データを仕様書通りに更新
INSERT INTO chain_configs (chain, network, asset, deposit_enabled, min_confirmations, min_deposit) VALUES
-- EVM (Ethereum)
('evm', 'ethereum', 'ETH', true, 12, 0.01),      -- ETH: 0.01〜0.05 ETH（推奨下限）
('evm', 'ethereum', 'USDT', true, 12, 1.0),      -- USDT(ERC-20): 1 USDT
('evm', 'sepolia', 'ETH', true, 3, 0.01),        -- Sepolia testnet
('evm', 'sepolia', 'USDT', true, 3, 1.0),

-- BTC (Bitcoin)
('btc', 'mainnet', 'BTC', false, 3, 0.0001),     -- BTC: 0.0001〜0.001 BTC（推奨下限）
('btc', 'testnet', 'BTC', false, 1, 0.0001),     -- Bitcoin testnet

-- XRP (Ripple)
('xrp', 'mainnet', 'XRP', false, 1, 20.0),       -- XRP: 20〜50 XRP（推奨下限）
('xrp', 'testnet', 'XRP', false, 1, 20.0),       -- XRP testnet

-- TRON
('trc', 'mainnet', 'TRX', false, 19, 10.0),      -- TRX: 10〜100 TRX（推奨下限）
('trc', 'mainnet', 'USDT', false, 19, 1.0),      -- USDT(TRC-20): 1 USDT
('trc', 'shasta', 'TRX', false, 10, 10.0),       -- Shasta testnet
('trc', 'shasta', 'USDT', false, 10, 1.0),

-- ADA (Cardano)
('ada', 'mainnet', 'ADA', false, 15, 1.0),       -- ADA: 1〜10 ADA（推奨下限）
('ada', 'testnet', 'ADA', false, 5, 1.0)         -- Cardano testnet

ON CONFLICT (chain, network, asset) DO UPDATE SET
    deposit_enabled = EXCLUDED.deposit_enabled,
    min_confirmations = EXCLUDED.min_confirmations,
    min_deposit = EXCLUDED.min_deposit,
    updated_at = now();

-- 4. 新しいインデックスを作成
CREATE INDEX IF NOT EXISTS idx_deposits_chain_network_asset 
ON deposits(chain, network, asset);

CREATE INDEX IF NOT EXISTS idx_deposits_wallet_address 
ON deposits(wallet_address);

CREATE INDEX IF NOT EXISTS idx_deposits_status_chain 
ON deposits(status, chain);

-- 5. deposit_addresses テーブルに新しいカラムを追加（フェーズ2対応）
DO $$ 
BEGIN
    -- xpub カラムを追加（BTC用）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_addresses' AND column_name='xpub') THEN
        ALTER TABLE deposit_addresses ADD COLUMN xpub text;
    END IF;
    
    -- destination_tag カラムを追加（XRP用、既存memo_tagと併用）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deposit_addresses' AND column_name='destination_tag') THEN
        ALTER TABLE deposit_addresses ADD COLUMN destination_tag text;
    END IF;
END $$;

-- 6. chain_configsテーブルに設定JSONを追加（拡張設定用）
DO $$ 
BEGIN
    -- config カラムを追加（JSONB形式で柔軟な設定を保存）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chain_configs' AND column_name='config') THEN
        ALTER TABLE chain_configs ADD COLUMN config jsonb DEFAULT '{}';
    END IF;
    
    -- active カラムを追加（deposit_enabledとは別の全体制御用）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chain_configs' AND column_name='active') THEN
        ALTER TABLE chain_configs ADD COLUMN active boolean NOT NULL DEFAULT true;
    END IF;
END $$;

-- 7. 設定JSONの初期値を設定
UPDATE chain_configs SET config = jsonb_build_object(
    'name', CASE 
        WHEN chain = 'evm' AND asset = 'ETH' THEN 'Ethereum'
        WHEN chain = 'evm' AND asset = 'USDT' THEN 'USDT (ERC-20)'
        WHEN chain = 'btc' THEN 'Bitcoin'
        WHEN chain = 'xrp' THEN 'XRP'
        WHEN chain = 'trc' AND asset = 'TRX' THEN 'Tron'
        WHEN chain = 'trc' AND asset = 'USDT' THEN 'USDT (TRC-20)'
        WHEN chain = 'ada' THEN 'Cardano'
        ELSE asset
    END,
    'symbol', asset,
    'decimals', CASE 
        WHEN chain = 'btc' THEN 8
        WHEN chain = 'evm' AND asset = 'ETH' THEN 18
        WHEN chain = 'evm' AND asset = 'USDT' THEN 6
        WHEN chain = 'trc' AND asset = 'TRX' THEN 6
        WHEN chain = 'trc' AND asset = 'USDT' THEN 6
        WHEN chain = 'xrp' THEN 6
        WHEN chain = 'ada' THEN 6
        ELSE 18
    END,
    'explorer', CASE 
        WHEN chain = 'evm' AND network = 'ethereum' THEN 'https://etherscan.io'
        WHEN chain = 'evm' AND network = 'sepolia' THEN 'https://sepolia.etherscan.io'
        WHEN chain = 'btc' AND network = 'mainnet' THEN 'https://blockstream.info'
        WHEN chain = 'btc' AND network = 'testnet' THEN 'https://blockstream.info/testnet'
        WHEN chain = 'xrp' AND network = 'mainnet' THEN 'https://xrpscan.com'
        WHEN chain = 'xrp' AND network = 'testnet' THEN 'https://testnet.xrpscan.com'
        WHEN chain = 'trc' AND network = 'mainnet' THEN 'https://tronscan.org'
        WHEN chain = 'trc' AND network = 'shasta' THEN 'https://shasta.tronscan.org'
        WHEN chain = 'ada' AND network = 'mainnet' THEN 'https://cardanoscan.io'
        WHEN chain = 'ada' AND network = 'testnet' THEN 'https://testnet.cardanoscan.io'
        ELSE ''
    END,
    'min_confirmations', min_confirmations,
    'min_deposit', min_deposit,
    'xpub_derivation', CASE WHEN chain = 'btc' THEN true ELSE false END,
    'destination_tag_required', CASE WHEN chain = 'xrp' THEN true ELSE false END
) WHERE config = '{}';

-- 8. 便利なビューを作成
CREATE OR REPLACE VIEW v_deposit_summary AS
SELECT 
    d.*,
    cc.config->>'name' as chain_name,
    cc.config->>'symbol' as asset_symbol,
    cc.config->>'explorer' as explorer_url,
    cc.active as chain_active,
    CASE 
        WHEN d.confirmations_observed >= d.confirmations_required THEN true
        ELSE false
    END as fully_confirmed
FROM deposits d
LEFT JOIN chain_configs cc ON d.chain = cc.chain AND d.network = cc.network AND d.asset = cc.asset;

-- 9. コメントを追加
COMMENT ON COLUMN deposits.chain IS 'ブロックチェーン種別 (evm, btc, xrp, trc, ada)';
COMMENT ON COLUMN deposits.network IS 'ネットワーク (ethereum, bitcoin, mainnet, testnet等)';  
COMMENT ON COLUMN deposits.asset IS '資産種別 (ETH, BTC, XRP, USDT, TRX, ADA等)';
COMMENT ON COLUMN deposits.wallet_address IS '入金先ウォレットアドレス';
COMMENT ON COLUMN deposits.memo_tag IS 'メモ・タグ情報 (XRP Destination Tag等)';

COMMENT ON COLUMN chain_configs.config IS 'チェーン設定のJSONデータ (名前、シンボル、エクスプローラー等)';
COMMENT ON COLUMN chain_configs.active IS 'チェーン全体の有効/無効フラグ';

COMMENT ON VIEW v_deposit_summary IS '入金情報とチェーン設定を結合した便利ビュー';