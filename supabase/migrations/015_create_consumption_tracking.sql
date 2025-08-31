-- Create consumption_request_webhooks table for storing raw webhook data
CREATE TABLE IF NOT EXISTS consumption_request_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumption_request_id UUID REFERENCES consumption_requests(id) ON DELETE CASCADE,
  request_id TEXT,
  notification_uuid TEXT,
  source_ip TEXT,
  raw_body TEXT,
  parsed_body JSONB,
  decoded_transaction_info JSONB,
  product_id TEXT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_consumption_request_webhooks_request_id 
  ON consumption_request_webhooks(consumption_request_id);
CREATE INDEX IF NOT EXISTS idx_consumption_request_webhooks_notification_uuid 
  ON consumption_request_webhooks(notification_uuid);

-- Add response_status_code to send_consumption_jobs if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_consumption_jobs' 
    AND column_name = 'response_status_code'
  ) THEN
    ALTER TABLE send_consumption_jobs 
    ADD COLUMN response_status_code INTEGER;
  END IF;
END $$;

-- Create or replace the get_lifetime_dollars_enum function
CREATE OR REPLACE FUNCTION get_lifetime_dollars_enum(amount numeric)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  IF amount IS NULL OR amount = 0 THEN
    RETURN 1; -- 0 USD
  ELSIF amount < 50 THEN
    RETURN 2; -- 0.01-49.99 USD
  ELSIF amount < 100 THEN
    RETURN 3; -- 50-99.99 USD
  ELSIF amount < 500 THEN
    RETURN 4; -- 100-499.99 USD
  ELSIF amount < 1000 THEN
    RETURN 5; -- 500-999.99 USD
  ELSIF amount < 2000 THEN
    RETURN 6; -- 1000-1999.99 USD
  ELSE
    RETURN 7; -- Over 2000 USD
  END IF;
END;
$$;

-- Create or replace calculate_consumption_data function with correct platform value
CREATE OR REPLACE FUNCTION calculate_consumption_data(p_original_transaction_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
  v_customer_consented boolean := true;
  v_consumption_status integer := 0;
  v_platform integer := 1; -- 1 for Apple platform (iOS purchases are from Apple)
  v_sample_content_provided boolean := false;
  v_delivery_status integer := 0;
  v_app_account_token text;
  v_lifetime_dollars_purchased numeric := 0;
  v_lifetime_dollars_refunded numeric := 0;
  v_user_status integer := 0;
  v_account_tenure integer := 0;
  v_play_time_minutes integer := 0;
  v_play_time integer := 0;  -- Default to 0 (undeclared)
  v_refund_preference integer := 0; -- 0 = undeclared
BEGIN
  -- Get app_account_token from transaction
  SELECT app_account_token INTO v_app_account_token
  FROM transactions 
  WHERE original_transaction_id = p_original_transaction_id
  LIMIT 1;
  
  -- If app_account_token is null, set it to empty string for Apple API
  IF v_app_account_token IS NULL THEN
    v_app_account_token := '';
  END IF;

  -- Calculate lifetime dollars purchased
  SELECT COALESCE(SUM(price), 0) INTO v_lifetime_dollars_purchased
  FROM transactions 
  WHERE original_transaction_id = p_original_transaction_id;

  -- Calculate lifetime dollars refunded
  SELECT COALESCE(SUM(refund_amount), 0) INTO v_lifetime_dollars_refunded
  FROM refunds 
  WHERE original_transaction_id = p_original_transaction_id;

  -- Don't calculate play time - just keep it as 0 (undeclared)
  -- This avoids providing potentially inaccurate play time data
  v_play_time := 0;
  
  -- Build result JSON
  v_result := jsonb_build_object(
    'customerConsented', v_customer_consented,
    'consumptionStatus', v_consumption_status,
    'platform', v_platform,
    'sampleContentProvided', v_sample_content_provided,
    'deliveryStatus', v_delivery_status,
    'appAccountToken', v_app_account_token,
    'lifetimeDollarsPurchased', get_lifetime_dollars_enum(v_lifetime_dollars_purchased),
    'lifetimeDollarsRefunded', get_lifetime_dollars_enum(v_lifetime_dollars_refunded),
    'userStatus', v_user_status,
    'accountTenure', v_account_tenure,
    'playTime', v_play_time,
    'refundPreference', v_refund_preference
  );
  
  RETURN v_result;
END;
$$;

-- Create consumption_request_details view
CREATE OR REPLACE VIEW consumption_request_details AS
SELECT 
  cr.id AS request_id,
  cr.original_transaction_id,
  cr.consumption_request_reason,
  cr.request_date,
  cr.deadline,
  cr.status AS request_status,
  cr.environment,
  cr.created_at AS request_created_at,
  cr.updated_at AS request_updated_at,
  
  -- Job information
  scj.id AS job_id,
  scj.status AS job_status,
  scj.consumption_data,
  scj.scheduled_at,
  scj.sent_at,
  scj.error_message,
  scj.retry_count,
  scj.response_status_code,
  scj.created_at AS job_created_at,
  
  -- Webhook information
  crw.notification_uuid,
  crw.raw_body AS webhook_raw_body,
  crw.parsed_body AS webhook_parsed_body,
  crw.source_ip,
  crw.decoded_transaction_info,
  crw.product_id,
  crw.transaction_id,
  
  -- Transaction information
  t.product_id AS transaction_product_id,
  t.product_type,
  t.price,
  t.currency,
  t.purchase_date,
  t.expiration_date,
  
  -- Calculated fields
  CASE 
    WHEN scj.sent_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (scj.sent_at - cr.created_at)) * 1000
    ELSE NULL
  END AS response_time_ms,
  
  -- Apple response status based on response_status_code or fallback logic
  CASE
    -- First check response_status_code if available
    WHEN scj.response_status_code IS NOT NULL THEN
      CASE 
        WHEN scj.response_status_code = 200 THEN 'Success (200)'
        WHEN scj.response_status_code = 202 THEN 'Accepted (202)'
        WHEN scj.response_status_code = 400 THEN 'Bad Request (400)'
        WHEN scj.response_status_code = 401 THEN 'Unauthorized (401)'
        WHEN scj.response_status_code = 403 THEN 'Forbidden (403)'
        WHEN scj.response_status_code = 404 THEN 'Not Found (404)'
        WHEN scj.response_status_code = 429 THEN 'Too Many Requests (429)'
        WHEN scj.response_status_code = 500 THEN 'Server Error (500)'
        WHEN scj.response_status_code = 503 THEN 'Service Unavailable (503)'
        ELSE 'HTTP ' || scj.response_status_code::text
      END
    -- Fallback to status-based logic
    WHEN scj.status = 'sent' THEN 'Success (200)'
    WHEN scj.status = 'failed' AND scj.error_message IS NOT NULL THEN
      CASE
        WHEN scj.error_message LIKE '%400%' THEN 'Bad Request (400)'
        WHEN scj.error_message LIKE '%401%' THEN 'Unauthorized (401)'
        WHEN scj.error_message LIKE '%403%' THEN 'Forbidden (403)'
        WHEN scj.error_message LIKE '%404%' THEN 'Not Found (404)'
        WHEN scj.error_message LIKE '%429%' THEN 'Too Many Requests (429)'
        WHEN scj.error_message LIKE '%500%' THEN 'Server Error (500)'
        WHEN scj.error_message LIKE '%503%' THEN 'Service Unavailable (503)'
        ELSE 'Failed'
      END
    WHEN scj.status = 'pending' THEN 'Pending'
    ELSE 'Unknown'
  END AS apple_response_status
  
