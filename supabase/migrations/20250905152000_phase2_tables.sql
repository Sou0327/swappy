-- deposit_addresses テーブルの拡張
ALTER TABLE deposit_addresses ADD COLUMN IF NOT EXISTS destination_tag text;
ALTER TABLE deposit_addresses ADD COLUMN IF NOT EXISTS xpub text;
ALTER TABLE deposit_addresses ADD COLUMN IF NOT EXISTS memo text;

-- XRP用の固定アドレステーブル
CREATE TABLE IF NOT EXISTS xrp_fixed_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  address text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(network, address)
);

-- XRP固定アドレスの初期データ
-- ⚠️ ホワイトラベル対応: 購入者がSupabase SQL Editorで独自のアドレスを登録してください
-- 例:
-- INSERT INTO xrp_fixed_addresses (network, address) VALUES
-- ('mainnet', 'rYourMainnetAddress'),  -- 自社のメインネット用XRPアドレス
-- ('testnet', 'rYourTestnetAddress')   -- 自社のテストネット用XRPアドレス
-- ON CONFLICT (network, address) DO NOTHING;

-- 入金トランザクション検知テーブル
CREATE TABLE IF NOT EXISTS deposit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deposit_address_id uuid REFERENCES deposit_addresses(id),
  chain text NOT NULL,
  network text NOT NULL,
  asset text,
  transaction_hash text NOT NULL,
  block_number bigint,
  block_hash text,
  from_address text NOT NULL,
  to_address text NOT NULL,
  amount decimal(36,18) NOT NULL,
  fee_amount decimal(36,18) DEFAULT 0,
  confirmations integer DEFAULT 0,
  required_confirmations integer DEFAULT 1,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  destination_tag text, -- XRP用
  memo text, -- 他チェーン用
  detected_at timestamp with time zone DEFAULT now(),
  confirmed_at timestamp with time zone,
  processed_at timestamp with time zone,
  raw_transaction jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT unique_deposit_transaction UNIQUE (chain, network, transaction_hash, to_address, destination_tag)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_user_id ON deposit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_status ON deposit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_chain_network ON deposit_transactions(chain, network);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_tx_hash ON deposit_transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_to_address ON deposit_transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_deposit_transactions_detected_at ON deposit_transactions(detected_at);

-- RLS (Row Level Security) の設定
ALTER TABLE deposit_transactions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の入金トランザクションのみ閲覧可能
CREATE POLICY "Users can view their own deposit transactions" 
  ON deposit_transactions FOR SELECT 
  USING (auth.uid() = user_id);

-- 管理者は全ての入金トランザクションを閲覧・操作可能
CREATE POLICY "Admins can manage all deposit transactions" 
  ON deposit_transactions FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  );

-- トリガー関数: updated_atの自動更新
CREATE OR REPLACE FUNCTION update_deposit_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_deposit_transactions_updated_at
  BEFORE UPDATE ON deposit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_deposit_transactions_updated_at();

-- XRP固定アドレステーブルのRLS
ALTER TABLE xrp_fixed_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active XRP addresses" 
  ON xrp_fixed_addresses FOR SELECT 
  USING (active = true);

CREATE POLICY "Admins can manage XRP addresses" 
  ON xrp_fixed_addresses FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );