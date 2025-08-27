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

echo ""
echo "Step 4: Setting up secrets..."
echo "------------------------------------"
if [ -z "$CRON_SECRET" ]; then
    CRON_SECRET=$(openssl rand -hex 32)
    echo "Generated CRON_SECRET: $CRON_SECRET"
    echo "Please add this to your .env file"
fi
supabase secrets set CRON_SECRET=$CRON_SECRET

echo ""
echo "Step 5: Installing web dependencies..."
echo "------------------------------------"
cd web
npm install

echo ""
echo "Step 6: Building web application..."
echo "------------------------------------"
npm run build

echo ""
echo "======================================"
echo "Setup Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Start the web application:"
echo "   cd web && npm run dev"
echo ""
echo "2. Access the dashboard at:"
echo "   http://localhost:3000"
echo ""
echo "3. Configure your Apple credentials in the setup wizard"
echo ""
echo "4. Set up the cron job for automatic processing:"
echo "   Add this to your crontab or use a service like cron-job.org:"
echo "   */5 * * * * curl -X POST $NEXT_PUBLIC_SUPABASE_URL/functions/v1/process-jobs -H \"x-cron-secret: $CRON_SECRET\""
echo ""
echo "5. Configure webhook in App Store Connect:"
echo "   URL: $NEXT_PUBLIC_SUPABASE_URL/functions/v1/webhook"
echo ""