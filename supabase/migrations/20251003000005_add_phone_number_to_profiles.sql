-- KYC申請に電話番号フィールドを追加
-- 目的: KYC申請時にユーザーの電話番号を収集する

BEGIN;

-- profilesテーブルに電話番号カラムを追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text;

-- 電話番号フィールドにコメントを追加
COMMENT ON COLUMN public.profiles.phone_number IS 'ユーザーの電話番号（KYC用）';

-- 変更内容をログに記録
DO $$
BEGIN
  RAISE NOTICE '📞 profilesテーブルに電話番号フィールドを追加しました';
  RAISE NOTICE '✅ KYC申請で電話番号を収集できるようになります';
  RAISE NOTICE '📋 フォーマット: 任意（例: 090-1234-5678, 09012345678）';
END $$;

COMMIT;