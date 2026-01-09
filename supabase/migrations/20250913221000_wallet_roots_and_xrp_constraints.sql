-- ウォレットルート(xpub)とXRPタグ一意制約、スキャン進捗

-- 1) wallet_roots: チェーン/ネットワーク/資産ごとの拡張公開鍵管理
CREATE TABLE IF NOT EXISTS public.wallet_roots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  network text NOT NULL,
  asset text NOT NULL,
  xpub text NOT NULL,
  derivation_template text NOT NULL DEFAULT '0/{index}', -- xpub基準の相対パス
  address_type text NOT NULL DEFAULT 'default', -- evm(default) / p2wpkh など
  next_index integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain, network, asset, xpub)
);

ALTER TABLE public.wallet_roots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage wallet roots"
  ON public.wallet_roots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin')
    )
  );

CREATE TRIGGER update_wallet_roots_updated_at
  BEFORE UPDATE ON public.wallet_roots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.wallet_roots IS 'HD/xpub ルート管理。address-allocatorが参照する';

-- 2) XRPのDestination Tag一意制約（チェーン=xrp）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_xrp_destination_tag'
  ) THEN
    CREATE UNIQUE INDEX uniq_xrp_destination_tag
      ON public.deposit_addresses (network, destination_tag)
      WHERE chain = 'xrp';
  END IF;
END $$;

COMMENT ON INDEX uniq_xrp_destination_tag IS 'XRPはnetwork+destination_tagでユニーク（同一Tagの重複割当を防止）';

-- 3) チェーンスキャン進捗
CREATE TABLE IF NOT EXISTS public.chain_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  network text NOT NULL,
  asset text NOT NULL,
  last_block bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain, network, asset)
);

ALTER TABLE public.chain_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage chain progress"
  ON public.chain_progress FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin')
    )
  );

COMMENT ON TABLE public.chain_progress IS '各チェーンの最後に処理したブロック高を保持（再開/追跡用）';

