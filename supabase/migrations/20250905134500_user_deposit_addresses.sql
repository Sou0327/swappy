-- ユーザー毎の個別入金アドレス管理テーブル
-- P1: EVM入金機能（個別アドレス生成）

-- 個別入金アドレステーブル
CREATE TABLE IF NOT EXISTS public.user_deposit_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL,
  network text NOT NULL,
  address text NOT NULL UNIQUE,
  private_key_encrypted text, -- 暗号化された秘密鍵（セキュリティ上重要）
  derivation_path text, -- HD Wallet用の導出パス
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- 複合ユニーク制約：ユーザー×通貨×ネットワークで一意
  UNIQUE(user_id, currency, network)
);

-- RLS有効化
ALTER TABLE public.user_deposit_addresses ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "Users can view their own deposit addresses" 
ON public.user_deposit_addresses
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deposit addresses"
ON public.user_deposit_addresses  
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all deposit addresses"
ON public.user_deposit_addresses
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can manage all deposit addresses"
ON public.user_deposit_addresses
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- インデックス
CREATE INDEX idx_user_deposit_addresses_user_id ON public.user_deposit_addresses(user_id);
CREATE INDEX idx_user_deposit_addresses_currency_network ON public.user_deposit_addresses(currency, network);
CREATE INDEX idx_user_deposit_addresses_address ON public.user_deposit_addresses(address);

-- updated_at自動更新トリガー
CREATE TRIGGER update_user_deposit_addresses_updated_at
  BEFORE UPDATE ON public.user_deposit_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 自動転送履歴テーブル
CREATE TABLE IF NOT EXISTS public.auto_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_address_id uuid NOT NULL REFERENCES public.user_deposit_addresses(id) ON DELETE CASCADE,
  deposit_id uuid REFERENCES public.deposits(id) ON DELETE SET NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  amount numeric(20,10) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  network text NOT NULL,
  tx_hash text, -- 転送トランザクションハッシュ
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
  gas_fee numeric(20,10) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  error_message text
);

-- auto_transfers RLS
ALTER TABLE public.auto_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own auto transfers"
ON public.auto_transfers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_deposit_addresses uda 
    WHERE uda.id = auto_transfers.deposit_address_id 
    AND uda.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all auto transfers"
ON public.auto_transfers
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can manage all auto transfers"  
ON public.auto_transfers
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- auto_transfersインデックス
CREATE INDEX idx_auto_transfers_deposit_address_id ON public.auto_transfers(deposit_address_id);
CREATE INDEX idx_auto_transfers_status ON public.auto_transfers(status);
CREATE INDEX idx_auto_transfers_tx_hash ON public.auto_transfers(tx_hash);

-- リアルタイム通知用のpublication追加
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_deposit_addresses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auto_transfers;