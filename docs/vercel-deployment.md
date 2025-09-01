# Vercel Deployment Guide

This guide explains how to deploy Refund Swatter Lite to Vercel.

## Prerequisites

1. A Vercel account
2. Supabase project set up and configured
3. Apple App Store Connect credentials configured

## Environment Variables

You need to configure the following environment variables in Vercel:

### Required Variables

1. **NEXT_PUBLIC_SUPABASE_URL**
   - Your Supabase project URL
   - Example: `https://your-project-ref.supabase.co`
   - Get from: Supabase Dashboard > Settings > API

2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Your Supabase anonymous key
   - Get from: Supabase Dashboard > Settings > API

3. **SUPABASE_SERVICE_ROLE_KEY**
   - Your Supabase service role key (keep this secret!)
   - Get from: Supabase Dashboard > Settings > API

4. **CRON_SECRET**
   - A random secret for securing cron endpoints
   - Generate with: `openssl rand -hex 32`
   - Note: This should match the secret set in Supabase Edge Functions

## Setup Steps

### 1. Import Project to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." > "Project"
3. Import your Git repository
4. Select the `web` directory as the root directory

### 2. Configure Environment Variables

1. In your Vercel project settings, go to "Settings" > "Environment Variables"
2. Add each environment variable listed above:
   - Name: The variable name (e.g., `NEXT_PUBLIC_SUPABASE_URL`)
   - Value: The actual value
   - Environment: Select all (Production, Preview, Development)

### 3. Configure Build Settings

In your Vercel project settings:

1. **Framework Preset**: Next.js
2. **Root Directory**: `web`
3. **Build Command**: `npm run build` or leave as default
4. **Output Directory**: `.next` or leave as default
5. **Install Command**: `npm install` or leave as default

### 4. Deploy

1. Click "Deploy" to start the deployment
2. Wait for the build to complete
3. Your app will be available at the provided Vercel URL

## Post-Deployment

### Update Webhook URL

After deployment, update your Apple App Store Connect webhook URL:

1. Get your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
2. Your webhook URL will be: `https://your-app.vercel.app/api/webhook`
3. Update this in Apple App Store Connect

### Configure Supabase URLs

If you haven't already, add your Vercel URL to Supabase's allowed URLs:

1. Go to Supabase Dashboard > Authentication > URL Configuration
2. Add your Vercel URL to:
   - Site URL
   - Redirect URLs

## Troubleshooting

### Build Errors

If you encounter "supabaseUrl is required" or similar errors during build:

1. Ensure all environment variables are correctly set in Vercel
2. Check that variable names match exactly (they are case-sensitive)
3. Try redeploying after adding/updating environment variables

### Authentication Issues

If users can't log in:

1. Verify Supabase URL and keys are correct
2. Check that your Vercel URL is added to Supabase's allowed URLs
3. Ensure cookies are enabled and working properly

### Webhook Not Receiving Data

1. Verify the webhook URL is correctly configured in Apple App Store Connect
2. Check the Edge Functions are deployed in Supabase
3. Review logs in Vercel Functions tab for any errors

## Environment Variables from .env

If you have a local `.env` file, you can get the values:

```bash
# From your local .env file (only copy these to Vercel):
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=your-cron-secret
```

Note: `APPLE_BUNDLE_ID` is not needed in Vercel as it's stored in the Supabase database.

Copy these values to Vercel's environment variables settings.

## Security Notes

- Never commit `.env` files to Git
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` secret
- Use Vercel's environment variables for all sensitive data
- Enable Vercel's security features like DDoS protection