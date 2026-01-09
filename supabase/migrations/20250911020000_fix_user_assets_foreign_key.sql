-- user_assets テーブルに適切な外部キー制約を追加
-- Supabaseのリレーション機能が正しく動作するようにする

-- 1. 既存の外部キー制約を確認し、必要に応じて追加
DO $$ 
BEGIN
    -- user_assets.user_id に auth.users への外部キー制約が存在するかチェック
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'user_assets' 
        AND kcu.column_name = 'user_id'
        AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN
        -- 外部キー制約を追加
        ALTER TABLE public.user_assets 
        ADD CONSTRAINT fk_user_assets_user_id 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added foreign key constraint: user_assets.user_id -> auth.users.id';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists: user_assets.user_id -> auth.users.id';
    END IF;
END $$;

-- 2. インデックスを追加（パフォーマンス向上のため）
CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON public.user_assets(user_id);

-- 3. RLS ポリシーが正しく設定されているか確認
-- 既存のRLSポリシーを確認し、必要に応じて再作成

-- ユーザーは自分の資産のみ参照可能
DROP POLICY IF EXISTS "Users can view their own assets" ON public.user_assets;
CREATE POLICY "Users can view their own assets" 
ON public.user_assets FOR SELECT 
USING (auth.uid() = user_id);

-- 管理者は全ての資産を参照・管理可能
DROP POLICY IF EXISTS "Admins can view all assets" ON public.user_assets;
CREATE POLICY "Admins can view all assets" 
ON public.user_assets FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can manage all assets" ON public.user_assets;
CREATE POLICY "Admins can manage all assets" 
ON public.user_assets FOR ALL 
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. スキーマキャッシュを強制更新するためのコメント追加
COMMENT ON TABLE public.user_assets IS 'ユーザー資産テーブル - auth.users との外部キー関係を持つ';
COMMENT ON COLUMN public.user_assets.user_id IS 'auth.users.id への外部キー参照';

-- 5. 統計情報を更新
ANALYZE public.user_assets;
ANALYZE public.profiles;