# Setup Guide

## Prerequisites

- Supabase account and project
- Apple Developer account with App Store Server API access
- Node.js 16+
- Supabase CLI ([Installation Guide](https://supabase.com/docs/guides/cli))

## Installation

### 1. Clone and Configure

```bash
git clone git@github.com:argus-sight/refund-swatter-lite.git
cd refund-swatter-lite

# Configure your project settings
cp .env.project.example .env.project
# Edit .env.project with your credentials
```

### 2. Configure .env.project

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

### 3. Run Setup Script

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

### 4. Start Web Dashboard

```bash
cd web
npm install
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

## Apple Configuration

### 1. Configure Apple Credentials

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

### 2. Set Webhook in App Store Connect

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

## Manual Setup (Alternative)

If you prefer manual setup instead of using the setup script:

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

#### Option A: Via Supabase Dashboard (Recommended)

1. Navigate to Cron Jobs section:
   ```
   https://supabase.com/dashboard/project/[YOUR_PROJECT_REF]/integrations/cron-jobs
   ```

2. Click "Create a new cron job"

3. Configure with these settings:
   - **Schedule (GMT)**: `*/5 * * * *` (every 5 minutes)
   - **Type**: Supabase Edge Function
   - **Method**: POST
   - **Edge Function**: process-notifications-cron
   - **Timeout**: 3000 ms
   
4. Add HTTP Headers (click "Add a new header" twice):
   - **Header 1**:
     - Name: `Authorization`
     - Value: `Bearer [YOUR_SERVICE_ROLE_KEY]`
   - **Header 2**:
     - Name: `Content-Type`
     - Value: `application/json`

5. Set HTTP Request Body:
   ```json
   {"secret": "[YOUR_CRON_SECRET]"}
   ```

6. Click "Save cron job"

#### Option B: Via SQL (Alternative)

In Supabase Dashboard > SQL Editor:
```sql
SELECT cron.schedule(
  'process-notifications-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/process-notifications-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer your-service-role-key',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('secret', 'your-cron-secret')
  ) AS request_id;
  $$
);
```

**Note**: The cron job runs every 5 minutes to:
- Process pending Apple notifications
- Send consumption data to Apple
- Retry failed jobs automatically

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

## Logging

All operations are logged in `apple_api_logs` table:
```sql
SELECT * FROM apple_api_logs 
ORDER BY created_at DESC 
LIMIT 100;
```

## Consumption Fields Reference

https://developer.apple.com/documentation/appstoreserverapi/consumptionrequest

## Support

For detailed troubleshooting, check the main README or open an issue on GitHub.