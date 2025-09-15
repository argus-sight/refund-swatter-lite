<p align="center">
  <a href="#" title="Refund Swatter Lite">
    <img src="docs/assets/logo.png" width="120" alt="Refund Swatter Lite logo" />
  </a>
</p>

<p align="center">
  <b>Stop fraudulent App Store refunds in real-time — 100% on Supabase.</b>
  <br/>
  <sub>Single-tenant, secure, and easy to set up for one app.</sub>
  <br/>
  <sub>You own your keys — In-App Purchase Keys are never uploaded to any third party.</sub>
</p>

<p align="center">
  <a href="#quick-start"><img alt="Quick Install" src="https://img.shields.io/badge/Quick%20Install-setup--simple.sh-22c55e?logo=gnubash&logoColor=white"></a>
  <a href="https://youtu.be/bQShJeDM5H0&utm_source=producthunt&utm_medium=github&utm_campaign=readme_top" target="_blank"><img alt="Demo Video" src="https://img.shields.io/badge/Demo-38%20sec%20video-ff0000?logo=youtube&logoColor=white"></a>
  <a href="https://github.com/argus-sight/refund-swatter-lite/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/argus-sight/refund-swatter-lite?style=social"></a>
  <a href="./README_zh.md"><img alt="中文" src="https://img.shields.io/badge/简体中文-README-blue"></a>
  <a href="#security"><img alt="You own your keys" src="https://img.shields.io/badge/You%20own%20your%20keys-BYOK-8b5cf6"></a>
</p>

<p align="center">
  <a href="https://youtu.be/bQShJeDM5H0&utm_source=producthunt&utm_medium=github&utm_campaign=readme_hero" target="_blank">
    <img alt="RefundSwatterLite Demo" src="docs/assets/refund_swatter_lite_20250915.gif" width="800" />
  </a>
  <br/>
  <sub>Welcome, Product Hunters! Watch the demo and try the quick setup below.</sub>
</p>

---

# Refund Swatter Lite

[Chinese](./README_zh.md) | English

Simplified single-tenant Apple App Store refund prevention service using Supabase.

## Overview

Refund Swatter Lite significantly reduces malicious refund risks by processing Apple's CONSUMPTION_REQUEST notifications in real-time and sending detailed consumption data back to Apple, enabling Apple to make informed decisions on refund requests.

### Key Features

- **You Own Your Keys (BYOK, Bring Your Own Key)** - Keep your In-App Purchase Keys within your own Supabase project; no third‑party uploads required
- **Real-time Processing** - Instantly handles notifications as they arrive
- **100% Supabase** - No additional servers required  
- **Auto-processing** - Fully automated workflow
- **12 Consumption Fields** - Calculates all required Apple fields
- **Secure Vault Storage** - Private keys encrypted in Supabase Vault
- **Simple Setup** - One configuration file, one setup script

## Why Refund Swatter Lite?

- Real pain: many iOS teams have suffered sudden large-scale refund abuse overnight — hundreds to tens of thousands of dollars, sometimes even leading to app takedowns.
- How it works: after a user requests a refund, Apple sends up to three CONSUMPTION_REQUEST notifications. If developers respond with consumption data in real-time (e.g., cumulative spend, cumulative refunds, developer refund preference), Apple can make a fairer decision and abuse drops significantly.
- Timeline: refund eligibility can extend up to 90 days from purchase; your backend must remain ready throughout that period.
- Gap in existing tools: some platforms (e.g., RevenueCat) automate replies but require uploading the App Store Server API key (AuthKey.p8) and In-App Purchase Key to their cloud, effectively delegating App Store Connect query/operation rights to a third party — unacceptable for security‑sensitive teams.
- Our approach: runs 100% on Supabase with one‑command setup and zero server maintenance; BYOK (Bring Your Own Key) — your In-App Purchase Keys stay only in your Supabase project (Vault/env), never uploaded to any third party.
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

**Important .env.project configurations:**
- **SUPABASE_DB_PASSWORD**: This is your database password that you set when creating your Supabase project
  - If you forgot it: Go to Project Settings → Database → Reset Database Password
  - Example: `your-strong-password-123!`
  - Note: This is different from your Supabase account password
- **SUPABASE_PROJECT_REF**: Your project reference ID (see below for how to obtain)

