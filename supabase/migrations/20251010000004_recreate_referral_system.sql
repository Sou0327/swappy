-- 紹介コードシステムの再構築
-- 既存の複雑な実装をシンプルな実装に置き換える
-- コード発行 + 紹介関係記録のみに集中

-- ========================================
-- 1. 既存リソースのクリーンアップ
-- ========================================

-- トリガーを削除
DROP TRIGGER IF EXISTS kyc_approval_reward_trigger ON public.kyc_applications;
DROP TRIGGER IF EXISTS create_referral_code_trigger ON public.profiles;
DROP TRIGGER IF EXISTS trigger_auto_generate_referral_code ON public.profiles;
DROP TRIGGER IF EXISTS update_referral_codes_updated_at ON public.referral_codes;

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS referral_codes_select_own ON public.referral_codes;
DROP POLICY IF EXISTS referral_codes_update_own ON public.referral_codes;
DROP POLICY IF EXISTS referral_codes_admin_all ON public.referral_codes;
DROP POLICY IF EXISTS referral_codes_select_admin ON public.referral_codes;
DROP POLICY IF EXISTS referral_codes_select_for_validation ON public.referral_codes;

DROP POLICY IF EXISTS referrals_select_related ON public.referrals;
DROP POLICY IF EXISTS referrals_admin_all ON public.referrals;
DROP POLICY IF EXISTS referrals_select_own ON public.referrals;
DROP POLICY IF EXISTS referrals_select_admin ON public.referrals;
DROP POLICY IF EXISTS referrals_insert_on_signup ON public.referrals;

DROP POLICY IF EXISTS referral_rewards_select_own ON public.referral_rewards;
DROP POLICY IF EXISTS referral_rewards_admin_all ON public.referral_rewards;

-- テーブルを削除（CASCADE で関連する外部キーも削除）
DROP TABLE IF EXISTS public.referral_rewards CASCADE;
DROP TABLE IF EXISTS public.referrals CASCADE;
DROP TABLE IF EXISTS public.referral_codes CASCADE;

-- 関数を削除
DROP FUNCTION IF EXISTS public.generate_referral_code_for_user() CASCADE;
DROP FUNCTION IF EXISTS public.process_referral_reward() CASCADE;
DROP FUNCTION IF EXISTS public.generate_referral_code(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.auto_generate_referral_code() CASCADE;

-- ========================================
-- 2. 新しいシンプルな実装
-- ========================================

-- referral_codesテーブル作成
CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT referral_codes_user_id_unique UNIQUE(user_id)
);

-- referralsテーブル作成
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス作成
CREATE INDEX idx_referral_codes_user_id ON public.referral_codes(user_id);
CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX idx_referrals_referee_id ON public.referrals(referee_id);
CREATE INDEX idx_referrals_created_at ON public.referrals(created_at DESC);

-- RLS有効化
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 3. RLSポリシー設定
-- ========================================

-- referral_codes: ユーザーは自分の紹介コードのみ参照可能
CREATE POLICY referral_codes_select_own ON public.referral_codes
  FOR SELECT
  USING (auth.uid() = user_id);

-- referral_codes: 管理者は全ての紹介コードを参照可能
CREATE POLICY referral_codes_select_admin ON public.referral_codes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- referral_codes: 紹介コード検証用（新規登録時）
CREATE POLICY referral_codes_select_for_validation ON public.referral_codes
  FOR SELECT
  USING (is_active = true);

-- referrals: ユーザーは自分が関係する紹介のみ参照可能
CREATE POLICY referrals_select_own ON public.referrals
  FOR SELECT
  USING (
    auth.uid() = referrer_id OR auth.uid() = referee_id
  );

-- referrals: 管理者は全ての紹介関係を参照可能
CREATE POLICY referrals_select_admin ON public.referrals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- referrals: 新規登録時に紹介関係を記録できる
-- セキュリティ: referrer_idがreferral_code_idの所有者と一致することを検証
CREATE POLICY referrals_insert_on_signup ON public.referrals
  FOR INSERT
  WITH CHECK (
    auth.uid() = referee_id
    AND referrer_id = (
      SELECT user_id
      FROM public.referral_codes
      WHERE id = referral_code_id
    )
  );

-- ========================================
-- 4. 紹介コード生成関数
-- ========================================

CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_attempt INT := 0;
  v_chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_random_part TEXT := '';
  i INT;
BEGIN
  -- 既にコードが存在する場合はエラー
  IF EXISTS (SELECT 1 FROM public.referral_codes WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'User already has a referral code';
  END IF;

  LOOP
    -- LXLX + 8桁のランダム英数字を生成
    v_random_part := '';
    FOR i IN 1..8 LOOP
      v_random_part := v_random_part || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;

    v_code := 'LXLX' || v_random_part;

    -- ユニーク性チェック
    IF NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_code) THEN
      -- コード挿入
      INSERT INTO public.referral_codes (user_id, code)
      VALUES (p_user_id, v_code);

      RETURN v_code;
    END IF;

    -- 最大試行回数チェック
    v_attempt := v_attempt + 1;
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after 10 attempts';
    END IF;
  END LOOP;
END;
$$;

-- ========================================
-- 5. トリガー関数: プロフィール作成時に紹介コード自動発行
-- ========================================

CREATE OR REPLACE FUNCTION public.auto_generate_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 紹介コードを自動生成
  BEGIN
    PERFORM public.generate_referral_code(NEW.id);
  EXCEPTION
    WHEN OTHERS THEN
      -- エラーが発生してもプロフィール作成は継続
      RAISE WARNING 'Failed to generate referral code for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ========================================
-- 6. トリガー設定
-- ========================================

CREATE TRIGGER trigger_auto_generate_referral_code
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_referral_code();

-- ========================================
-- 7. コメント追加
-- ========================================

COMMENT ON TABLE public.referral_codes IS '紹介コード管理: 各ユーザーの紹介コードを保存';
COMMENT ON TABLE public.referrals IS '紹介関係記録: 誰が誰を紹介したかを記録';
COMMENT ON COLUMN public.referral_codes.code IS '紹介コード（例: LXLX12AB34CD）';
COMMENT ON COLUMN public.referral_codes.is_active IS 'コードの有効/無効フラグ';
COMMENT ON COLUMN public.referrals.referrer_id IS '紹介者のユーザーID';
COMMENT ON COLUMN public.referrals.referee_id IS '被紹介者のユーザーID（UNIQUE制約で1人1回のみ紹介可能）';
COMMENT ON FUNCTION public.generate_referral_code IS 'ユーザーIDを受け取り、ユニークな紹介コードを生成してDBに保存';
COMMENT ON FUNCTION public.auto_generate_referral_code IS 'プロフィール作成時に自動的に紹介コードを発行するトリガー関数';
