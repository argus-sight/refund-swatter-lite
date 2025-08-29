-- Manual cron job setup script
-- Run this in Supabase Dashboard SQL Editor

-- 1. First ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 3. Check if job already exists and remove if it does
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-pending-notifications') THEN
        PERFORM cron.unschedule('process-pending-notifications');
        RAISE NOTICE 'Removed existing cron job';
    END IF;
END $$;

-- 4. Create the cron job to run every 5 minutes
SELECT cron.schedule(
    'process-pending-notifications',
    '*/5 * * * *',
    $$
    UPDATE notifications_raw 
    SET status = 'ready_to_process' 
    WHERE status = 'pending' 
    AND received_at < NOW() - INTERVAL '5 minutes'
    AND received_at > NOW() - INTERVAL '24 hours'
    $$
);

-- 5. Verify the job was created
SELECT 
    jobid,
    jobname,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active
FROM cron.job 
WHERE jobname = 'process-pending-notifications';

-- If you see a result, the cron job is successfully created!