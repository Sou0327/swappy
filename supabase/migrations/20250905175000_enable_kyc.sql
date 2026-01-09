-- KYCシステムを有効化

-- KYC機能を有効にする
UPDATE kyc_settings SET value = 'true' WHERE key = 'kyc_enabled';

-- 入金にKYCを必須にする（必要に応じて）
UPDATE kyc_settings SET value = 'true' WHERE key = 'kyc_required_for_deposit';

-- 出金にKYCを必須にする
UPDATE kyc_settings SET value = 'true' WHERE key = 'kyc_required_for_withdrawal';