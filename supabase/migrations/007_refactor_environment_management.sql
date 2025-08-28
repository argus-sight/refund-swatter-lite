-- Refactor environment management: move from config to individual tables

-- Add environment column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS environment TEXT;

COMMENT ON COLUMN transactions.environment IS 'Apple environment (sandbox or production) where this transaction occurred';

-- Add environment column to refunds table  
ALTER TABLE refunds
ADD COLUMN IF NOT EXISTS environment TEXT;

COMMENT ON COLUMN refunds.environment IS 'Apple environment (sandbox or production) where this refund occurred';

-- Add environment column to consumption_requests table
ALTER TABLE consumption_requests
ADD COLUMN IF NOT EXISTS environment TEXT;

COMMENT ON COLUMN consumption_requests.environment IS 'Apple environment (sandbox or production) where this request should be sent';

-- Remove environment from config table as it's not a configuration but runtime data
ALTER TABLE config
DROP COLUMN IF EXISTS environment;

-- Update existing data based on notifications_raw environment
-- This assumes existing data is from the environment recorded in notifications_raw

-- Update transactions
UPDATE transactions t
SET environment = nr.environment
FROM notifications_raw nr
WHERE t.original_transaction_id IS NOT NULL
  AND nr.decoded_payload->>'data' IS NOT NULL
  AND nr.decoded_payload->'data'->'signedTransactionInfo' IS NOT NULL
  AND t.environment IS NULL;

-- Update refunds  
UPDATE refunds r
SET environment = nr.environment
FROM notifications_raw nr
WHERE r.original_transaction_id IS NOT NULL
  AND nr.notification_type = 'REFUND'
  AND nr.decoded_payload->>'data' IS NOT NULL
  AND r.environment IS NULL;

-- Update consumption_requests
UPDATE consumption_requests cr
SET environment = nr.environment  
FROM notifications_raw nr
WHERE cr.notification_id = nr.id
  AND cr.environment IS NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_environment ON transactions(environment);
CREATE INDEX IF NOT EXISTS idx_refunds_environment ON refunds(environment);
CREATE INDEX IF NOT EXISTS idx_consumption_requests_environment ON consumption_requests(environment);