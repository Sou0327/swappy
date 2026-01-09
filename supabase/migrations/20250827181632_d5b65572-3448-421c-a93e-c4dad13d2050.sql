-- Create deposits table
CREATE TABLE public.deposits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  transaction_hash TEXT,
  wallet_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by UUID,
  notes TEXT
);

-- Create withdrawals table
CREATE TABLE public.withdrawals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  wallet_address TEXT NOT NULL,
  transaction_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by UUID,
  notes TEXT
);

-- Create assets table for user balances
CREATE TABLE public.user_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance DECIMAL(20,8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  locked_balance DECIMAL(20,8) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, currency)
);

-- Enable RLS
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for deposits
CREATE POLICY "Users can view their own deposits" ON public.deposits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all deposits" ON public.deposits FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create their own deposits" ON public.deposits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update all deposits" ON public.deposits FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for withdrawals
CREATE POLICY "Users can view their own withdrawals" ON public.withdrawals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all withdrawals" ON public.withdrawals FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create their own withdrawals" ON public.withdrawals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update all withdrawals" ON public.withdrawals FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for user_assets
CREATE POLICY "Users can view their own assets" ON public.user_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all assets" ON public.user_assets FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage all assets" ON public.user_assets FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at on user_assets
CREATE TRIGGER update_user_assets_updated_at
  BEFORE UPDATE ON public.user_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_deposits_user_id ON public.deposits(user_id);
CREATE INDEX idx_deposits_status ON public.deposits(status);
CREATE INDEX idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX idx_user_assets_user_id ON public.user_assets(user_id);