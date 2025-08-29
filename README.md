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
- **One-Click Deploy** - Simple setup script

## Quick Start

### Prerequisites

- Supabase account and project
- Apple Developer account with App Store Server API access
- Node.js 16+
- Supabase CLI

### Required Database Extensions

Before running migrations, you must enable the following extensions in your Supabase dashboard:

1. Go to your [Supabase Dashboard Extensions page](https://supabase.com/dashboard/project/_/database/extensions)
2. Enable these extensions:
   - **uuid-ossp** - For UUID generation (usually enabled by default)
   - **pg_cron** - For scheduled jobs
   - **vault** - For secure storage of Apple private keys

> **Important**: The migrations will fail if these extensions are not enabled first. Wait about a minute after enabling for them to become available.

### Installation

1. **Clone and setup**
```bash
git clone <repository>
cd refund-swatter-lite
```

2. **Link to your Supabase project**
```bash
supabase link --project-ref your-project-ref
```

3. **One-Click Setup & Deploy**
```bash
./setup.sh
```

This will:
- Apply all database migrations
- Deploy all Edge Functions  
- Configure cron jobs automatically
- Optionally initialize sample data

4. **Configure Apple credentials in Supabase Dashboard**
- Go to Settings → Edge Functions → Environment Variables
- Add your Apple credentials (APPLE_PRIVATE_KEY, etc.)

5. **Start the dashboard (optional for local development)**
```bash
cd web
npm run dev
```

6. **Access dashboard**
Open http://localhost:3000 in your browser

## Configuration

### Initial Setup

When you first access the dashboard, you'll be prompted to configure:

1. **Bundle ID** - Your app's bundle identifier
2. **Issuer ID** - From App Store Connect API Keys
3. **Key ID** - Your API key identifier  
4. **Private Key** - The .p8 file content
5. **Environment** - Sandbox or Production

### Apple Webhook Configuration

In App Store Connect:

1. Go to Apps → Your App → App Store Server Notifications
2. Set the URL to: `https://your-project.supabase.co/functions/v1/webhook`
3. Enable notification types (especially CONSUMPTION_REQUEST)

### Automatic Cron Job Setup

The cron job is automatically configured during deployment to process consumption requests every 5 minutes. You can verify the setup in your Supabase Dashboard under Integrations > Cron.

## Dashboard Features

### Overview Tab
- Consumption metrics (last 30 days)
- Configuration status
- Success rates and response times

### Notifications Tab
- View all received notifications
- Filter by type
- Check processing status

### Test & Initialize Tab
- **Test Webhook** - Send test notifications
- **Data Initialization** - Import historical data (up to 180 days)

### Apple Tools
- **Notification History** - Query Apple's notification history
- **Refund History** - Get refund details by transaction
- **Transaction History** - View user transaction history

### Settings Tab
- Webhook URL for App Store Connect
- Cron job configuration
- Environment switching

## Architecture

```
Apple Server Notifications
         ↓
    Webhook Function
    (JWT verification)
         ↓
  PostgreSQL Database
         ↓
    Cron Job (5 min)
         ↓
  Send Consumption Function
         ↓
  Apple Send Consumption API
```

## Security

- **Private Key Storage**: Encrypted in Supabase Vault using `vault.create_secret()`
- **JWT Verification**: All Apple notifications verified
- **Service Role Keys**: Server-side operations only
- **No Multi-tenant Complexity**: Simplified security model

## Consumption Fields

The system automatically calculates:

| Field | Description |
|-------|-------------|
| `accountTenure` | Days since first purchase |
| `appAccountToken` | User identifier |
| `consumptionStatus` | Content consumption state |
| `customerConsented` | User consent (default: true) |
| `deliveryStatus` | Content delivery state |
| `lifetimeDollarsPurchased` | Total purchases |
| `lifetimeDollarsRefunded` | Total refunds |
| `platform` | Platform type (1=Apple) |
| `playTime` | Usage in minutes |
| `refundPreference` | Refund tendency |
| `sampleContentProvided` | Free content (default: false) |
| `userStatus` | Account status |

## API Usage

### Record Usage Metrics

```javascript
await supabase
  .from('usage_metrics')
  .insert({
    app_account_token: 'user-123',
    metric_type: 'play_time',
    metric_value: { total_minutes: 45 }
  })
```

### Get Consumption Metrics

```javascript
const { data } = await supabase
  .rpc('get_consumption_metrics_summary')
```

## Monitoring

Check system health in Supabase Dashboard:

```sql
-- Recent consumption requests
SELECT * FROM consumption_requests 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Job status
SELECT status, COUNT(*) 
FROM send_consumption_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

## Troubleshooting

### Webhook not receiving notifications
- Verify webhook URL in App Store Connect
- Check Edge Function logs in Supabase Dashboard

### Consumption data not sending
- Verify cron job is running
- Check Apple credentials configuration
- Review job error messages

### Test notification failing
- Ensure correct environment selected
- Verify Apple credentials are valid
- Check bundle ID matches App Store Connect

## Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional
SUPABASE_ACCESS_TOKEN=your-access-token  # For Supabase CLI
CRON_SECRET=your-random-secret          # For cron job security
```

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables
4. Deploy

### Supabase

Edge Functions are deployed automatically via the setup script.

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

## License

Apache License 2.0

## Support

For issues or questions, please open an issue on GitHub.