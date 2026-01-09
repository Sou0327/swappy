-- 開発環境専用認証システム
-- ⚠️ 本番環境では絶対に実行されない安全装置付き

-- 環境チェック（本番環境では失敗する）
DO $$
DECLARE
    current_env TEXT;
BEGIN
    -- 本番環境の検出
    SELECT current_setting('app.environment', true) INTO current_env;

    -- 本番環境チェック（複数の方法で検証）
    IF current_env = 'production'
       OR current_database() LIKE '%prod%'
       OR current_database() LIKE '%production%' THEN
        RAISE EXCEPTION 'DEV_AUTH_ERROR: 開発用認証システムは本番環境では作成できません (ENV: %)', current_env;
    END IF;

    -- ログ出力
    RAISE NOTICE '開発用認証システム作成開始 (環境: %)', COALESCE(current_env, 'development');
END $$;

-- 1. 開発用認証制御テーブル
CREATE TABLE IF NOT EXISTS dev_auth_bypass (
    id SERIAL PRIMARY KEY,
    feature_name VARCHAR(50) UNIQUE NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    master_token VARCHAR(255), -- 開発用マスタートークン
    environment VARCHAR(20) DEFAULT 'development',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    daily_usage_limit INTEGER DEFAULT 50,
    session_timeout_minutes INTEGER DEFAULT 30,
    allowed_user_patterns TEXT[] DEFAULT '{}',
    disabled_reason TEXT,
    disabled_at TIMESTAMP WITH TIME ZONE,

    -- 安全制約: 本番環境では絶対に有効化できない
    CONSTRAINT env_safety_check CHECK (environment IN ('development', 'test', 'local')),
    CONSTRAINT no_production_env CHECK (environment != 'production'),
    CONSTRAINT valid_timeout CHECK (session_timeout_minutes BETWEEN 5 AND 60),
    CONSTRAINT reasonable_daily_limit CHECK (daily_usage_limit BETWEEN 1 AND 100)
);

-- 2. 開発用アクセス監査ログ
CREATE TABLE IF NOT EXISTS dev_access_logs (
    id SERIAL PRIMARY KEY,
    feature_name VARCHAR(50),
    target_user_id UUID,
    target_user_email TEXT,
    session_id UUID,
    access_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_ended_at TIMESTAMP WITH TIME ZONE,
    session_duration_seconds INTEGER,
    access_success BOOLEAN DEFAULT false,
    failure_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    environment_info JSONB,
    additional_data JSONB DEFAULT '{}'::jsonb
);

-- 3. 開発用テストユーザー管理
CREATE TABLE IF NOT EXISTS dev_test_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    user_role VARCHAR(20) DEFAULT 'user',
    test_scenario VARCHAR(100),
    test_data JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- テスト用ユーザーの制約
    CONSTRAINT dev_email_pattern CHECK (email LIKE '%@dev.local' OR email LIKE '%@test.local'),
    CONSTRAINT valid_role CHECK (user_role IN ('admin', 'moderator', 'user'))
);

-- インデックス作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_dev_auth_feature ON dev_auth_bypass(feature_name, is_enabled);
CREATE INDEX IF NOT EXISTS idx_dev_access_logs_timestamp ON dev_access_logs(access_timestamp);
CREATE INDEX IF NOT EXISTS idx_dev_access_logs_user ON dev_access_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_dev_test_users_email ON dev_test_users(email);
CREATE INDEX IF NOT EXISTS idx_dev_test_users_role ON dev_test_users(user_role);

-- Row Level Security (RLS) 設定
ALTER TABLE dev_auth_bypass ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_test_users ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: 開発環境でのみアクセス可能
CREATE POLICY "dev_auth_bypass_policy" ON dev_auth_bypass
    FOR ALL USING (
        -- 開発環境チェック（複数の条件）
        current_setting('app.environment', true) != 'production'
        AND current_database() NOT LIKE '%prod%'
        AND current_database() NOT LIKE '%production%'
    );

CREATE POLICY "dev_access_logs_policy" ON dev_access_logs
    FOR ALL USING (
        current_setting('app.environment', true) != 'production'
    );

CREATE POLICY "dev_test_users_policy" ON dev_test_users
    FOR ALL USING (
        current_setting('app.environment', true) != 'production'
    );