**How to get your Supabase Project Reference:**
- Option 1: From Supabase Dashboard
  - Go to https://app.supabase.com/projects
  - Click on your project
  - Look at the URL: `https://app.supabase.com/project/[your-project-ref]`
  - Example: If URL is `https://app.supabase.com/project/abcdefghijklmnop`, then your project ref is `abcdefghijklmnop`
- Option 2: From Project Settings
  - Go to Project Settings → General
  - Find "Project ID" field
  - Example: `abcdefghijklmnop`

**How to get your Apple Bundle ID:**
- Option 1: From Xcode
  - Open your project in Xcode
  - Select your project in navigator → Select target → General tab
  - Find "Bundle Identifier" field
  - Example: `com.yourcompany.yourapp`
- Option 2: From App Store Connect
  - Go to https://appstoreconnect.apple.com
  - My Apps → Select your app → App Information
  - Find "Bundle ID" field
  - Example: `com.example.myapp`
- Option 3: From Info.plist
  - Open your app's Info.plist file
  - Look for `CFBundleIdentifier` key
  - Example: `<string>com.company.appname</string>`

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

**Step 1 - Bundle ID**:
- Go to App Store Connect → Apps → Select your app
- Navigate to "App Information" (under General section)
- Copy the "Bundle ID" value (e.g., `com.yourcompany.app`)

**Step 2 - Issuer ID**:
- Go to App Store Connect → Users and Access → Integrations tab
- In the "In-App Purchase" section, find the "Issuer ID" field
- Copy this value (e.g., `12345678-1234-1234-1234-123456789abc`)

**Step 3 - Key ID**:
- Stay in Users and Access → Integrations → In-App Purchase section
- Look at the "Active" keys table below
- Find your key and copy the "KEY ID" column value (e.g., `ABCD12EF34`)

**Step 4 - In-App Purchase Key (.p8 file)**:
- If you don't have a key yet:
  - In the same In-App Purchase section, click "Generate In-App Purchase Key" or "+" button
  - Enter a name for your key
  - Click "Generate"
  - **IMPORTANT**: Download the .p8 file immediately (you can only download it once!)
- Upload the .p8 file in the dashboard

4. **Set webhook in App Store Connect**
- Go to App Store Connect → My Apps → Your App → App Store Server Notifications
- Click "Edit" for both Production and Sandbox
- **Production Server URL**: `https://[your-project-ref].supabase.co/functions/v1/webhook`
  - Example: `https://abcdefghijklmnop.supabase.co/functions/v1/webhook`
- **Sandbox Server URL**: Same as production URL

**⚠️ Important**: After configuring the webhook URLs, wait at least 10 minutes before testing notifications. App Store Connect needs time to update and propagate the webhook configuration. Testing immediately may result in failures.

## Web Dashboard Deployment (Optional)

The web dashboard runs locally by default (`http://localhost:3000`). You can optionally deploy it to a hosting service for easier access.

### Deploy to Vercel (Recommended)

1. **Connect Repository**
  - Sign up for [Vercel](https://vercel.com)
  - Import your GitHub repository
  - Set root directory to `/web`

2. **Configure Environment Variables** in Vercel:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
  ```

3. **Deploy**
  - Vercel will automatically build and deploy
  - Access your dashboard at the provided Vercel URL

### Self-Hosting Options

You can also deploy the web dashboard to:
- **Docker**: Build and run the containerized app
- **VPS/Cloud Server**: Deploy as a Node.js application
- **Static Hosting**: Export as static site (limited functionality)
- **Other Platforms**: Netlify, Railway, Render, etc.

The dashboard is a standard Next.js application and can be deployed anywhere that supports Node.js applications.

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


**Test notification failing**
- Ensure correct environment selected
- Verify Apple credentials are valid
- Check `apple_api_logs` table for errors

## Security

- Private keys encrypted in Supabase Vault
- Authentication verification for all Edge Functions
- Service role keys never exposed to client
- CRON_SECRET protects scheduled endpoints
- No third‑party key upload — In-App Purchase Keys remain in your Supabase project only

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE) for details.

## Support

For issues or questions, please open an issue on GitHub.

## Future Plans

- Multi-tenant SaaS: zero-deploy service
- Refund Swatter Pro: risk control system for professional fraud rings
- Have ideas or interested in collaboration? Please open an issue on GitHub - we'd love to hear from you!
