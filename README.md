<p align="center">
  <a href="#" title="Refund Swatter Lite">
    <img src="docs/assets/logo.png" width="120" alt="Refund Swatter Lite logo" />
  </a>
</p>

<p align="center">
  <b>Stop fraudulent App Store refunds in 12 hours — 100% on Supabase.</b>
  <br/>
  <sub>Single-tenant, secure, and easy to set up for one app.</sub>
  <br/>
  <sub>You own your keys — Apple private keys are never uploaded to any third party.</sub>
</p>

<p align="center">
  <a href="#quick-start"><img alt="Quick Install" src="https://img.shields.io/badge/Quick%20Install-setup--simple.sh-22c55e?logo=gnubash&logoColor=white"></a>
  <a href="https://www.youtube.com/watch?v=j-88H8j7btI&utm_source=producthunt&utm_medium=github&utm_campaign=readme_top" target="_blank"><img alt="Demo Video" src="https://img.shields.io/badge/Demo-2%20min%20video-ff0000?logo=youtube&logoColor=white"></a>
  <a href="https://github.com/argus-sight/refund-swatter-lite/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/argus-sight/refund-swatter-lite?style=social"></a>
  <a href="./README_zh.md"><img alt="中文" src="https://img.shields.io/badge/简体中文-README-blue"></a>
  <a href="#security"><img alt="You own your keys" src="https://img.shields.io/badge/You%20own%20your%20keys-BYOK-8b5cf6"></a>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=j-88H8j7btI&utm_source=producthunt&utm_medium=github&utm_campaign=readme_hero" target="_blank">
    <img alt="RefundSwatterLite Demo" src="https://img.youtube.com/vi/j-88H8j7btI/maxresdefault.jpg" width="800" />
  </a>
  <br/>
  <sub>Welcome, Product Hunters! Watch the demo and try the quick setup below.</sub>
</p>

---

# Refund Swatter Lite

[Chinese](./README_zh.md) | English

Simplified single-tenant Apple App Store refund prevention service using Supabase.

## Overview

Refund Swatter Lite significantly reduces malicious refund risks by processing Apple's CONSUMPTION_REQUEST notifications and sending detailed consumption data back to Apple within the required 12-hour window, enabling Apple to make informed decisions on refund requests.

### Key Features

- **You Own Your Keys (BYOK, Bring Your Own Key)** - Keep your Apple private keys within your own Supabase project; no third‑party uploads required
- **Single App Support** - Optimized for one app deployment
- **100% Supabase** - No additional servers required  
- **Auto-processing** - Handles notifications automatically
- **12 Consumption Fields** - Calculates all required Apple fields
- **Secure Vault Storage** - Private keys encrypted in Supabase Vault
- **Simple Setup** - One configuration file, one setup script

## Why Refund Swatter Lite?

- Real pain: many iOS teams have suffered sudden large-scale refund abuse overnight — hundreds to tens of thousands of dollars, sometimes even leading to app takedowns.
- How it works: after a user requests a refund, Apple sends up to three CONSUMPTION_REQUEST notifications. If developers respond correctly within the 12-hour window (e.g., cumulative spend, cumulative refunds, developer refund preference), Apple can make a fairer decision and abuse drops significantly.
- Timeline: refund eligibility can extend up to 90 days from purchase; your backend must remain ready throughout that period.
- Gap in existing tools: some platforms (e.g., RevenueCat) automate replies but require uploading the App Store Server API private key (AuthKey.p8) and In‑App Purchase Key to their cloud, effectively delegating App Store Connect query/operation rights to a third party — unacceptable for security‑sensitive teams.
- Our approach: runs 100% on Supabase with one‑command setup and zero server maintenance; BYOK (Bring Your Own Key) — your Apple private keys stay only in your Supabase project (Vault/env), never uploaded to any third party.
- Observability: auto‑responds to CONSUMPTION_REQUEST while surfacing field meanings, jobs, and logs for easy debugging and audits.
- Impact: keeps AuthKey/IAP Key safe and meaningfully reduces fraudulent refunds (especially for consumables).

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
- No third‑party key upload — Apple private keys remain in your Supabase project only

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE) for details.

## Support

For issues or questions, please open an issue on GitHub.
