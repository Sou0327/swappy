-- Create webhook_errors table for tracking webhook processing errors
-- This table stores errors that occur during webhook processing for monitoring and debugging

CREATE TABLE IF NOT EXISTS webhook_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subscription information
  subscription_id TEXT, -- Tatum subscription ID (nullable for non-subscription errors)
  address TEXT NOT NULL, -- Address that triggered the webhook
  chain TEXT NOT NULL, -- Chain identifier (evm, btc, xrp, etc.)
  network TEXT NOT NULL, -- Network identifier (ethereum, sepolia, mainnet, testnet, etc.)

  -- Error details
  error_message TEXT NOT NULL, -- Error message description
  error_type TEXT DEFAULT 'webhook_processing', -- Error category
  error_code TEXT, -- Optional error code

  -- Request context
  webhook_payload JSONB, -- Original webhook payload (optional, for debugging)
  request_headers JSONB, -- Request headers (optional, for debugging)
  response_status INTEGER, -- HTTP response status

  -- Processing context
  processing_attempt INTEGER DEFAULT 1, -- Number of processing attempts
  retry_after TIMESTAMPTZ, -- When to retry (for retryable errors)

  -- Resolution tracking
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_webhook_errors_address ON webhook_errors(address);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_chain_network ON webhook_errors(chain, network);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_resolved ON webhook_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_created_at ON webhook_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_subscription_id ON webhook_errors(subscription_id);

-- RLS (Row Level Security) policies
ALTER TABLE webhook_errors ENABLE ROW LEVEL SECURITY;

-- Admin and moderator can view all webhook errors
CREATE POLICY "Admin users can view all webhook errors" ON webhook_errors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- Admin can update webhook errors (for resolution tracking)
CREATE POLICY "Admin users can update webhook errors" ON webhook_errors
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );

-- System can insert webhook errors (service role)
CREATE POLICY "System can insert webhook errors" ON webhook_errors
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_errors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at updates
DROP TRIGGER IF EXISTS webhook_errors_updated_at_trigger ON webhook_errors;
CREATE TRIGGER webhook_errors_updated_at_trigger
  BEFORE UPDATE ON webhook_errors
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_errors_updated_at();

-- Create a view for admin dashboard with additional metrics
CREATE OR REPLACE VIEW webhook_errors_summary AS
SELECT
  DATE_TRUNC('day', created_at) as error_date,
  chain,
  network,
  error_type,
  COUNT(*) as error_count,
  COUNT(*) FILTER (WHERE resolved = false) as unresolved_count,
  COUNT(*) FILTER (WHERE resolved = true) as resolved_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved = true) as avg_resolution_time_seconds
FROM webhook_errors
GROUP BY DATE_TRUNC('day', created_at), chain, network, error_type
ORDER BY error_date DESC, error_count DESC;

-- Grant access to the summary view for admin users
GRANT SELECT ON webhook_errors_summary TO authenticated;

-- Add comment explaining the table purpose
COMMENT ON TABLE webhook_errors IS 'Stores webhook processing errors for monitoring and debugging Tatum webhook integration';
COMMENT ON COLUMN webhook_errors.subscription_id IS 'Tatum subscription ID that generated the webhook (nullable for general errors)';
COMMENT ON COLUMN webhook_errors.address IS 'Cryptocurrency address that triggered the webhook';
COMMENT ON COLUMN webhook_errors.chain IS 'Blockchain identifier (evm, btc, xrp, tron, ada)';
COMMENT ON COLUMN webhook_errors.network IS 'Network identifier (ethereum, sepolia, mainnet, testnet, etc.)';
COMMENT ON COLUMN webhook_errors.error_message IS 'Human-readable error description';
COMMENT ON COLUMN webhook_errors.error_type IS 'Error category for grouping and analysis';
COMMENT ON COLUMN webhook_errors.webhook_payload IS 'Original webhook payload for debugging (optional)';
COMMENT ON COLUMN webhook_errors.processing_attempt IS 'Number of times processing was attempted';
COMMENT ON COLUMN webhook_errors.resolved IS 'Whether the error has been resolved';
COMMENT ON COLUMN webhook_errors.resolution_notes IS 'Notes about how the error was resolved';
COMMENT ON VIEW webhook_errors_summary IS 'Aggregated webhook error statistics for admin dashboard';