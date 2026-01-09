-- 補完マイグレーション: 検知状態・承認設定・手動承認キュー・資産更新RPC

-- 1) 入金検知の進捗保存テーブル
CREATE TABLE IF NOT EXISTS public.deposit_detection_state (
  chain text NOT NULL,
  network text NOT NULL,
  last_block_height bigint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, network)
);

-- 2) 入金確認設定
CREATE TABLE IF NOT EXISTS public.deposit_confirmation_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  network text NOT NULL,
  min_confirmations integer NOT NULL DEFAULT 1,
  max_confirmations integer NOT NULL DEFAULT 1000,
  timeout_minutes integer NOT NULL DEFAULT 120,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(chain, network)
);

-- 3) 入金承認ルール
CREATE TABLE IF NOT EXISTS public.deposit_approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  network text NOT NULL,
  asset text NOT NULL,
  min_amount numeric(36,18) NOT NULL DEFAULT 0,
  max_amount numeric(36,18) NOT NULL DEFAULT 999999999999999999.0,
  auto_approve boolean NOT NULL DEFAULT false,
  requires_manual_approval boolean NOT NULL DEFAULT false,
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  conditions jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4) 手動承認キュー
CREATE TABLE IF NOT EXISTS public.manual_approval_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL REFERENCES public.deposits(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','rejected')),
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 5) ユーザー資産のアップサートRPC
CREATE OR REPLACE FUNCTION public.upsert_user_asset(
  p_user_id uuid,
  p_currency text,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_assets (user_id, currency, balance, locked_balance)
  VALUES (p_user_id, p_currency, p_amount, 0)
  ON CONFLICT (user_id, currency) DO UPDATE
  SET balance = public.user_assets.balance + EXCLUDED.balance,
      updated_at = now();
END;
$$;

-- 6) 便利インデックス
CREATE INDEX IF NOT EXISTS idx_manual_approval_queue_status ON public.manual_approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_deposit_confirmation_configs_enabled ON public.deposit_confirmation_configs(enabled);

