-- P0-③: KDF強化（鍵導出関数の強化）
--
-- 目的:
-- 1. PBKDF2反復回数を100k → 720kに引き上げ（OWASP推奨）
-- 2. key_versionフィールドでバージョン管理（後方互換性確保）
-- 3. AAD（Additional Authenticated Data）をAES-GCMに追加

-- ================================================
-- Step 1: master_keysテーブルにkey_versionとencryption_contextを追加
-- ================================================

-- key_versionカラムを追加（既存データはversion 1）
ALTER TABLE public.master_keys
ADD COLUMN IF NOT EXISTS key_version integer DEFAULT 1 NOT NULL;

COMMENT ON COLUMN public.master_keys.key_version IS
  '暗号化キーのバージョン: 1=PBKDF2(100k), 2=PBKDF2(720k)';

-- encryption_contextカラムを追加（AAD格納用）
ALTER TABLE public.master_keys
ADD COLUMN IF NOT EXISTS encryption_context jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.master_keys.encryption_context IS
  '暗号化コンテキスト（AAD: key_version, user_id, timestampなど）';

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_master_keys_key_version
ON public.master_keys(key_version);

-- ================================================
-- Step 2: wallet_rootsテーブルにkey_versionカラムを追加
-- ================================================

-- key_versionカラムを追加（既存データはversion 1）
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS key_version integer DEFAULT 1 NOT NULL;

COMMENT ON COLUMN public.wallet_roots.key_version IS
  '暗号化キーのバージョン: 1=PBKDF2(100k), 2=PBKDF2(720k)';

-- インデックスを追加（バージョン別の統計取得用）
CREATE INDEX IF NOT EXISTS idx_wallet_roots_key_version
ON public.wallet_roots(key_version);

-- ================================================
-- Step 2: 暗号化メタデータの追加
-- ================================================

-- AAD用のメタデータカラムを追加
ALTER TABLE public.wallet_roots
ADD COLUMN IF NOT EXISTS encryption_context jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.wallet_roots.encryption_context IS
  '暗号化コンテキスト（AAD用メタデータ: user_id, chain, timestampなど）';

-- ================================================
-- Step 3: バージョン情報を確認する関数
-- ================================================

CREATE OR REPLACE FUNCTION get_encryption_iterations(p_key_version integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_key_version
    WHEN 1 THEN RETURN 100000;  -- レガシー
    WHEN 2 THEN RETURN 720000;  -- 現行（OWASP推奨以上）
    ELSE RAISE EXCEPTION 'Unknown key_version: %', p_key_version;
  END CASE;
END;
$$;

COMMENT ON FUNCTION get_encryption_iterations IS
  'key_versionに対応するPBKDF2反復回数を返す';

-- ================================================
-- Step 4: 統計情報の取得関数
-- ================================================

CREATE OR REPLACE FUNCTION get_encryption_version_stats()
RETURNS TABLE(
  key_version integer,
  iterations integer,
  count bigint,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      wr.key_version,
      get_encryption_iterations(wr.key_version) as iterations,
      COUNT(*) as count
    FROM wallet_roots wr
    GROUP BY wr.key_version
  ),
  total AS (
    SELECT SUM(count) as total_count FROM stats
  )
  SELECT
    s.key_version,
    s.iterations,
    s.count,
    ROUND((s.count::numeric / t.total_count::numeric) * 100, 2) as percentage
  FROM stats s
  CROSS JOIN total t
  ORDER BY s.key_version;
END;
$$;

COMMENT ON FUNCTION get_encryption_version_stats IS
  '暗号化バージョンごとの統計情報を取得（運用監視用）';

-- ================================================
-- Step 5: 既存データの安全性確認
-- ================================================

-- 既存のwallet_rootsデータは全てkey_version=1としてマーク済み
-- 新規作成時はmaster-key-managerでkey_version=2を設定

-- 既存データの件数確認（ログ出力）
DO $$
DECLARE
  v_legacy_count integer;
BEGIN
  SELECT COUNT(*) INTO v_legacy_count
  FROM wallet_roots
  WHERE key_version = 1;

  RAISE NOTICE 'Existing wallet_roots with key_version=1 (100k iterations): %', v_legacy_count;
  RAISE NOTICE 'These will continue to work with legacy decryption';
  RAISE NOTICE 'New wallet_roots will use key_version=2 (720k iterations)';
END $$;
