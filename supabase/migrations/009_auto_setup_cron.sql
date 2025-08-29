-- Automatic cron job setup
-- This migration creates a simple cron job that processes notifications directly in the database

-- Enable required extensions (safely)
DO $$
BEGIN
    -- Check and create pg_cron extension
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        CREATE EXTENSION pg_cron;
    END IF;
    
    -- Check and create pg_net extension (optional, for HTTP calls)
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        CREATE EXTENSION pg_net;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Extensions may already exist: %', SQLERRM;
END $$;

-- Grant necessary permissions (safely)
DO $$
BEGIN
    -- Only grant if schema exists
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
        GRANT USAGE ON SCHEMA cron TO postgres;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Permissions may already exist: %', SQLERRM;
END $$;

-- Function to process notifications directly in database
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
        retry_count = COALESCE(retry_count, 0) + 1
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

-- Remove any existing cron jobs with the same names
DO $$
BEGIN
    -- Remove main job if exists
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-pending-notifications') THEN
        PERFORM cron.unschedule('process-pending-notifications');
        RAISE NOTICE 'Removed existing cron job: process-pending-notifications';
    END IF;
END $$;

-- Create the main cron job
-- This job runs every 5 minutes and processes pending notifications
DO $$
DECLARE
    v_job_id bigint;
BEGIN
    -- Create the cron job
    SELECT cron.schedule(
        'process-pending-notifications',  -- job name
        '*/5 * * * *',                    -- every 5 minutes
        'SELECT process_notifications_batch();'  -- command to run
    ) INTO v_job_id;
    
    IF v_job_id IS NOT NULL THEN
        RAISE NOTICE 'Successfully created cron job with ID: %', v_job_id;
        
        -- Log successful creation
        INSERT INTO apple_api_logs (
            endpoint,
            method,
            request_body,
            response_status,
            created_at
        ) VALUES (
            'cron_setup',
            'INTERNAL',
            jsonb_build_object(
                'message', 'Cron job created successfully',
                'job_id', v_job_id,
                'schedule', '*/5 * * * *',
                'time', NOW()
            ),
            200,
            NOW()
        );
    ELSE
        RAISE WARNING 'Failed to create cron job';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error creating cron job: %', SQLERRM;
        
        -- Log the error
        INSERT INTO apple_api_logs (
            endpoint,
            method,
            request_body,
            response_status,
            response_body,
            created_at
        ) VALUES (
            'cron_setup',
            'INTERNAL',
            jsonb_build_object(
                'message', 'Failed to create cron job',
                'time', NOW()
            ),
            500,
            jsonb_build_object('error', SQLERRM),
            NOW()
        );
END $$;

-- Create a monitoring view for the cron job
CREATE OR REPLACE VIEW cron_job_monitor AS
SELECT 
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    j.username,
    j.database,
    j.command,
    (SELECT COUNT(*) 
     FROM cron.job_run_details d 
     WHERE d.jobid = j.jobid 
     AND d.start_time > NOW() - INTERVAL '24 hours') as runs_last_24h,
    (SELECT MAX(end_time) 
     FROM cron.job_run_details d 
     WHERE d.jobid = j.jobid) as last_run,
    (SELECT status 
     FROM cron.job_run_details d 
     WHERE d.jobid = j.jobid 
     ORDER BY start_time DESC 
     LIMIT 1) as last_status
FROM cron.job j
WHERE j.jobname = 'process-pending-notifications';

-- Add helpful comments
COMMENT ON FUNCTION process_notifications_batch() IS 
'Processes pending and failed notifications in batches. Called by cron job every 5 minutes. Failed notifications are retried up to 3 times.';

COMMENT ON VIEW cron_job_monitor IS 
'Monitor the status and history of notification processing cron jobs.';

-- Final verification
DO $$
DECLARE
    v_job_count integer;
    v_job_names text;
BEGIN
    -- Count active cron jobs
    SELECT COUNT(*), string_agg(jobname, ', ')
    FROM cron.job 
    WHERE jobname = 'process-pending-notifications'
    AND active = true
    INTO v_job_count, v_job_names;
    
    IF v_job_count > 0 THEN
        RAISE NOTICE 'Successfully configured % cron job(s): %', v_job_count, v_job_names;
    ELSE
        RAISE WARNING 'No cron jobs were created. Manual setup may be required.';
        RAISE WARNING 'You can manually create the job by running:';
        RAISE WARNING 'SELECT cron.schedule(''process-pending-notifications'', ''*/5 * * * *'', ''SELECT process_notifications_batch();'');';
    END IF;
END $$;