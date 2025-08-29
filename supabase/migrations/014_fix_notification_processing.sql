-- Fix notification processing issues and remove ready_to_process logic

-- 1. Delete the obsolete batch processing function
DROP FUNCTION IF EXISTS process_notifications_batch();

-- 2. Allow original_transaction_id to be NULL for initial purchases
ALTER TABLE transactions 
ALTER COLUMN original_transaction_id DROP NOT NULL;

COMMENT ON COLUMN transactions.original_transaction_id IS 
'Original transaction ID. For initial purchases, this field may be NULL or same as transaction_id. For renewals, this points to the initial purchase transaction ID.';

-- 3. Add column for decoded transaction info
ALTER TABLE notifications_raw 
ADD COLUMN IF NOT EXISTS decoded_transaction_info JSONB;

COMMENT ON COLUMN notifications_raw.decoded_transaction_info IS 
'Decoded transaction information extracted from signedTransactionInfo JWT';

-- 4. Ensure status field only allows correct values (remove ready_to_process)
ALTER TABLE notifications_raw 
DROP CONSTRAINT IF EXISTS notifications_raw_status_check;

ALTER TABLE notifications_raw 
ADD CONSTRAINT notifications_raw_status_check 
CHECK (status IN ('pending', 'processed', 'failed'));

-- 5. Create JWT decoding function
CREATE OR REPLACE FUNCTION decode_jwt_payload(jwt_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    parts TEXT[];
    payload_base64 TEXT;
    payload_text TEXT;
BEGIN
    -- Split JWT (header.payload.signature)
    parts := string_to_array(jwt_token, '.');
    
    -- Check if we have 3 parts
    IF array_length(parts, 1) != 3 THEN
        RETURN NULL;
    END IF;
    
    -- Get payload part (second part)
    payload_base64 := parts[2];
    
    -- Add padding if needed
    WHILE length(payload_base64) % 4 != 0 LOOP
        payload_base64 := payload_base64 || '=';
    END LOOP;
    
    -- Decode and convert to JSON
    payload_text := convert_from(decode(payload_base64, 'base64'), 'UTF8');
    
    RETURN payload_text::JSONB;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- 6. Update cron job to directly call Edge Function
-- First unschedule any existing job
SELECT cron.unschedule('process-pending-notifications');

-- Create new cron job that calls the Edge Function directly
-- Note: You'll need to update the URL and Authorization token for your environment
DO $$
DECLARE
    v_project_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Get the project URL from environment or use placeholder
    v_project_url := current_setting('app.settings.supabase_url', true);
    IF v_project_url IS NULL THEN
        v_project_url := 'YOUR_SUPABASE_PROJECT_URL';
    END IF;
    
    -- Get the service role key from environment or use placeholder
    v_service_key := current_setting('app.settings.service_role_key', true);
    IF v_service_key IS NULL THEN
        v_service_key := 'YOUR_SERVICE_ROLE_KEY';
    END IF;
    
    -- Schedule the cron job
    PERFORM cron.schedule(
        'process-pending-notifications',
        '*/5 * * * *',
        format(
            $CRON$
            SELECT
                net.http_post(
                    url := '%s/functions/v1/process-notifications',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer %s'
                    ),
                    body := jsonb_build_object(
                        'trigger', 'cron',
                        'limit', 50
                    )
                ) AS request_id;
            $CRON$,
            v_project_url,
            v_service_key
        )
    );
END $$;

-- 7. Clean up any existing ready_to_process records
UPDATE notifications_raw 
SET status = 'pending'
WHERE status = 'ready_to_process';