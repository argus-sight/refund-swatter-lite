# Quick Start Guide

## One-Click Deployment

Refund Swatter Lite now features a simplified setup process that requires only 2 pieces of information from you:

1. **Supabase Project Reference** (or URL)
2. **Database Password**

## Prerequisites

- Supabase CLI installed ([Installation Guide](https://supabase.com/docs/guides/cli))
- A Supabase project ([Create one here](https://supabase.com/dashboard))

## Setup Instructions

### Step 1: Run the Setup Script

```bash
./setup.sh
```

### Step 2: Follow the Interactive Prompts

The script will ask for:

1. **Project Reference or URL**
   - You can enter either:
     - Project reference: `dmyhbzzrpjfbevehpwkp`
     - Full URL: `https://dmyhbzzrpjfbevehpwkp.supabase.co`
   - Find this in: Supabase Dashboard > Settings > General

2. **Database Password**
   - The password you set when creating the Supabase project
   - This is entered securely (hidden input)

### Step 3: Automatic Configuration

The script will automatically:

- Link to your Supabase project
- Retrieve all necessary configuration (API keys, URLs)
- Generate secure secrets (CRON_SECRET)
- Apply database migrations
- Deploy all Edge Functions
- Setup cron jobs for automatic processing
- Create all necessary configuration files

### What Gets Configured

The setup script creates and configures:

- `.env` - Main configuration file
- `web/.env` - Web application configuration
- Database schema and tables
- 8 Edge Functions for Apple notification processing
- Cron job for automatic notification processing (every 5 minutes)
- All necessary secrets and environment variables

### Post-Setup: Apple Configuration

After the script completes, you need to configure Apple credentials:

1. Go to Supabase Dashboard > Edge Functions > Environment Variables
2. Add these variables:
   - `APPLE_PRIVATE_KEY` - Content of your .p8 file
   - `APPLE_KEY_ID` - Your Apple Key ID
   - `APPLE_ISSUER_ID` - Your Apple Issuer ID
   - `APPLE_BUNDLE_ID` - Your app's Bundle ID

3. Configure Apple App Store Server Notifications:
   - Use this URL: `https://YOUR_PROJECT.supabase.co/functions/v1/webhook`

## Configuration Management

All configuration is centralized in the root `.env` file. The setup script automatically:

- Detects existing configurations
- Allows reusing previous setup
- Generates missing values
- Propagates config to all necessary locations

## Troubleshooting

If setup fails, ensure:

1. **Database Extensions are enabled:**
   - pg_cron
   - vault
   - pg_net
   
   Enable them at: `https://supabase.com/dashboard/project/YOUR_PROJECT/database/extensions`

2. **Correct credentials:**
   - Verify your project reference is correct
   - Ensure the database password is the one you set during project creation

3. **Supabase CLI is logged in:**
   ```bash
   supabase login
   ```

## Re-running Setup

The script is idempotent and safe to run multiple times. It will:
- Detect existing configuration
- Ask if you want to reuse it
- Only update what's necessary

## Support

For issues or questions, please check the [GitHub repository](https://github.com/your-repo/refund-swatter-lite).