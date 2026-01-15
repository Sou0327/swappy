-- Atomic balance update to avoid race conditions
CREATE OR REPLACE FUNCTION update_user_balance_atomic(
  p_user_id UUID,
  p_currency TEXT,
  p_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
  INSERT INTO user_assets (user_id, currency, balance)
  VALUES (p_user_id, p_currency, p_amount)
  ON CONFLICT (user_id, currency)
  DO UPDATE SET 
    balance = user_assets.balance + p_amount,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Note: deduct_user_balance_atomic was removed as part of self-custody migration
-- In self-custody model, users sign transactions client-side, so server-side
-- balance deduction is not applicable for withdrawals
