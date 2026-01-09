-- 集約スイープ基盤: 管理ウォレットとスイープジョブ

-- 1) 管理ウォレットテーブル（送金先の集約先アドレス）
CREATE TABLE IF NOT EXISTS public.admin_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,         -- 'evm' | 'btc' | 'xrp' | 'trc' | 'ada'
  network text NOT NULL,       -- 'ethereum' | 'sepolia' | 'mainnet' | 'testnet' | 'shasta' 等
  asset text NOT NULL,         -- 'ETH' | 'BTC' | 'XRP' | 'USDT' | 'TRX' | 'ADA'
  address text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain, network, asset, address)
);

ALTER TABLE public.admin_wallets ENABLE ROW LEVEL SECURITY;

-- 管理者のみ全操作可
CREATE POLICY "Admins can manage admin wallets"
  ON public.admin_wallets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin')
    )
  );

-- updated_at自動更新
CREATE TRIGGER update_admin_wallets_updated_at
  BEFORE UPDATE ON public.admin_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.admin_wallets IS 'チェーン/ネットワーク/資産ごとの集約先ウォレットアドレス（管理者設定）';

-- 2) スイープジョブ（未署名Tx/PSBTの計画と進捗）
CREATE TABLE IF NOT EXISTS public.sweep_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid REFERENCES public.deposits(id) ON DELETE SET NULL,
  chain text NOT NULL,
  network text NOT NULL,
  asset text NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  planned_amount numeric(36,18) NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','signed','broadcasted','confirmed','failed')),
  unsigned_tx jsonb,           -- EVM: raw tx fields / BTC: PSBT base64(JSON格納可)
  signed_tx text,              -- 署名済みトランザクション（hex/base64）
  tx_hash text,                -- ブロードキャスト後のTXハッシュ
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sweep_jobs ENABLE ROW LEVEL SECURITY;

-- 管理者のみ全操作可
CREATE POLICY "Admins can manage sweep jobs"
  ON public.sweep_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin')
    )
  );

-- インデックス
CREATE INDEX IF NOT EXISTS idx_sweep_jobs_status ON public.sweep_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sweep_jobs_deposit_id ON public.sweep_jobs(deposit_id);
CREATE INDEX IF NOT EXISTS idx_sweep_jobs_chain_network ON public.sweep_jobs(chain, network, asset);

-- updated_at自動更新
CREATE TRIGGER update_sweep_jobs_updated_at
  BEFORE UPDATE ON public.sweep_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.sweep_jobs IS '入金の集約送金（スイープ）ジョブ。未署名Tx/PSBTの計画、署名、放送を管理';
COMMENT ON COLUMN public.sweep_jobs.unsigned_tx IS 'EVM: 未署名トランザクションパラメータ、BTC: PSBT';
COMMENT ON COLUMN public.sweep_jobs.signed_tx IS '署名済みトランザクション（hex/base64）';