FROM consumption_requests cr
LEFT JOIN send_consumption_jobs scj ON scj.consumption_request_id = cr.id
LEFT JOIN consumption_request_webhooks crw ON crw.consumption_request_id = cr.id
LEFT JOIN transactions t ON t.original_transaction_id = cr.original_transaction_id
ORDER BY cr.created_at DESC;

-- Create or replace consumption_metrics_summary function with environment support
CREATE OR REPLACE FUNCTION consumption_metrics_summary(p_environment text DEFAULT NULL)
RETURNS TABLE (
  total_requests bigint,
  sent_requests bigint,
  pending_requests bigint,
  failed_requests bigint,
  success_rate numeric,
  avg_response_time_ms numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint AS total_requests,
    COUNT(CASE WHEN cr.status = 'sent' THEN 1 END)::bigint AS sent_requests,
    COUNT(CASE WHEN cr.status = 'pending' THEN 1 END)::bigint AS pending_requests,
    COUNT(CASE WHEN cr.status = 'failed' THEN 1 END)::bigint AS failed_requests,
    
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(CASE WHEN cr.status = 'sent' THEN 1 END)::numeric / COUNT(*)::numeric * 100), 2)
      ELSE 0
    END AS success_rate,
    
    ROUND(AVG(
      CASE 
        WHEN scj.sent_at IS NOT NULL THEN 
          EXTRACT(EPOCH FROM (scj.sent_at - cr.created_at)) * 1000
        ELSE NULL
      END
    ), 2) AS avg_response_time_ms
    
  FROM consumption_requests cr
  LEFT JOIN send_consumption_jobs scj ON scj.consumption_request_id = cr.id
  WHERE p_environment IS NULL OR cr.environment = p_environment;
END;
$$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_consumption_requests_environment 
  ON consumption_requests(environment);
CREATE INDEX IF NOT EXISTS idx_consumption_requests_status 
  ON consumption_requests(status);
CREATE INDEX IF NOT EXISTS idx_send_consumption_jobs_status 
  ON send_consumption_jobs(status);
CREATE INDEX IF NOT EXISTS idx_send_consumption_jobs_consumption_request_id 
  ON send_consumption_jobs(consumption_request_id);