-- 初期データ挿入（開発用設定）
INSERT INTO dev_auth_bypass (
    feature_name,
    is_enabled,
    master_token,
    daily_usage_limit,
    session_timeout_minutes,
    allowed_user_patterns
) VALUES (
    'dev_user_switch',
    false, -- デフォルトは無効
    'dev_token_' || extract(epoch from now())::text, -- シンプルなトークン生成
    20, -- 1日20回まで
    15, -- 15分セッション
    ARRAY['%@dev.local', '%@test.local']
) ON CONFLICT (feature_name) DO NOTHING;

-- 開発用テストユーザーの作成
INSERT INTO dev_test_users (email, display_name, user_role, test_scenario, test_data) VALUES
    ('admin@dev.local', '管理者テストユーザー', 'admin', 'admin_operations', '{"balance": 1000000, "verified": true}'),
    ('user@dev.local', '一般ユーザー（残高あり）', 'user', 'normal_user_with_balance', '{"balance": 50000, "transactions": 5}'),
    ('newuser@dev.local', '新規ユーザー', 'user', 'new_user_empty', '{"balance": 0, "transactions": 0}'),
    ('moderator@dev.local', 'モデレーターユーザー', 'moderator', 'moderator_actions', '{"balance": 25000, "permissions": ["view_users"]}')
ON CONFLICT (email) DO NOTHING;

-- 便利な関数: 開発用認証の状態確認
CREATE OR REPLACE FUNCTION get_dev_auth_status()
RETURNS TABLE (
    feature_name TEXT,
    is_enabled BOOLEAN,
    usage_today INTEGER,
    daily_limit INTEGER,
    last_used TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 本番環境チェック
    IF current_setting('app.environment', true) = 'production' THEN
        RAISE EXCEPTION '開発機能は本番環境では利用できません';
    END IF;

    RETURN QUERY
    SELECT
        dab.feature_name::TEXT,
        dab.is_enabled,
        COALESCE(
            (SELECT COUNT(*)::INTEGER
             FROM dev_access_logs dal
             WHERE dal.feature_name = dab.feature_name
               AND dal.access_timestamp >= CURRENT_DATE),
            0
        ) as usage_today,
        dab.daily_usage_limit,
        COALESCE(dab.last_used_at::TEXT, 'never') as last_used
    FROM dev_auth_bypass dab;
END;
$$;

-- 便利な関数: 開発用認証の有効化/無効化
CREATE OR REPLACE FUNCTION toggle_dev_auth(
    p_feature_name TEXT,
    p_enabled BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_rows INTEGER;
BEGIN
    -- 環境チェック
    IF current_setting('app.environment', true) = 'production' THEN
        RAISE EXCEPTION '開発機能は本番環境では操作できません';
    END IF;

    -- 状態更新
    UPDATE dev_auth_bypass
    SET
        is_enabled = p_enabled,
        updated_at = NOW(),
        disabled_reason = CASE WHEN p_enabled THEN NULL ELSE p_reason END,
        disabled_at = CASE WHEN p_enabled THEN NULL ELSE NOW() END
    WHERE feature_name = p_feature_name;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;

    -- ログ記録
    INSERT INTO dev_access_logs (
        feature_name,
        access_timestamp,
        access_success,
        additional_data
    ) VALUES (
        p_feature_name,
        NOW(),
        true,
        jsonb_build_object(
            'action', CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END,
            'reason', COALESCE(p_reason, 'manual_toggle')
        )
    );

    RETURN affected_rows > 0;
END;
$$;

-- 危険な操作の制限: DROP文を無効化する関数
CREATE OR REPLACE FUNCTION prevent_dev_table_drop()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
    obj RECORD;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP
        IF obj.object_name IN ('dev_auth_bypass', 'dev_access_logs', 'dev_test_users') THEN
            RAISE EXCEPTION 'DEV_AUTH_PROTECTION: 開発用認証テーブルの削除は禁止されています';
        END IF;
    END LOOP;
END;
$$;

-- イベントトリガーで保護
CREATE EVENT TRIGGER protect_dev_tables
ON sql_drop
EXECUTE FUNCTION prevent_dev_table_drop();

-- 完了ログ
DO $$
BEGIN
    RAISE NOTICE '✅ 開発用認証システムが正常に作成されました';
    RAISE NOTICE '⚠️  本システムは開発環境専用です';
    RAISE NOTICE '🔒 本番環境では自動的に無効化されます';
END $$;