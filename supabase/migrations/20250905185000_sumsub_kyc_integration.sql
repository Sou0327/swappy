-- Sumsub KYC統合用テーブル

-- KYC申請管理テーブル
CREATE TABLE IF NOT EXISTS kyc_applications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'sumsub',
    external_application_id VARCHAR(255), -- Sumsubの申請ID
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    level_name VARCHAR(100), -- Sumsubのレベル名
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    webhook_data JSONB, -- Webhookから受信したデータ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_kyc_applications_user_id ON kyc_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_applications_external_id ON kyc_applications(external_application_id);
CREATE INDEX IF NOT EXISTS idx_kyc_applications_status ON kyc_applications(status);

-- RLS設定
ALTER TABLE kyc_applications ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のKYC申請のみ参照可能
CREATE POLICY "Users can view their own KYC applications"
ON kyc_applications FOR SELECT
USING (auth.uid() = user_id);

-- ユーザーは自分のKYC申請を作成可能
CREATE POLICY "Users can create their own KYC applications"
ON kyc_applications FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 管理者は全KYC申請を管理可能
CREATE POLICY "Admins can manage all KYC applications"
ON kyc_applications FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
);

-- 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION update_kyc_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_kyc_applications_updated_at
    BEFORE UPDATE ON kyc_applications
    FOR EACH ROW
    EXECUTE PROCEDURE update_kyc_applications_updated_at();

-- コメント
COMMENT ON TABLE kyc_applications IS 'KYC申請管理（Sumsub統合）';
COMMENT ON COLUMN kyc_applications.external_application_id IS 'Sumsubの申請ID';
COMMENT ON COLUMN kyc_applications.webhook_data IS 'Webhookから受信したデータ';