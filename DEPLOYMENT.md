# Deployment Guide

## Prerequisites

Before running the setup script, ensure you have:

1. **Supabase Account & Project**
   - Create a new project at https://supabase.com
   - Note down your project credentials:
     - Project URL (format: https://xxxxx.supabase.co)
     - Anon Key (public key for client-side access)
     - Service Role Key (server-side admin key)
   - Optional: Access Token for Supabase CLI

2. **Local Development Tools**
   - Node.js 16+ installed
   - npm or yarn package manager
   - Supabase CLI (`npm install -g supabase`)

3. **Apple Developer Account**
   - App Store Connect access
   - App Store Server API credentials:
     - Issuer ID
     - Key ID
     - Private Key (.p8 file)

## Quick Deployment

### 1. Clone and Configure

```bash
git clone <repository>
cd refund-swatter-lite

# Copy and edit environment file
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ACCESS_TOKEN=your-access-token  # Optional but recommended
```

### 2. Run One-Click Setup

```bash
chmod +x setup.sh
./setup.sh
```

The setup script will:
1. Link to your Supabase project
2. Run all database migrations
3. Deploy all Edge Functions
4. Configure the cron job for automatic processing
5. Generate and set the CRON_SECRET
6. Install web dependencies
7. Build the web application
8. Verify the deployment

### 3. Verify Deployment

After setup completes, you should see:
- ✓ Database migrations applied
- ✓ All 8 Edge Functions deployed
- ✓ Cron job configured

If any component fails, check the error messages and ensure your Supabase credentials are correct.

## Manual Deployment Steps

If the automatic setup fails, you can deploy manually:

### Database Setup

```bash
# Link project
supabase link --project-ref YOUR_PROJECT_ID

# Run migrations
supabase db push
```

### Deploy Edge Functions

```bash
supabase functions deploy webhook --no-verify-jwt
supabase functions deploy send-consumption --no-verify-jwt
supabase functions deploy apple-jwt --no-verify-jwt
supabase functions deploy data-initialization --no-verify-jwt
supabase functions deploy process-jobs --no-verify-jwt
supabase functions deploy apple-notification-history --no-verify-jwt
supabase functions deploy process-notifications --no-verify-jwt
supabase functions deploy process-notifications-cron --no-verify-jwt
```

### Configure Cron Job

In Supabase SQL Editor:
```sql
SELECT cron.schedule(
    'process-pending-notifications',
    '*/5 * * * *',
    format('SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
            ''Content-Type'', ''application/json'',
            ''Authorization'', ''Bearer %s''
        ),
        body := jsonb_build_object(''trigger'', ''cron'')
    ) AS request_id;',
    'YOUR_SUPABASE_URL/functions/v1/process-notifications-cron',
    'YOUR_SERVICE_ROLE_KEY')
);
```

### Web Application

```bash
cd web
npm install
npm run build
npm run dev  # For development
```

## Production Deployment

### Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy

### Apple Configuration

1. In App Store Connect:
   - Navigate to your app
   - Go to "App Store Server Notifications"
   - Set URL: `https://your-project.supabase.co/functions/v1/webhook`
   - Enable CONSUMPTION_REQUEST notifications

2. In the dashboard (http://localhost:3300):
   - Complete the setup wizard
   - Enter your Apple credentials
   - Test the webhook connection

## Troubleshooting

### Database Migrations Failed
- Check Supabase project is active
- Verify service role key has admin permissions
- Run `supabase db reset` and try again

### Edge Functions Not Deploying
- Ensure Supabase CLI is authenticated: `supabase login`
- Check project linking: `supabase projects list`
- Try deploying individually with verbose output

### Cron Job Not Running
- Verify pg_cron extension is enabled
- Check cron job exists: `SELECT * FROM cron.job;`
- View job runs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC;`

### Web Application Issues
- Clear Next.js cache: `rm -rf web/.next`
- Check Node version: `node --version` (should be 16+)
- Verify environment variables are loaded

## Monitoring

### Check System Health

```sql
-- View pending consumption requests
SELECT * FROM consumption_requests 
WHERE status = 'pending' 
ORDER BY deadline;

-- Check cron job status
SELECT * FROM cron_job_status;

-- View recent Edge Function logs
SELECT * FROM apple_api_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

### Edge Function Logs

In Supabase Dashboard:
1. Go to "Edge Functions"
2. Select a function
3. View "Logs" tab

## Security Notes

- Never commit `.env` files to git
- Rotate service role keys periodically
- Use Supabase Vault for storing Apple private keys
- Enable RLS policies for production
- Configure CORS for production domains only