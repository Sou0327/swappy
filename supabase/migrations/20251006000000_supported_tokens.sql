-- トークン管理システム
-- 対応トークンをDBで管理し、管理者が動的に追加可能にする

-- 1. supported_tokensテーブル作成
CREATE TABLE IF NOT EXISTS public.supported_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL CHECK (chain IN ('evm', 'btc', 'trc', 'xrp', 'ada')),
  network text NOT NULL,
  asset text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  decimals integer NOT NULL CHECK (decimals >= 0 AND decimals <= 18),
  contract_address text,
  deposit_enabled boolean NOT NULL DEFAULT true,
  withdraw_enabled boolean NOT NULL DEFAULT true,
  convert_enabled boolean NOT NULL DEFAULT true,
  min_deposit numeric(20, 8),
  min_withdraw numeric(20, 8),
  withdraw_fee numeric(20, 8),
  display_order integer NOT NULL DEFAULT 0,
  icon_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain, network, asset)
);

-- 2. インデックス作成
CREATE INDEX IF NOT EXISTS idx_supported_tokens_active ON public.supported_tokens(active, display_order);
CREATE INDEX IF NOT EXISTS idx_supported_tokens_chain_network ON public.supported_tokens(chain, network);
CREATE INDEX IF NOT EXISTS idx_supported_tokens_deposit ON public.supported_tokens(deposit_enabled, active) WHERE deposit_enabled = true;
CREATE INDEX IF NOT EXISTS idx_supported_tokens_withdraw ON public.supported_tokens(withdraw_enabled, active) WHERE withdraw_enabled = true;
CREATE INDEX IF NOT EXISTS idx_supported_tokens_convert ON public.supported_tokens(convert_enabled, active) WHERE convert_enabled = true;

-- 3. RLSポリシー設定
ALTER TABLE public.supported_tokens ENABLE ROW LEVEL SECURITY;

-- 全ユーザーがアクティブなトークン情報を参照可能
CREATE POLICY supported_tokens_select_policy
  ON public.supported_tokens
  FOR SELECT
  USING (active = true);

-- 管理者のみ全トークン管理が可能
CREATE POLICY supported_tokens_admin_policy
  ON public.supported_tokens
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

-- 4. 更新日時自動更新トリガー
CREATE TRIGGER update_supported_tokens_updated_at
  BEFORE UPDATE ON public.supported_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 5. デフォルトトークンデータの挿入
INSERT INTO public.supported_tokens (chain, network, asset, name, symbol, decimals, deposit_enabled, withdraw_enabled, convert_enabled, display_order, active) VALUES
  -- Ethereum Mainnet
  ('evm', 'ethereum', 'ETH', 'Ethereum', 'ETH', 18, true, true, true, 1, true),
  ('evm', 'ethereum', 'USDT', 'Tether USD (ERC20)', 'USDT', 6, true, true, true, 2, true),
  ('evm', 'ethereum', 'USDC', 'USD Coin (ERC20)', 'USDC', 6, true, true, true, 3, true),

  -- Ethereum Sepolia Testnet
  ('evm', 'sepolia', 'ETH', 'Sepolia Ether', 'ETH', 18, true, true, true, 101, true),

  -- Bitcoin
  ('btc', 'mainnet', 'BTC', 'Bitcoin', 'BTC', 8, true, true, true, 10, true),
  ('btc', 'testnet', 'BTC', 'Bitcoin Testnet', 'BTC', 8, true, true, false, 110, true),

  -- Tron
  ('trc', 'mainnet', 'TRX', 'Tron', 'TRX', 6, true, true, true, 20, true),
  ('trc', 'mainnet', 'USDT', 'Tether USD (TRC20)', 'USDT', 6, true, true, true, 21, true),
  ('trc', 'shasta', 'TRX', 'Tron Shasta', 'TRX', 6, true, true, false, 120, true),

  -- Ripple
  ('xrp', 'mainnet', 'XRP', 'Ripple', 'XRP', 6, true, true, true, 30, true),
  ('xrp', 'testnet', 'XRP', 'Ripple Testnet', 'XRP', 6, true, true, false, 130, true),

  -- Cardano
  ('ada', 'mainnet', 'ADA', 'Cardano', 'ADA', 6, true, true, true, 40, true),
  ('ada', 'preprod', 'ADA', 'Cardano Preprod', 'ADA', 6, true, true, false, 140, true)
ON CONFLICT (chain, network, asset) DO NOTHING;

-- 6. ERC20トークンのコントラクトアドレス更新（Ethereum Mainnet）
UPDATE public.supported_tokens
SET contract_address = '0xdac17f958d2ee523a2206206994597c13d831ec7'
WHERE chain = 'evm' AND network = 'ethereum' AND asset = 'USDT';

UPDATE public.supported_tokens
SET contract_address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
WHERE chain = 'evm' AND network = 'ethereum' AND asset = 'USDC';

-- 7. コメント追加
COMMENT ON TABLE public.supported_tokens IS '対応トークンのマスターデータ管理';
COMMENT ON COLUMN public.supported_tokens.chain IS 'ブロックチェーンタイプ: evm, btc, trc, xrp, ada';
COMMENT ON COLUMN public.supported_tokens.network IS 'ネットワーク: mainnet, testnet, sepolia, shasta, preprod等';
COMMENT ON COLUMN public.supported_tokens.asset IS 'アセットシンボル（チェーン上での識別子）';
COMMENT ON COLUMN public.supported_tokens.name IS '表示用のトークン名';
COMMENT ON COLUMN public.supported_tokens.symbol IS '表示用のシンボル';
COMMENT ON COLUMN public.supported_tokens.decimals IS '小数点以下の桁数';
COMMENT ON COLUMN public.supported_tokens.contract_address IS 'スマートコントラクトアドレス（ERC20等）';
COMMENT ON COLUMN public.supported_tokens.deposit_enabled IS '入金機能の有効化';
COMMENT ON COLUMN public.supported_tokens.withdraw_enabled IS '出金機能の有効化';
COMMENT ON COLUMN public.supported_tokens.convert_enabled IS '両替機能の有効化';
COMMENT ON COLUMN public.supported_tokens.min_deposit IS '最小入金額';
COMMENT ON COLUMN public.supported_tokens.min_withdraw IS '最小出金額';
COMMENT ON COLUMN public.supported_tokens.withdraw_fee IS '出金手数料';
COMMENT ON COLUMN public.supported_tokens.display_order IS '表示順序（昇順）';
COMMENT ON COLUMN public.supported_tokens.active IS 'アクティブ状態（非アクティブは表示されない）';