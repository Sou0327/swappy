-- KYCを任意に設定（入金・出金には必須にしない）

-- KYC機能は有効のまま
UPDATE kyc_settings SET value = 'true' WHERE key = 'kyc_enabled';

-- 入金にKYCを必須にしない（任意）
UPDATE kyc_settings SET value = 'false' WHERE key = 'kyc_required_for_deposit';

-- 出金にKYCを必須にしない（任意）
UPDATE kyc_settings SET value = 'false' WHERE key = 'kyc_required_for_withdrawal';