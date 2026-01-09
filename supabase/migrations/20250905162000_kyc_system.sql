-- KYC段階導入機能の基本実装
-- docs/05-authentication-authorization.md仕様に対応

-- 1. KYCステータス用のenumを作成
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status') THEN
        CREATE TYPE kyc_status AS ENUM ('none', 'pending', 'verified', 'rejected');
    END IF;
END $$;

-- 2. profilesテーブルにKYCカラムを追加
DO $$ 
BEGIN
    -- kyc_status カラムを追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='kyc_status') THEN
        ALTER TABLE profiles ADD COLUMN kyc_status kyc_status NOT NULL DEFAULT 'none';
    END IF;
    
    -- kyc_level カラムを追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='kyc_level') THEN
        ALTER TABLE profiles ADD COLUMN kyc_level integer NOT NULL DEFAULT 0;
    END IF;
    
    -- kyc_updated_at カラムを追加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='kyc_updated_at') THEN
        ALTER TABLE profiles ADD COLUMN kyc_updated_at timestamptz;
    END IF;
    
    -- kyc_notes カラムを追加（管理者用メモ）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='kyc_notes') THEN
        ALTER TABLE profiles ADD COLUMN kyc_notes text;
    END IF;
END $$;

-- 3. kyc_documents テーブルを作成（KYC書類管理）
CREATE TABLE IF NOT EXISTS kyc_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_type text NOT NULL CHECK (document_type IN ('identity', 'address', 'selfie', 'income')),
    file_name text NOT NULL,
    file_path text NOT NULL,        -- ファイルの保存パス（Supabase Storage等）
    file_size integer,              -- ファイルサイズ（bytes）
    mime_type text,                 -- MIMEタイプ
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by uuid REFERENCES auth.users(id),
    reviewed_at timestamptz,
    review_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. インデックス作成
CREATE INDEX IF NOT EXISTS idx_profiles_kyc_status ON profiles(kyc_status);
CREATE INDEX IF NOT EXISTS idx_profiles_kyc_level ON profiles(kyc_level);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_user_id ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_status ON kyc_documents(status);

-- 5. RLS設定（KYC documents）
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の書類のみ参照・作成可能
CREATE POLICY "Users can view own KYC documents" ON kyc_documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own KYC documents" ON kyc_documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 管理者は全書類を管理可能
CREATE POLICY "Admins can manage all KYC documents" ON kyc_documents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin')
        )
    );

-- 6. updated_at トリガー
CREATE TRIGGER update_kyc_documents_updated_at
    BEFORE UPDATE ON kyc_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. KYC関連の便利な関数を作成

-- ユーザーのKYCステータスを取得
CREATE OR REPLACE FUNCTION get_user_kyc_status(target_user_id uuid)
RETURNS kyc_status
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT kyc_status FROM profiles WHERE id = target_user_id;
$$;

-- KYCが必要かどうかを判定
CREATE OR REPLACE FUNCTION kyc_required()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT COALESCE(current_setting('app.kyc_required', true)::boolean, false);
$$;

-- ユーザーがKYC完了済みかを判定
CREATE OR REPLACE FUNCTION is_kyc_verified(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        CASE 
            WHEN kyc_required() = false THEN true  -- KYC任意の場合は常にtrue
            ELSE kyc_status = 'verified'
        END
    FROM profiles 
    WHERE id = target_user_id;
$$;

-- 8. KYC設定用のテーブル（システム設定）
CREATE TABLE IF NOT EXISTS kyc_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    value jsonb NOT NULL DEFAULT '{}',
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 初期設定データ
INSERT INTO kyc_settings (key, value, description) VALUES
('kyc_enabled', 'false', 'KYCシステムの有効/無効'),
('kyc_required_for_deposit', 'false', '入金にKYCが必須かどうか'),
('kyc_required_for_withdrawal', 'false', '出金にKYCが必須かどうか'),
('kyc_max_file_size', '5242880', '最大ファイルサイズ（bytes）'),
('kyc_allowed_file_types', '["image/jpeg", "image/png", "application/pdf"]', '許可ファイルタイプ')
ON CONFLICT (key) DO NOTHING;

-- RLS設定（KYC settings）
ALTER TABLE kyc_settings ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが設定を参照可能
CREATE POLICY "All users can view KYC settings" ON kyc_settings
    FOR SELECT USING (true);

-- 管理者のみ設定を変更可能
CREATE POLICY "Admins can manage KYC settings" ON kyc_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin')
        )
    );

-- updated_at トリガー
CREATE TRIGGER update_kyc_settings_updated_at
    BEFORE UPDATE ON kyc_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 9. 便利なビュー作成
CREATE OR REPLACE VIEW v_user_kyc_status AS
SELECT 
    p.id as user_id,
    p.email,
    p.full_name,
    p.kyc_status,
    p.kyc_level,
    p.kyc_updated_at,
    p.kyc_notes,
    COUNT(d.id) as document_count,
    COUNT(CASE WHEN d.status = 'approved' THEN 1 END) as approved_documents,
    COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_documents,
    COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_documents
FROM profiles p
LEFT JOIN kyc_documents d ON p.id = d.user_id
GROUP BY p.id, p.email, p.full_name, p.kyc_status, p.kyc_level, p.kyc_updated_at, p.kyc_notes;

-- 10. コメント追加
COMMENT ON COLUMN profiles.kyc_status IS 'KYC認証状態 (none/pending/verified/rejected)';
COMMENT ON COLUMN profiles.kyc_level IS 'KYCレベル (0:未認証, 1:基本認証, 2:拡張認証等)';
COMMENT ON COLUMN profiles.kyc_updated_at IS 'KYC状態最終更新日時';
COMMENT ON COLUMN profiles.kyc_notes IS '管理者用KYCメモ';

COMMENT ON TABLE kyc_documents IS 'KYC書類管理テーブル';
COMMENT ON COLUMN kyc_documents.document_type IS '書類種別 (identity/address/selfie/income)';
COMMENT ON COLUMN kyc_documents.file_path IS 'ファイル保存パス';
COMMENT ON COLUMN kyc_documents.status IS '審査状況 (pending/approved/rejected)';

COMMENT ON TABLE kyc_settings IS 'KYCシステム設定';
COMMENT ON VIEW v_user_kyc_status IS 'ユーザー毎のKYC状況サマリービュー';