# Refund Swatter Lite

Simplified single-tenant Apple App Store refund prevention service using Supabase.

## Overview

Refund Swatter Lite is a streamlined version of Refund Swatter designed for single app deployment. It automatically processes Apple's CONSUMPTION_REQUEST notifications and sends consumption information back to Apple within the required 12-hour window, helping reduce fraudulent refunds.

### Key Features

- **Single Tenant/App** - Simplified architecture for one app
- **100% Supabase** - No additional servers required  
- **Auto-processing** - Handles notifications automatically
- **12 consumption fields** - Calculates all required Apple fields
- **Secure Vault Storage** - Private keys stored using Supabase Vault
- **Environment Support** - Both Sandbox and Production
- **Apple Tools** - Built-in tools for testing and data management
- **Simple Setup** - One script to configure everything

## Quick Start

### Prerequisites

- Supabase account and project
- Apple Developer account with App Store Server API access
- Node.js 16+
- Supabase CLI

### Installation

1. **Clone and configure**
```bash
git clone <repository>
cd refund-swatter-lite

# Copy and configure your project settings
cp .env.project.example .env.project
# Edit .env.project with your Supabase credentials
```

2. **Run setup script**
```bash
./setup-simple.sh
```

This will:
- Link your Supabase project
- Apply database migrations
- Deploy Edge Functions
- Configure environment files
- Set up required extensions (pg_cron, pg_net, vault)
- Create admin user

3. **Configure Apple credentials**

Access the web dashboard and add your Apple credentials:
- Bundle ID
- Issuer ID (from App Store Connect)
- Key ID (from App Store Connect)
- Private Key (.p8 file content)

4. **Set up cron job**

Follow the instructions displayed by the setup script to configure the cron job in Supabase Dashboard, or use the standalone script:
```bash
./scripts/setup-cron.sh
```

5. **Configure webhook in Apple**

In App Store Connect:
- Go to Apps → Your App → App Store Server Notifications
- Set Production URL: `https://your-project.supabase.co/functions/v1/webhook`
- Set Sandbox URL: `https://your-project.supabase.co/functions/v1/webhook`
- Enable notification types (especially CONSUMPTION_REQUEST)

## Project Structure

```
refund-swatter-lite/
├── supabase/           # Supabase configuration
│   ├── functions/      # Edge Functions
│   └── migrations/     # Database migrations
├── web/                # Next.js admin dashboard
├── scripts/            # Utility scripts
├── docs/               # Documentation
└── setup-simple.sh     # Main setup script
```

## Configuration Files

### .env.project
Main configuration file containing:
- `SUPABASE_PROJECT_REF` - Your Supabase project reference
- `SUPABASE_DB_PASSWORD` - Database password
- `APPLE_BUNDLE_ID` - Your app's bundle ID
- `DEPLOY_FUNCTIONS` - Whether to deploy Edge Functions
- `SETUP_CRON` - Whether to set up cron jobs

### Environment Variables

For local development (`.env`):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=your-random-secret
```

## Dashboard Features

### Overview
- Consumption metrics (last 30 days)
- Processing statistics
- System health status

### Notifications
- View all Apple notifications
- Filter by type and status
- Manual reprocessing

### Test & Initialize
- **Test Webhook** - Verify webhook configuration
- **Data Initialization** - Import historical data (up to 180 days)
- **Check Test Status** - Monitor test notification delivery

### Consumption Requests
- View all consumption requests
- Check processing status
- Retry failed requests

### Refund History
- Track refund patterns
- View refund metrics
- Analyze user behavior

### Settings
- Apple credentials management
- Environment switching (Sandbox/Production)
- System configuration

## API Logging

All Apple API interactions are logged in the `apple_api_logs` table for debugging and auditing:
- Test notification requests
- Status checks
- Consumption data submissions
- Error tracking

## Deployment

### Vercel Deployment

See [docs/vercel-deployment.md](docs/vercel-deployment.md) for detailed instructions.

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

### Edge Functions

Deploy all functions:
```bash
supabase functions deploy --no-verify-jwt
```

Or deploy individually:
```bash
supabase functions deploy webhook --no-verify-jwt
supabase functions deploy process-notifications-cron --no-verify-jwt
```

## Monitoring

### Check System Health

```sql
-- Recent consumption requests
SELECT * FROM consumption_requests 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Job processing status
SELECT status, COUNT(*) 
FROM send_consumption_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- API logs
SELECT * FROM apple_api_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Cron Job Status

```sql
-- Check cron job configuration
SELECT * FROM cron.job 
WHERE jobname = 'process-notifications-cron';

-- View recent cron runs
SELECT * FROM cron.job_run_details 
WHERE jobname = 'process-notifications-cron'
ORDER BY start_time DESC LIMIT 10;
```

## Troubleshooting

### Webhook not receiving notifications
1. Verify webhook URL in App Store Connect
2. Check Edge Function logs: `supabase functions logs webhook`
3. Ensure Edge Functions are deployed

### Consumption data not sending
1. Verify cron job is running: `SELECT * FROM cron.job`
2. Check Apple credentials in config table
3. Review job errors in `send_consumption_jobs` table

### Build errors on Vercel
1. Ensure all environment variables are set
2. Check that variable names match exactly
3. Redeploy after adding/updating variables

### Test notification failing
1. Ensure correct environment selected
2. Verify Apple credentials are valid
3. Check bundle ID matches App Store Connect
4. Review `apple_api_logs` table for errors

## Security

- **Private Key Storage**: Encrypted in Supabase Vault
- **JWT Verification**: All Apple notifications verified
- **Service Role Keys**: Never exposed to client
- **CRON_SECRET**: Protects scheduled job endpoints

## Consumption Fields

The system automatically calculates all 12 required fields:

| Field | Description | Calculation |
|-------|-------------|-------------|
| `accountTenure` | Days since first purchase | From transaction history |
| `appAccountToken` | User identifier | From notification |
| `consumptionStatus` | Content consumption state | Based on usage |
| `customerConsented` | User consent | Always true |
| `deliveryStatus` | Content delivery state | Based on purchase |
| `lifetimeDollarsPurchased` | Total purchases | Sum of transactions |
| `lifetimeDollarsRefunded` | Total refunds | Sum of refunds |
| `platform` | Platform type | Always 1 (Apple) |
| `playTime` | Usage in minutes | From usage metrics |
| `refundPreference` | Refund tendency | Calculated ratio |
| `sampleContentProvided` | Free content | Always false |
| `userStatus` | Account status | Based on activity |

## Scripts

- `setup-simple.sh` - Main setup script
- `scripts/setup-cron.sh` - Configure cron job independently
- `scripts/display-cron-config.sh` - Display cron configuration values

## Documentation

- [Quick Start Guide](QUICK_START.md) - Detailed setup instructions
- [Deployment Guide](DEPLOYMENT.md) - Production deployment
- [Vercel Deployment](docs/vercel-deployment.md) - Deploy to Vercel
- [Cron Setup](docs/cron-setup.md) - Configure scheduled jobs

## Differences from Refund Swatter

| Feature | Refund Swatter | Refund Swatter Lite |
|---------|----------------|---------------------|
| Multi-tenant | ✅ | ❌ |
| Multiple apps | ✅ | ❌ |
| OAuth login | ✅ | ❌ |
| API key auth | ✅ | ❌ |
| User management | ✅ | ❌ |
| Core functionality | ✅ | ✅ |
| Apple tools | ✅ | ✅ |
| Vault storage | ✅ | ✅ |
| Setup complexity | Complex | Simple |

## License

Apache License 2.0

## Support

For issues or questions, please open an issue on GitHub.