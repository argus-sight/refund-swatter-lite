# Deployment Guide

## Prerequisites

1. **Supabase Account**: Create a project at [supabase.com](https://supabase.com)
2. **Supabase CLI**: Install the CLI tool
   ```bash
   # macOS
   brew install supabase/tap/supabase
   
   # npm
   npm install -g supabase
   ```
3. **Node.js**: Version 16 or higher
4. **Apple Developer Account**: With App Store Server API access

## Configuration Steps

### 1. Supabase Project Setup

#### Get your project reference
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to Settings → General
4. Copy the "Reference ID" (format: `abcdefghijklmnop`)

#### Enable required extensions
In your Supabase Dashboard, go to Database → Extensions and enable:
- `pg_cron` - For scheduled jobs
- `vault` - For secure key storage
- `pg_net` - For HTTP calls (optional)

### 2. Project Configuration

#### Option A: Using Supabase CLI (Recommended)
```bash
# This will update supabase/config.toml automatically
supabase link --project-ref your-project-ref
```

#### Option B: Manual Configuration
1. Edit `supabase/config.toml`:
   ```toml
   project_id = "your-project-ref"
   ```

2. Create `.env` file from template:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

   Find these values in Supabase Dashboard → Settings → API

### 3. Deploy the Application

Run the one-click deployment script:
```bash
./setup.sh
```

**Note**: You'll need your database password during deployment. Find it in:
- Supabase Dashboard → Settings → Database → Database Password
- Or reset it if you don't remember it

This script will:
1. Apply all database migrations
2. Deploy all Edge Functions
3. Configure cron jobs automatically
4. Optionally initialize sample data
5. Setup local web development (optional)

### 4. Configure Apple Credentials

In Supabase Dashboard → Settings → Edge Functions → Environment Variables, add:
- `APPLE_PRIVATE_KEY`: Your .p8 file content
- `APPLE_KEY_ID`: Your key identifier
- `APPLE_ISSUER_ID`: Your issuer ID
- `APPLE_BUNDLE_ID`: Your app's bundle ID

### 5. Setup Apple Webhooks

In App Store Connect:
1. Go to Apps → Your App → App Store Server Notifications
2. Set the URL: `https://your-project-ref.supabase.co/functions/v1/webhook`
3. Enable notification types (especially CONSUMPTION_REQUEST)

## Verification

### Check Cron Jobs
1. Go to Supabase Dashboard → Integrations → Cron
2. You should see `process-pending-notifications` running every 5 minutes

### Check Edge Functions
1. Go to Supabase Dashboard → Edge Functions
2. All 8 functions should be deployed and active

### Test the Setup
```bash
# Test webhook endpoint
curl -X POST https://your-project-ref.supabase.co/functions/v1/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check function logs
supabase functions logs webhook
```

## Troubleshooting

### Database Migration Errors
- Ensure extensions are enabled in Dashboard before running migrations
- Check that you're using the correct project reference

### Cron Job Not Showing
- The cron job is created automatically during migration
- If not visible, run this in SQL Editor:
  ```sql
  SELECT * FROM cron.job WHERE jobname = 'process-pending-notifications';
  ```

### Edge Function Deployment Fails
- Check that your Supabase CLI is up to date
- Verify your access token is valid
- Try deploying functions individually:
  ```bash
  supabase functions deploy webhook --no-verify-jwt
  ```

### Connection Errors
- Verify project_id in `supabase/config.toml` matches your project
- Ensure database password is correct
- Check network connectivity to Supabase

## Production Deployment

### Web Dashboard
Deploy the web dashboard to Vercel:
1. Push code to GitHub
2. Import project in Vercel
3. Set environment variables from `.env`
4. Deploy

### Monitoring
- **Logs**: Supabase Dashboard → Logs → Edge Functions
- **Metrics**: Supabase Dashboard → Reports
- **Cron History**: Query `cron.job_run_details` table

## Security Notes

1. **Never commit `.env` files** to version control
2. **Use different keys** for development and production
3. **Rotate keys regularly** through Supabase Dashboard
4. **Monitor API logs** for suspicious activity
5. **Set up alerts** for failed cron jobs or high error rates