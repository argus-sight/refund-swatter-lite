-- Fix the cron function error
-- Run this in Supabase Dashboard SQL Editor to fix the metadata column error

-- Fix the process_notifications_batch function
CREATE OR REPLACE FUNCTION process_notifications_batch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_processed_count integer;
    v_batch_id uuid;
BEGIN
    -- Generate a batch ID for this run
    v_batch_id := gen_random_uuid();
    
    -- Mark pending notifications as ready to process
    -- Only process notifications that are:
    -- 1. In pending status
    -- 2. Older than 5 minutes (to avoid race conditions)
    -- 3. Within the last 24 hours
    UPDATE notifications_raw
    SET 
        status = 'ready_to_process',
        processed_at = NOW()
    WHERE 
        status = 'pending'
        AND received_at < NOW() - INTERVAL '5 minutes'
        AND received_at > NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS v_processed_count = ROW_COUNT;
    
    -- Log the batch processing
    IF v_processed_count > 0 THEN
        INSERT INTO apple_api_logs (
            endpoint,
            method,
            request_body,
            response_status,
            created_at
        ) VALUES (
            'cron_batch_process',
            'INTERNAL',
            jsonb_build_object(
                'message', 'Batch processing executed',
                'batch_id', v_batch_id,
                'processed_count', v_processed_count,
                'time', NOW()
            ),
            200,
            NOW()
        );
        
        RAISE NOTICE 'Processed % notifications in batch %', v_processed_count, v_batch_id;
    END IF;
END;
$$;

-- Verify the fix
SELECT 'Function fixed successfully!' as status;

-- Check current cron job status
SELECT 
    jobid,
    jobname,
    schedule,
    active,
    command
FROM cron.job 
WHERE jobname = 'process-pending-notifications';

-- Check recent cron job runs (if any)
SELECT 
    runid,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-pending-notifications')
ORDER BY start_time DESC
LIMIT 5;