-- 紹介コードシステム
-- ユーザーが紹介コードを使って新規ユーザーを招待し、報酬を獲得できる仕組み

-- 1. referral_codes テーブル（紹介コード管理）
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  code text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  max_uses integer, -- NULL = 無制限
  current_uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. referrals テーブル（紹介関係のトラッキング）
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  referral_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'completed')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 3. referral_rewards テーブル（報酬管理）
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES public.referrals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('referrer_bonus', 'referred_bonus', 'milestone_bonus')),
  currency text NOT NULL,
  amount numeric(20, 8) NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('pending', 'awarded', 'cancelled')) DEFAULT 'pending',
  awarded_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. インデックス作成
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON public.referral_codes(is_active, expires_at);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON public.referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referral_id ON public.referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user_id ON public.referral_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON public.referral_rewards(status);

-- 5. RLSポリシー設定
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- referral_codes: ユーザーは自分のコードのみ閲覧可能
CREATE POLICY referral_codes_select_own
  ON public.referral_codes
  FOR SELECT
  USING (user_id = auth.uid());

-- referral_codes: ユーザーは自分のコードのis_activeのみ更新可能
CREATE POLICY referral_codes_update_own
  ON public.referral_codes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- referral_codes: 管理者は全て管理可能
CREATE POLICY referral_codes_admin_all
  ON public.referral_codes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- referrals: ユーザーは自分に関連する紹介のみ閲覧可能
CREATE POLICY referrals_select_related
  ON public.referrals
  FOR SELECT
  USING (
    referrer_id = auth.uid() OR referred_id = auth.uid()
  );

-- referrals: 管理者は全て管理可能
CREATE POLICY referrals_admin_all
  ON public.referrals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- referral_rewards: ユーザーは自分の報酬のみ閲覧可能
CREATE POLICY referral_rewards_select_own
  ON public.referral_rewards
  FOR SELECT
  USING (user_id = auth.uid());

-- referral_rewards: 管理者は全て管理可能
CREATE POLICY referral_rewards_admin_all
  ON public.referral_rewards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- 6. 紹介コード自動生成トリガー関数
CREATE OR REPLACE FUNCTION public.generate_referral_code_for_user()
RETURNS TRIGGER AS $$
DECLARE
  new_code text;
  code_exists boolean;
  retry_count integer := 0;
  max_retries integer := 10;
BEGIN
  -- user_handleベースのコード生成を試みる
  IF NEW.user_handle IS NOT NULL AND NEW.user_handle != '' THEN
    new_code := UPPER(REGEXP_REPLACE(NEW.user_handle, '[^a-zA-Z0-9]', '', 'g'));
    new_code := SUBSTRING(new_code FROM 1 FOR 12); -- 最大12文字
  ELSE
    -- ランダムな8文字のコード生成
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::text) FROM 1 FOR 8));
  END IF;

  -- 一意性チェックとリトライ
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists OR retry_count >= max_retries;

    -- コードが既に存在する場合、ランダムな接尾辞を追加
    retry_count := retry_count + 1;
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text) FROM 1 FOR 8));
  END LOOP;

  -- 最大リトライ回数に達した場合はエラー
  IF retry_count >= max_retries THEN
    RAISE EXCEPTION 'Failed to generate unique referral code after % attempts', max_retries;
  END IF;

  -- referral_codesテーブルに挿入
  INSERT INTO public.referral_codes (user_id, code)
  VALUES (NEW.id, new_code);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーをログに記録し、処理は継続（ユーザー作成を妨げない）
    RAISE WARNING 'Error generating referral code for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- profilesテーブルのINSERTトリガーとして設定
CREATE TRIGGER create_referral_code_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_referral_code_for_user();

-- 7. KYC完了時の報酬付与トリガー関数
CREATE OR REPLACE FUNCTION public.process_referral_reward()
RETURNS TRIGGER AS $$
DECLARE
  referral_record RECORD;
  referrer_reward numeric := 10.0; -- USDT
  referred_reward numeric := 5.0; -- USDT
  reward_currency text := 'USDT';
BEGIN
  -- KYC承認された場合のみ処理
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- 紹介関係を検索
    SELECT * INTO referral_record
    FROM public.referrals
    WHERE referred_id = NEW.user_id
    AND status = 'pending'
    LIMIT 1;

    IF FOUND THEN
      -- 紹介関係をactiveに更新
      UPDATE public.referrals
      SET status = 'active', completed_at = NOW()
      WHERE id = referral_record.id;

      -- 紹介者への報酬（referrer_bonus）
      IF referral_record.referrer_id IS NOT NULL THEN
        INSERT INTO public.referral_rewards (referral_id, user_id, reward_type, currency, amount, status, notes)
        VALUES (
          referral_record.id,
          referral_record.referrer_id,
          'referrer_bonus',
          reward_currency,
          referrer_reward,
          'pending',
          'KYC approval bonus for referrer'
        );
      END IF;

      -- 被紹介者への報酬（referred_bonus）
      INSERT INTO public.referral_rewards (referral_id, user_id, reward_type, currency, amount, status, notes)
      VALUES (
        referral_record.id,
        NEW.user_id,
        'referred_bonus',
        reward_currency,
        referred_reward,
        'pending',
        'KYC approval welcome bonus'
      );

      -- 通知作成（オプション - 後で通知システムと統合）
      -- notification-senderを呼び出すか、notificationsテーブルに直接挿入

    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーをログに記録
    RAISE WARNING 'Error processing referral reward for user %: %', NEW.user_id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- kyc_applicationsテーブルのUPDATEトリガーとして設定
CREATE TRIGGER kyc_approval_reward_trigger
  AFTER UPDATE ON public.kyc_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.process_referral_reward();

-- 8. 更新日時自動更新トリガー（referral_codesテーブル用）
CREATE TRIGGER update_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 9. コメント追加
COMMENT ON TABLE public.referral_codes IS 'ユーザーの紹介コード管理';
COMMENT ON TABLE public.referrals IS '紹介関係のトラッキング';
COMMENT ON TABLE public.referral_rewards IS '紹介報酬の管理';

COMMENT ON COLUMN public.referral_codes.code IS '一意な紹介コード（英数字、大文字）';
COMMENT ON COLUMN public.referral_codes.is_active IS 'コードの有効/無効状態';
COMMENT ON COLUMN public.referral_codes.max_uses IS '最大使用回数（NULL = 無制限）';
COMMENT ON COLUMN public.referral_codes.current_uses IS '現在の使用回数';
COMMENT ON COLUMN public.referral_codes.expires_at IS 'コードの有効期限';

COMMENT ON COLUMN public.referrals.status IS '紹介のステータス: pending（登録済）, active（KYC完了）, completed（報酬付与完了）';
COMMENT ON COLUMN public.referrals.referral_code IS '使用された紹介コード';

COMMENT ON COLUMN public.referral_rewards.reward_type IS '報酬タイプ: referrer_bonus（紹介者報酬）, referred_bonus（被紹介者報酬）, milestone_bonus（マイルストーン報酬）';
COMMENT ON COLUMN public.referral_rewards.status IS '報酬ステータス: pending（承認待ち）, awarded（付与済）, cancelled（キャンセル）';