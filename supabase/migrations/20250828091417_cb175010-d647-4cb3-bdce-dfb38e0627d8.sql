-- Insert sample user assets for testing asset modification functionality
-- First, let's get some existing user IDs from the profiles table
INSERT INTO user_assets (user_id, currency, balance, locked_balance) 
SELECT 
    p.id as user_id,
    'USD' as currency,
    1000.00 as balance,
    100.00 as locked_balance
FROM profiles p
LIMIT 3;

-- Add some crypto assets as well
INSERT INTO user_assets (user_id, currency, balance, locked_balance) 
SELECT 
    p.id as user_id,
    'BTC' as currency,
    0.50000000 as balance,
    0.05000000 as locked_balance
FROM profiles p
LIMIT 2;

-- Add ETH assets
INSERT INTO user_assets (user_id, currency, balance, locked_balance) 
SELECT 
    p.id as user_id,
    'ETH' as currency,
    5.25000000 as balance,
    0.25000000 as locked_balance
FROM profiles p
LIMIT 2;