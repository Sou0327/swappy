-- chain_configsテーブルに必要なカラムを追加
ALTER TABLE chain_configs ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE chain_configs ADD COLUMN IF NOT EXISTS config jsonb;

-- Phase 2: マルチチェーン対応スキーマ
-- BTC, ETH, TRC, XRP, USDT, ADAに対応

-- チェーン設定テーブルの拡張 (主要チェーンとネットワーク)
INSERT INTO chain_configs (chain, network, asset, active, config, deposit_enabled, min_confirmations, min_deposit) VALUES
-- Bitcoin
('btc', 'mainnet', 'BTC', true, jsonb_build_object(
  'name', 'Bitcoin',
  'symbol', 'BTC', 
  'decimals', 8,
  'explorer', 'https://blockstream.info',
  'rpc_url', '',
  'xpub_derivation', true
), true, 3, 0.0001),
('btc', 'testnet', 'BTC', false, jsonb_build_object(
  'name', 'Bitcoin Testnet',
  'symbol', 'BTC',
  'decimals', 8, 
  'explorer', 'https://blockstream.info/testnet',
  'rpc_url', '',
  'xpub_derivation', true
), false, 1, 0.0001),

-- Tron (TRC-20)
('trc', 'mainnet', 'TRX', true, jsonb_build_object(
  'name', 'Tron',
  'symbol', 'TRX',
  'decimals', 6,
  'explorer', 'https://tronscan.org',
  'rpc_url', 'https://api.trongrid.io'
), true, 19, 1.0),
('trc', 'shasta', 'TRX', false, jsonb_build_object(
  'name', 'Tron Shasta Testnet', 
  'symbol', 'TRX',
  'decimals', 6,
  'explorer', 'https://shasta.tronscan.org',
  'rpc_url', 'https://api.shasta.trongrid.io'
), false, 1, 1.0),

-- XRP
('xrp', 'mainnet', 'XRP', true, jsonb_build_object(
  'name', 'XRP Ledger',
  'symbol', 'XRP',
  'decimals', 6,
  'explorer', 'https://xrpscan.com',
  'rpc_url', 'wss://xrplcluster.com',
  'fixed_address', true,
  'destination_tag_required', true
), true, 1, 20.0),
('xrp', 'testnet', 'XRP', false, jsonb_build_object(
  'name', 'XRP Ledger Testnet',
  'symbol', 'XRP', 
  'decimals', 6,
  'explorer', 'https://test.bithomp.com',
  'rpc_url', 'wss://s.altnet.rippletest.net:51233',
  'fixed_address', true,
  'destination_tag_required', true
), false, 1, 20.0),

-- Cardano
('ada', 'mainnet', 'ADA', true, jsonb_build_object(
  'name', 'Cardano',
  'symbol', 'ADA',
  'decimals', 6,
  'explorer', 'https://cardanoscan.io',
  'rpc_url', ''
), true, 15, 1.0),
('ada', 'testnet', 'ADA', false, jsonb_build_object(
  'name', 'Cardano Testnet',
  'symbol', 'ADA',
  'decimals', 6,
  'explorer', 'https://testnet.cardanoscan.io',
  'rpc_url', ''
), false, 5, 1.0)

ON CONFLICT (chain, network, asset) DO UPDATE SET
  config = EXCLUDED.config,
  active = EXCLUDED.active,
  deposit_enabled = EXCLUDED.deposit_enabled,
  min_confirmations = EXCLUDED.min_confirmations,
  min_deposit = EXCLUDED.min_deposit;

-- USDT トークン設定の追加
INSERT INTO chain_configs (chain, network, asset, active, config, deposit_enabled, min_confirmations, min_deposit) VALUES
-- USDT variants
('eth', 'mainnet', 'USDT', true, jsonb_build_object(
  'name', 'Tether USD (ERC-20)',
  'symbol', 'USDT',
  'decimals', 6,
  'contract_address', '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'token_type', 'ERC-20'
), true, 12, 1.0),
('eth', 'sepolia', 'USDT', false, jsonb_build_object(
  'name', 'Tether USD (ERC-20 Testnet)',
  'symbol', 'USDT',
  'decimals', 6,
  'contract_address', '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  'token_type', 'ERC-20'
), false, 3, 1.0),
('trc', 'mainnet', 'USDT', true, jsonb_build_object(
  'name', 'Tether USD (TRC-20)',
  'symbol', 'USDT',
  'decimals', 6,
  'contract_address', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  'token_type', 'TRC-20'
), true, 19, 1.0),
('trc', 'shasta', 'USDT', false, jsonb_build_object(
  'name', 'Tether USD (TRC-20 Testnet)',
  'symbol', 'USDT',
  'decimals', 6,
  'contract_address', 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  'token_type', 'TRC-20'
), false, 1, 1.0)

ON CONFLICT (chain, network, asset) DO UPDATE SET
  config = EXCLUDED.config,
  active = EXCLUDED.active,
  deposit_enabled = EXCLUDED.deposit_enabled,
  min_confirmations = EXCLUDED.min_confirmations,
  min_deposit = EXCLUDED.min_deposit;