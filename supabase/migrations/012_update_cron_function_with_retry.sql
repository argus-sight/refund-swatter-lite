-- Update process_notifications_batch function to handle both pending and failed notifications with retry logic
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
    
    -- Mark pending and failed notifications as ready to process
    -- Only process notifications that are:
    -- 1. In pending or failed status
    -- 2. Older than 5 minutes (to avoid race conditions)
    -- 3. Within the last 24 hours
    -- 4. Failed notifications with less than 3 retries
    UPDATE notifications_raw
    SET 
        status = 'ready_to_process',
        processed_at = NOW(),
        retry_count = COALESCE(retry_count, 0) + CASE WHEN status = 'failed' THEN 1 ELSE 0 END
    WHERE 
        (status = 'pending' OR (status = 'failed' AND COALESCE(retry_count, 0) < 3))
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

-- Update the comment
COMMENT ON FUNCTION process_notifications_batch() IS 
'Processes pending and failed notifications in batches. Called by cron job every 5 minutes. Failed notifications are retried up to 3 times.';