# Supabase Cron Job Setup

## Setting up the Notification Processing Cron Job

### Option 1: Via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to "Database" > "Extensions"
3. Enable `pg_cron` extension if not already enabled
4. Navigate to "SQL Editor"
5. Run the following SQL to create the cron job:

```sql
-- Schedule the cron job to run every 5 minutes
SELECT cron.schedule(
    'process-pending-notifications',
    '*/5 * * * *',
    $$
    SELECT
        net.http_post(
            url := '<YOUR_SUPABASE_URL>/functions/v1/process-notifications-cron',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
            ),
            body := jsonb_build_object('trigger', 'cron')
        ) AS request_id;
    $$
);
```

### Option 2: Via Supabase CLI

```bash
# First, ensure pg_cron is enabled
supabase db push

# Then create the cron job via SQL
supabase db execute --sql "
SELECT cron.schedule(
    'process-pending-notifications',
    '*/5 * * * *',
    \$\$
    SELECT
        net.http_post(
            url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-notifications-cron',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
            ),
            body := jsonb_build_object('trigger', 'cron')
        ) AS request_id;
    \$\$
);
"
```

## Monitoring the Cron Job

### View scheduled jobs:
```sql
SELECT * FROM cron.job WHERE jobname = 'process-pending-notifications';
```

### View recent job runs:
```sql
SELECT 
    runid,
    job_pid,
    status,
    return_message,
    start_time,
    end_time,
    end_time - start_time as duration
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-pending-notifications')
ORDER BY start_time DESC
LIMIT 10;
```

### Check notification processing stats:
```sql
SELECT * FROM get_notification_stats();
SELECT * FROM get_retry_stats();
```

## Managing the Cron Job

### Disable temporarily:
```sql
UPDATE cron.job SET active = false WHERE jobname = 'process-pending-notifications';
```

### Re-enable:
```sql
UPDATE cron.job SET active = true WHERE jobname = 'process-pending-notifications';
```

### Delete the job:
```sql
SELECT cron.unschedule('process-pending-notifications');
```

### Modify schedule (e.g., to run every 10 minutes):
```sql
UPDATE cron.job 
SET schedule = '*/10 * * * *' 
WHERE jobname = 'process-pending-notifications';
```

## Alternative: Using Supabase Scheduled Functions

If pg_cron is not available, you can use Supabase's scheduled functions feature:

1. Deploy the Edge Functions:
```bash
supabase functions deploy process-notifications-cron
```

2. Create a scheduled trigger in the Dashboard:
   - Go to "Edge Functions"
   - Select `process-notifications-cron`
   - Click "Schedule"
   - Set schedule to "Every 5 minutes"
   - Save

## Testing the Cron Job

To manually trigger the cron job for testing:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-notifications-cron \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"trigger": "manual"}'
```

## Monitoring Alerts

Consider setting up alerts for:
- More than 100 pending notifications
- Any notifications with retry_count >= 3
- Cron job failures

You can create these alerts using Supabase's webhook feature or integrate with monitoring services.