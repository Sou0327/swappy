-- Add Blockfrost support for Cardano integration
-- Purpose: Extend subscription_status table for Blockfrost webhook management
-- Features: Multi-provider support, Cardano chain compatibility

BEGIN;

-- Add Blockfrost-specific columns to subscription_status table
ALTER TABLE public.subscription_status
ADD COLUMN IF NOT EXISTS webhook_id TEXT, -- Blockfrost webhook ID
ADD COLUMN IF NOT EXISTS auth_token TEXT, -- Webhook authentication token
ADD COLUMN IF NOT EXISTS confirmations INTEGER DEFAULT 1; -- Required confirmations

-- Update provider column constraint to include blockfrost
DO $$
BEGIN
    -- Check if constraint exists and update it
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'subscription_status'
        AND tc.constraint_type = 'CHECK'
        AND ccu.column_name = 'provider'
    ) THEN
        ALTER TABLE public.subscription_status
        DROP CONSTRAINT IF EXISTS subscription_status_provider_check;
    END IF;

    -- Add updated constraint
    ALTER TABLE public.subscription_status
    ADD CONSTRAINT subscription_status_provider_check
    CHECK (provider IN ('tatum', 'blockfrost'));
END $$;

-- Create new indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_subscription_status_provider_chain
ON public.subscription_status (provider, chain, network, asset);

CREATE INDEX IF NOT EXISTS idx_subscription_status_webhook_id
ON public.subscription_status (webhook_id) WHERE webhook_id IS NOT NULL;

-- Add comments for new columns
COMMENT ON COLUMN public.subscription_status.webhook_id IS 'Blockfrost webhook ID for Cardano monitoring';
COMMENT ON COLUMN public.subscription_status.auth_token IS 'Authentication token for webhook verification';
COMMENT ON COLUMN public.subscription_status.confirmations IS 'Required confirmations before webhook triggers';

-- Ensure RLS policies work with new provider
DO $$
BEGIN
    -- Check if the policy exists and recreate if needed
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'subscription_status'
        AND policyname = 'subscription_status_authenticated_access'
    ) THEN
        DROP POLICY subscription_status_authenticated_access ON public.subscription_status;
    END IF;

    -- Recreate policy to ensure it works with new columns
    CREATE POLICY subscription_status_authenticated_access
    ON public.subscription_status
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
END $$;

-- Add trigger update for new columns (ensure updated_at is maintained)
CREATE OR REPLACE FUNCTION update_subscription_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_update_subscription_status_updated_at ON public.subscription_status;
CREATE TRIGGER trigger_update_subscription_status_updated_at
    BEFORE UPDATE ON public.subscription_status
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_status_updated_at();

COMMIT;

-- Add table and column documentation
COMMENT ON TABLE public.subscription_status IS 'Multi-provider subscription status management (Tatum + Blockfrost)';