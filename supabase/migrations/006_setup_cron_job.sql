-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create a cron job to process pending notifications every 5 minutes
-- This calls the process-notifications-cron Edge Function
SELECT cron.schedule(
    'process-pending-notifications', -- Job name
    '*/5 * * * *', -- Every 5 minutes
    $$
    SELECT
        net.http_post(
            url := current_setting('app.settings.supabase_url') || '/functions/v1/process-notifications-cron',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
            ),
            body := jsonb_build_object('trigger', 'cron')
        ) AS request_id;
    $$
);

-- Optional: Add a comment to document the job
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';

-- Create a view to monitor cron job status
CREATE OR REPLACE VIEW cron_job_status AS
SELECT 
    jobid,
    jobname,
    schedule,
    active,
    username,
    database,
    command
FROM cron.job
WHERE jobname = 'process-pending-notifications';

-- Create a view to see recent cron job runs
CREATE OR REPLACE VIEW recent_cron_runs AS
SELECT 
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time,
    end_time - start_time as duration
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-pending-notifications')
ORDER BY start_time DESC
LIMIT 20;

-- Note: To manually trigger the cron job, you can use:
-- SELECT cron.unschedule('process-pending-notifications');
-- Then re-schedule it, or call the function directly

-- To disable the cron job temporarily:
-- UPDATE cron.job SET active = false WHERE jobname = 'process-pending-notifications';

-- To re-enable:
-- UPDATE cron.job SET active = true WHERE jobname = 'process-pending-notifications';