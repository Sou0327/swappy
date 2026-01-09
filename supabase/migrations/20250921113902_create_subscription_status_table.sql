-- Create subscription_status table
-- Purpose: Manage Tatum subscription status
-- Features: Prevent duplicate subscriptions and track status

CREATE TABLE IF NOT EXISTS public.subscription_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subscription_id TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL,
    chain TEXT NOT NULL,
    network TEXT NOT NULL,
    asset TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    provider TEXT NOT NULL DEFAULT 'tatum',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for fast duplicate checking
CREATE INDEX IF NOT EXISTS idx_subscription_status_lookup
ON public.subscription_status (address, chain, network, asset, status);

CREATE INDEX IF NOT EXISTS idx_subscription_status_subscription_id
ON public.subscription_status (subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_status_address
ON public.subscription_status (address);

-- Enable Row Level Security
ALTER TABLE public.subscription_status ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and write
CREATE POLICY subscription_status_authenticated_access
ON public.subscription_status
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_subscription_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_subscription_status_updated_at
    BEFORE UPDATE ON public.subscription_status
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_status_updated_at();

-- Add table comments
COMMENT ON TABLE public.subscription_status IS 'Tatum subscription status management table';
COMMENT ON COLUMN public.subscription_status.subscription_id IS 'Tatum API subscription ID';
COMMENT ON COLUMN public.subscription_status.address IS 'Blockchain address';
COMMENT ON COLUMN public.subscription_status.chain IS 'Blockchain type';
COMMENT ON COLUMN public.subscription_status.network IS 'Network name';
COMMENT ON COLUMN public.subscription_status.asset IS 'Asset name';
COMMENT ON COLUMN public.subscription_status.status IS 'Subscription status';
COMMENT ON COLUMN public.subscription_status.provider IS 'API provider name';