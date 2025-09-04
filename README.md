# Refund Swatter Lite

[Chinese](./README_zh.md) | English

Simplified single-tenant Apple App Store refund prevention service using Supabase.

## Demo Video

[![RefundSwatterLite Demo](https://img.youtube.com/vi/j-88H8j7btI/maxresdefault.jpg)](https://www.youtube.com/watch?v=j-88H8j7btI)

Watch the [complete setup and usage tutorial](https://www.youtube.com/watch?v=j-88H8j7btI) on YouTube.

## Overview

Refund Swatter Lite processes Apple's CONSUMPTION_REQUEST notifications and sends consumption information back to Apple within the required 12-hour window, helping reduce fraudulent refunds.

### Key Features

- **Single App Support** - Optimized for one app deployment
- **100% Supabase** - No additional servers required  
- **Auto-processing** - Handles notifications automatically
- **12 Consumption Fields** - Calculates all required Apple fields
- **Secure Vault Storage** - Private keys encrypted in Supabase Vault
- **Simple Setup** - One configuration file, one setup script

## Quick Start

### Prerequisites

- Supabase account and project
- Apple Developer account with App Store Server API access
- Node.js 16+
- Supabase CLI ([Installation Guide](https://supabase.com/docs/guides/cli))

### Installation

1. **Clone and configure**
```bash
git clone git@github.com:argus-sight/refund-swatter-lite.git
cd refund-swatter-lite

# Configure your project settings
cp .env.project.example .env.project
# Edit .env.project with your credentials
```

2. **Run setup script**
```bash
./setup-simple.sh
```

This will automatically:
- Link your Supabase project
- Apply database migrations
- Deploy Edge Functions
- Configure environment
- Set up cron jobs
- Create admin user

3. **Configure Apple credentials**

Access the web dashboard at `http://localhost:3000` and add:
- Bundle ID
- Issuer ID (from App Store Connect)
- Key ID (from App Store Connect)
- Private Key (.p8 file content)

4. **Set webhook in App Store Connect**
- Production URL: `https://your-project.supabase.co/functions/v1/webhook`
- Sandbox URL: `https://your-project.supabase.co/functions/v1/webhook`

## Project Structure

```
refund-swatter-lite/
├── supabase/
│   ├── functions/      # Edge Functions
│   └── migrations/     # Database schema
├── web/                # Next.js dashboard
├── scripts/            # Utility scripts
└── .env.project        # Main configuration
```

## Dashboard Features

- **Overview** - Consumption metrics and system health
- **Notifications** - View and reprocess Apple notifications
- **Test & Initialize** - Test webhook and import historical data
- **Consumption Requests** - Track processing status
- **Settings** - Manage Apple credentials

## Troubleshooting

### Common Issues

**Webhook not receiving notifications**
- Verify webhook URL in App Store Connect
- Check Edge Function logs: `supabase functions logs webhook`
- Ensure Edge Functions are deployed
- Ensure JWT verification is disabled for webhook Edge Function

**Consumption data not sending**
- Verify cron job is running
- Check Apple credentials in config table
- Review errors in `send_consumption_jobs` table

**Test notification failing**
- Ensure correct environment selected
- Verify Apple credentials are valid
- Check `apple_api_logs` table for errors

## Security

- Private keys encrypted in Supabase Vault
- Authentication verification for all Edge Functions
- Service role keys never exposed to client
- CRON_SECRET protects scheduled endpoints

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE) for details.

## Support

For issues or questions, please open an issue on GitHub.
