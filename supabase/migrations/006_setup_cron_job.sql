-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Note: The cron job will be created by setup.sh with actual environment values
-- This is a placeholder to show the structure
-- DO NOT run this migration directly, it will be handled by the setup script

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