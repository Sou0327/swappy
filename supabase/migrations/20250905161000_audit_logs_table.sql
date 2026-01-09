-- 監査ログテーブルの作成
-- 管理者操作、重要なシステム操作の記録用

DO $$ 
BEGIN
    -- audit_logsテーブルが存在しない場合のみ作成
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='audit_logs') THEN
        CREATE TABLE audit_logs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
          action text NOT NULL,                    -- 操作種別 (login, logout, deposit_approve, etc.)
          resource text NOT NULL,                  -- 操作対象 (users, deposits, chain_configs, etc.)
          resource_id text,                        -- 操作対象のID
          details jsonb DEFAULT '{}',              -- 操作の詳細情報
          ip_address inet,                         -- IPアドレス
          user_agent text,                         -- User Agent
          created_at timestamptz NOT NULL DEFAULT now()
        );
    ELSE
        -- 既存テーブルに不足しているカラムを追加
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='user_id') THEN
            ALTER TABLE audit_logs ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='action') THEN
            ALTER TABLE audit_logs ADD COLUMN action text NOT NULL DEFAULT 'unknown';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='resource') THEN
            ALTER TABLE audit_logs ADD COLUMN resource text NOT NULL DEFAULT 'unknown';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='resource_id') THEN
            ALTER TABLE audit_logs ADD COLUMN resource_id text;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='details') THEN
            ALTER TABLE audit_logs ADD COLUMN details jsonb DEFAULT '{}';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='ip_address') THEN
            ALTER TABLE audit_logs ADD COLUMN ip_address inet;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='user_agent') THEN
            ALTER TABLE audit_logs ADD COLUMN user_agent text;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='created_at') THEN
            ALTER TABLE audit_logs ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
        END IF;
    END IF;
END $$;

-- インデックス作成（存在チェック）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_user_id') THEN
        CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_action') THEN
        CREATE INDEX idx_audit_logs_action ON audit_logs(action);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_resource') THEN
        CREATE INDEX idx_audit_logs_resource ON audit_logs(resource);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_created_at') THEN
        CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
    END IF;
END $$;

-- RLS設定
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 管理者のみ参照可能
CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin')
    )
  );

-- システムによる挿入のみ許可
CREATE POLICY "System can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- コメント追加
COMMENT ON TABLE audit_logs IS '管理者操作・重要システム操作の監査ログ';
COMMENT ON COLUMN audit_logs.action IS '操作種別';
COMMENT ON COLUMN audit_logs.resource IS '操作対象のリソース種別';
COMMENT ON COLUMN audit_logs.resource_id IS '操作対象の具体的ID';
COMMENT ON COLUMN audit_logs.details IS '操作詳細のJSONデータ';
COMMENT ON COLUMN audit_logs.ip_address IS 'クライアントIPアドレス';
COMMENT ON COLUMN audit_logs.user_agent IS 'クライアントのUser Agent';

-- 初期データ（テスト用）
INSERT INTO audit_logs (user_id, action, resource, details) 
VALUES 
  (NULL, 'system_startup', 'system', jsonb_build_object('message', 'Audit log system initialized', 'timestamp', now()));