# Setup Guide

## Configuration

### Main Configuration File

All settings are managed through `.env.project`:

```bash
# Required Configuration
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_DB_PASSWORD=your-database-password
APPLE_BUNDLE_ID=com.yourcompany.app

# Optional Configuration
ENVIRONMENT=production
SETUP_CRON=true
```

### Automatic Setup

The `setup-simple.sh` script handles everything:

1. **Database Setup**
   - Enables required extensions (pg_cron, pg_net, vault)
   - Applies all migrations
   - Creates necessary tables and functions

2. **Edge Functions Deployment**
   - webhook - Receives Apple notifications
   - process-notifications-cron - Processes notifications every 5 minutes
   - send-consumption - Sends consumption data to Apple
   - apple-jwt - Generates Apple JWTs
   - Plus additional utility functions

3. **Environment Configuration**
   - Generates CRON_SECRET automatically
   - Creates .env files for web and functions
   - Sets up all required secrets

4. **Cron Job Setup**
   - Configures automatic processing every 5 minutes
   - Sets up retry mechanism for failed jobs

## Manual Setup Steps

If you prefer manual setup:

### 1. Database Migrations
```bash
supabase db push
```

### 2. Deploy Edge Functions
```bash
supabase functions deploy --no-verify-jwt
```

### 3. Set Secrets
```bash
supabase secrets set CRON_SECRET=your-secret-here
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

### 4. Configure Cron Job

In Supabase Dashboard > SQL Editor:
```sql
SELECT cron.schedule(
  'process-notifications-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/process-notifications-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer your-cron-secret',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('scheduled', true)
  ) AS request_id;
  $$
);
```

## Vercel Deployment

### Environment Variables

Required for Vercel deployment:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

### Deploy Command
```bash
vercel --prod
```

## Apple Configuration

### App Store Connect Setup

1. **Generate API Key**
   - Go to Users and Access > Keys
   - Create new key with Admin role
   - Download .p8 file (save it securely)

2. **Configure Webhook**
   - Apps > Your App > App Store Server Notifications
   - Set URL: `https://your-project.supabase.co/functions/v1/webhook`
   - Enable CONSUMPTION_REQUEST notifications

3. **Add Credentials to Dashboard**
   - Open web dashboard
   - Go to Settings
   - Enter Bundle ID, Issuer ID, Key ID
   - Paste private key content

## Testing

### Test Webhook
```bash
curl -X POST http://localhost:3000/api/test-webhook \
  -H "Content-Type: application/json" \
  -d '{"environment": "Sandbox"}'
```

### Check Status
```bash
curl http://localhost:3000/api/test-webhook/status
```

### Initialize Historical Data
```bash
curl -X POST http://localhost:3000/api/data-initialization \
  -H "Content-Type: application/json" \
  -d '{
    "environment": "Production",
    "startDate": 1704067200000,
    "endDate": 1735689600000
  }'
```

## Logging

All operations are logged in `apple_api_logs` table:
```sql
SELECT * FROM apple_api_logs 
ORDER BY created_at DESC 
LIMIT 100;
```

## Consumption Fields Reference

| Field | Type | Description |
|-------|------|-------------|
| accountTenure | Days | Time since first purchase |
| appAccountToken | UUID | User identifier |
| consumptionStatus | Enum | 0=Undeclared, 1=NotConsumed, 2=PartiallyConsumed, 3=FullyConsumed |
| customerConsented | Bool | User consent status |
| deliveryStatus | Enum | 0=NotDelivered, 1=Delivered |
| lifetimeDollarsPurchased | Enum | Purchase amount range |
| lifetimeDollarsRefunded | Enum | Refund amount range |
| platform | Enum | 1=Apple |
| playTime | Enum | Usage time range |
| refundPreference | Enum | 0=Undeclared, 1=NoRefunds, 2=FewRefunds, 3=SomeRefunds, 4=ManyRefunds |
| sampleContentProvided | Bool | Free content status |
| userStatus | Enum | 0=Undeclared, 1=ActiveSubscriber, 2=SuspendedSubscriber, 3=NotSubscriber |

## Support

For detailed troubleshooting, check the main README or open an issue on GitHub.