-- Create the cron job for processing notifications
-- This will run every 5 minutes

-- pg_cron extension is already enabled in 001_schema.sql

-- Remove any existing job with the same name
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-pending-notifications') THEN
        PERFORM cron.unschedule('process-pending-notifications');
    END IF;
END $$;

-- Direct database function to process notifications
CREATE OR REPLACE FUNCTION process_pending_notifications_direct()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Process all pending notifications
    UPDATE notifications_raw
    SET 
        status = 'processing',
        processed_at = NOW()
    WHERE 
        status = 'pending'
        AND received_at > NOW() - INTERVAL '24 hours';
        
    -- Log the processing attempt
    INSERT INTO apple_api_logs (
        endpoint,
        method,
        request_body,
        response_status,
        created_at
    ) VALUES (
        'cron_job',
        'INTERNAL',
        jsonb_build_object(
            'message', 'Cron job executed',
            'time', NOW()
        ),
        200,
        NOW()
    );
END;
$$;

-- Comment for documentation
COMMENT ON FUNCTION process_pending_notifications_direct() IS 
'Backup function to process pending notifications if Edge Function approach fails';

-- Create a simple cron job that marks notifications for processing
-- The actual processing will be done by the Edge Function when called externally
SELECT cron.schedule(
    'process-pending-notifications',
    '*/5 * * * *', -- Every 5 minutes
    $$
    UPDATE notifications_raw
    SET status = 'ready_to_process'
    WHERE status = 'pending'
    AND received_at > NOW() - INTERVAL '24 hours'
    $$
);

-- Note: The actual processing should be triggered by calling the Edge Function
-- either through an external cron service or manually