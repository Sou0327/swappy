-- Undefined プロジェクト シードデータ
-- 初期管理者アカウントとサンプルデータの作成

-- 注意: この操作は開発環境でのみ実行してください

-- =================================
-- 初期管理者アカウント作成用データ
-- =================================

-- 管理者用のサンプルユーザーID（本番環境では使用しない）
-- 実際の管理者アカウントは Supabase Auth UI または手動で作成してください

-- 既存ユーザーがいる場合、admin と moderator ロールを追加
-- この処理は冪等性を保つため、エラーを無視します
DO $$ 
BEGIN
    -- 最初のユーザー（通常は開発者）にadmin権限を付与
    IF EXISTS (SELECT 1 FROM auth.users LIMIT 1) THEN
        INSERT INTO user_roles (user_id, role) 
        SELECT id, 'admin'::app_role 
        FROM auth.users 
        ORDER BY created_at 
        LIMIT 1
        ON CONFLICT (user_id, role) DO NOTHING;
        
        -- moderator権限も付与
        INSERT INTO user_roles (user_id, role) 
        SELECT id, 'moderator'::app_role 
        FROM auth.users 
        ORDER BY created_at 
        LIMIT 1
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $$;

-- =================================
-- サンプルデータ作成
-- =================================

-- デフォルトマーケットの追加（既にマイグレーションで作成済みだが念のため）
INSERT INTO markets (id, base, quote, price_tick, qty_step, min_notional, status)
VALUES 
    ('BTC-USDT', 'BTC', 'USDT', 0.01, 0.000001, 5, 'active'),
    ('ETH-USDT', 'ETH', 'USDT', 0.01, 0.0001, 5, 'active'),
    ('BTC-ETH', 'BTC', 'ETH', 0.0001, 0.000001, 0.01, 'active')
ON CONFLICT (id) DO NOTHING;

-- チェーン設定のサンプルデータ（supported_tokensテーブルに直接挿入）
-- 注意: chain_configsはVIEWなので、supported_tokensに直接挿入します
INSERT INTO supported_tokens (chain, network, asset, name, symbol, decimals, deposit_enabled, min_confirmations, min_deposit)
VALUES
    ('evm', 'sepolia', 'ETH', 'Sepolia Ether', 'ETH', 18, true, 12, 0.01),
    ('evm', 'sepolia', 'USDT', 'Tether USD (Sepolia)', 'USDT', 6, true, 12, 1.0),
    ('btc', 'testnet', 'BTC', 'Bitcoin Testnet', 'BTC', 8, false, 3, 0.0001),
    ('trc', 'nile', 'TRX', 'Tron Nile', 'TRX', 6, false, 19, 10),
    ('trc', 'nile', 'USDT', 'Tether USD (Nile)', 'USDT', 6, false, 19, 1.0),
    ('xrp', 'testnet', 'XRP', 'Ripple Testnet', 'XRP', 6, false, 1, 20),
    ('ada', 'testnet', 'ADA', 'Cardano Testnet', 'ADA', 6, false, 15, 1.0)
ON CONFLICT (chain, network, asset) DO NOTHING;

-- サポート用デフォルトカテゴリ
-- 注意: support_tickets テーブルにcategoryカラムがある場合のみ
-- INSERT INTO support_categories (name, description) VALUES 
--     ('technical', '技術的な問題'),
--     ('account', 'アカウント関連'),
--     ('deposit', '入金に関する問題'),
--     ('withdrawal', '出金に関する問題'),
--     ('trading', '取引に関する問題'),
--     ('other', 'その他')
-- ON CONFLICT (name) DO NOTHING;

-- =================================
-- 開発用サンプルユーザー資産
-- =================================

-- 開発環境でのテスト用資産データ
-- 最初のユーザーにサンプル資産を付与
DO $$ 
DECLARE
    first_user_id uuid;
BEGIN
    -- 最初のユーザーのIDを取得
    SELECT id INTO first_user_id 
    FROM auth.users 
    ORDER BY created_at 
    LIMIT 1;
    
    IF first_user_id IS NOT NULL THEN
        -- サンプル資産を挿入
        INSERT INTO user_assets (user_id, currency, balance, locked_balance)
        VALUES 
            (first_user_id, 'USDT', 10000.00, 0.00),
            (first_user_id, 'BTC', 0.1, 0.00),
            (first_user_id, 'ETH', 1.0, 0.00)
        ON CONFLICT (user_id, currency) DO NOTHING;
    END IF;
END $$;

-- =================================
-- ログ出力
-- =================================
DO $$ 
BEGIN
    RAISE NOTICE 'Undefined シードデータの投入が完了しました';
    RAISE NOTICE '管理者権限: 最初のユーザーにadmin/moderatorロールを付与';
    RAISE NOTICE 'マーケット: BTC-USDT, ETH-USDT, BTC-ETHを追加';
    RAISE NOTICE 'チェーン設定: テスト用設定を追加';
    RAISE NOTICE 'サンプル資産: 最初のユーザーにテスト用資産を付与';
END $$;