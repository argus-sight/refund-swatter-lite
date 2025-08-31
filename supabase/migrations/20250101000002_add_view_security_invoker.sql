-- Add SECURITY INVOKER to all views
-- This ensures views enforce Row Level Security policies of underlying tables

-- 1. Drop and recreate consumption_request_details with SECURITY INVOKER
DROP VIEW IF EXISTS public.consumption_request_details;

CREATE VIEW public.consumption_request_details
WITH (security_invoker = true)
AS
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
  
  -- Apple response status interpretation
  CASE
    WHEN scj.response_status_code IS NOT NULL THEN
      CASE scj.response_status_code
        WHEN 200 THEN 'Success (200)'
        WHEN 202 THEN 'Accepted (202)'
        WHEN 400 THEN 'Bad Request (400)'
        WHEN 401 THEN 'Unauthorized (401)'
        WHEN 403 THEN 'Forbidden (403)'
        WHEN 404 THEN 'Not Found (404)'
        WHEN 429 THEN 'Too Many Requests (429)'
        WHEN 500 THEN 'Server Error (500)'
        WHEN 503 THEN 'Service Unavailable (503)'
        ELSE 'HTTP ' || scj.response_status_code::text
      END
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

-- 2. Drop and recreate cron_job_status with SECURITY INVOKER
DROP VIEW IF EXISTS public.cron_job_status;

CREATE VIEW public.cron_job_status
WITH (security_invoker = true)
AS
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

-- 3. Drop and recreate recent_cron_runs with SECURITY INVOKER
DROP VIEW IF EXISTS public.recent_cron_runs;

CREATE VIEW public.recent_cron_runs
WITH (security_invoker = true)
AS
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

-- 4. Drop and recreate cron_job_monitor with SECURITY INVOKER
DROP VIEW IF EXISTS public.cron_job_monitor;

CREATE VIEW public.cron_job_monitor
WITH (security_invoker = true)
AS
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
WHERE jobname IN ('process-pending-notifications', 'process-notifications-fallback');

-- Grant permissions on views
GRANT SELECT ON public.consumption_request_details TO authenticated;
GRANT SELECT ON public.cron_job_status TO authenticated;
GRANT SELECT ON public.recent_cron_runs TO authenticated;
GRANT SELECT ON public.cron_job_monitor TO authenticated;