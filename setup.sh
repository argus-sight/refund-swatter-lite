#!/bin/bash

echo "======================================"
echo "Refund Swatter Lite Setup"
echo "======================================"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please edit .env with your Supabase credentials"
    echo "Then run this script again"
    exit 1
fi

# Load environment variables
set -a
source .env
set +a

# Check required environment variables
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "Error: Missing required environment variables in .env file"
    echo "Please ensure all Supabase credentials are configured"
    exit 1
fi

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Supabase CLI not found. Installing..."
    npm install -g supabase
fi

echo ""
echo "Step 1: Linking Supabase project..."
echo "------------------------------------"
# Extract project ID from URL
PROJECT_ID=$(echo $NEXT_PUBLIC_SUPABASE_URL | sed 's/https:\/\/\(.*\)\.supabase\.co/\1/')
supabase link --project-ref $PROJECT_ID

echo ""
echo "Step 2: Running database migrations..."
echo "------------------------------------"
supabase db push

echo ""
echo "Step 3: Deploying Edge Functions..."
echo "------------------------------------"
supabase functions deploy webhook --no-verify-jwt
supabase functions deploy send-consumption --no-verify-jwt
supabase functions deploy apple-jwt --no-verify-jwt
supabase functions deploy data-initialization --no-verify-jwt
supabase functions deploy process-jobs --no-verify-jwt
supabase functions deploy apple-notification-history --no-verify-jwt
supabase functions deploy process-notifications --no-verify-jwt
supabase functions deploy process-notifications-cron --no-verify-jwt

echo ""
echo "Step 4: Setting up cron job..."
echo "------------------------------------"
# Create the cron job with actual environment values
echo "Creating cron job for automatic notification processing..."
supabase db execute --sql "
-- Check if cron job already exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-pending-notifications') THEN
        PERFORM cron.schedule(
            'process-pending-notifications',
            '*/5 * * * *',
            format('SELECT net.http_post(
                url := %L,
                headers := jsonb_build_object(
                    ''Content-Type'', ''application/json'',
                    ''Authorization'', ''Bearer %s''
                ),
                body := jsonb_build_object(''trigger'', ''cron'')
            ) AS request_id;',
            '$NEXT_PUBLIC_SUPABASE_URL/functions/v1/process-notifications-cron',
            '$SUPABASE_SERVICE_ROLE_KEY')
        );
        RAISE NOTICE 'Cron job created successfully';
    ELSE
        RAISE NOTICE 'Cron job already exists';
    END IF;
END\$\$;
"

echo ""
echo "Step 5: Setting up secrets..."
echo "------------------------------------"
if [ -z "$CRON_SECRET" ]; then
    CRON_SECRET=$(openssl rand -hex 32)
    echo "Generated CRON_SECRET: $CRON_SECRET"
    echo "Please add this to your .env file"
fi
supabase secrets set CRON_SECRET=$CRON_SECRET

echo ""
echo "Step 6: Installing web dependencies..."
echo "------------------------------------"
cd web
npm install

echo ""
echo "Step 7: Building web application..."
echo "------------------------------------"
npm run build
cd ..

echo ""
echo "Step 8: Verifying deployment..."
echo "------------------------------------"
# Verify database migrations
echo "Checking database migrations..."
MIGRATION_COUNT=$(supabase db list | wc -l)
if [ "$MIGRATION_COUNT" -gt 0 ]; then
    echo "✓ Database migrations applied"
else
    echo "⚠ Warning: No migrations detected"
fi

# Verify Edge Functions
echo "Checking Edge Functions..."
FUNCTIONS_TO_CHECK=("webhook" "send-consumption" "apple-jwt" "data-initialization" "process-jobs" "apple-notification-history" "process-notifications" "process-notifications-cron")
for func in "${FUNCTIONS_TO_CHECK[@]}"; do
    if supabase functions list | grep -q "$func"; then
        echo "✓ Function '$func' deployed"
    else
        echo "✗ Function '$func' NOT found"
    fi
done

# Verify cron job
echo "Checking cron job..."
CRON_CHECK=$(supabase db execute --sql "SELECT COUNT(*) FROM cron.job WHERE jobname = 'process-pending-notifications';" 2>/dev/null | grep -o '[0-9]' | head -1)
if [ "$CRON_CHECK" = "1" ]; then
    echo "✓ Cron job configured"
else
    echo "⚠ Cron job may not be configured properly"
fi

echo ""
echo "======================================"
echo "Setup Complete!"
echo "======================================"
echo ""
echo "Deployment Summary:"
echo "- Supabase URL: $NEXT_PUBLIC_SUPABASE_URL"
echo "- Cron Secret: $CRON_SECRET (save this!)"
echo ""
echo "Next steps:"
echo "1. Start the web application:"
echo "   cd web && npm run dev"
echo ""
echo "2. Access the dashboard at:"
echo "   http://localhost:3300"
echo ""
echo "3. Configure your Apple credentials in the setup wizard"
echo ""
echo "4. Configure webhook in App Store Connect:"
echo "   URL: $NEXT_PUBLIC_SUPABASE_URL/functions/v1/webhook"
echo ""
echo "5. The cron job has been automatically configured to run every 5 minutes"
echo ""
echo "For production deployment:"
echo "- Deploy the web folder to Vercel/Netlify with environment variables"
echo "- Ensure all Edge Functions have proper CORS settings"
echo ""