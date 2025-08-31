#!/bin/bash

# Alternative setup script that assumes supabase link has already been run manually

set -e

# Colors for better UX
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Refund Swatter Lite - Manual Link Setup  ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if already linked
if [ ! -f supabase/config.toml ]; then
    echo -e "${RED}Error: Project not linked yet.${NC}"
    echo ""
    echo "Please run this command first:"
    echo -e "${GREEN}supabase link --project-ref YOUR_PROJECT_REF${NC}"
    echo ""
    exit 1
fi

PROJECT_ID=$(grep "project_id" supabase/config.toml 2>/dev/null | cut -d '"' -f 2)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: Could not find project ID in supabase/config.toml${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Found linked project: $PROJECT_ID${NC}"

# Get configuration from Supabase
echo ""
echo -e "${YELLOW}Retrieving Project Configuration${NC}"
echo "---------------------------------"

# Get keys using Supabase CLI
SUPABASE_STATUS=$(supabase status --output json 2>/dev/null)
if [ $? -eq 0 ]; then
    ANON_KEY=$(echo "$SUPABASE_STATUS" | grep -o '"anon_key":"[^"]*' | cut -d'"' -f4)
    SERVICE_ROLE_KEY=$(echo "$SUPABASE_STATUS" | grep -o '"service_role_key":"[^"]*' | cut -d'"' -f4)
    API_URL="https://$PROJECT_ID.supabase.co"
    
    echo -e "${GREEN}✓ Retrieved project configuration${NC}"
else
    echo -e "${RED}Failed to retrieve project configuration${NC}"
    exit 1
fi

# Generate CRON_SECRET if not exists
CRON_SECRET=$(openssl rand -hex 32)
echo -e "${GREEN}✓ Generated CRON_SECRET${NC}"

# Save configuration to .env
echo ""
echo -e "${YELLOW}Saving Configuration${NC}"
echo "--------------------"

cat > .env << EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF=$PROJECT_ID

# Cron Secret
CRON_SECRET=$CRON_SECRET

# Next.js
NEXT_PUBLIC_SITE_URL=http://localhost:3000
EOF

echo -e "${GREEN}✓ Configuration saved to .env${NC}"

# Create web/.env if web directory exists
if [ -d "web" ]; then
    cat > web/.env << EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

# Cron Secret
CRON_SECRET=$CRON_SECRET

# Next.js
NEXT_PUBLIC_SITE_URL=http://localhost:3000
EOF
    echo -e "${GREEN}✓ Configuration saved to web/.env${NC}"
fi

# Database migrations
echo ""
echo -e "${YELLOW}Applying Database Migrations${NC}"
echo "-----------------------------"

supabase db push

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database migrations applied successfully${NC}"
else
    echo -e "${RED}Failed to apply database migrations${NC}"
    echo ""
    echo "Common issues:"
    echo "1. Ensure these extensions are enabled in Supabase Dashboard:"
    echo "   - pg_cron"
    echo "   - vault"
    echo "   - pg_net"
    echo "2. Go to: https://supabase.com/dashboard/project/$PROJECT_ID/database/extensions"
    exit 1
fi

# Set secrets
echo ""
echo -e "${YELLOW}Setting Up Secrets${NC}"
echo "------------------"

supabase secrets set CRON_SECRET=$CRON_SECRET
echo -e "${GREEN}✓ Secrets configured${NC}"

# Deploy Edge Functions
echo ""
echo -e "${YELLOW}Deploying Edge Functions${NC}"
echo "------------------------"

FUNCTIONS=(
    "webhook"
    "send-consumption"
    "apple-jwt"
    "data-initialization"
    "process-jobs"
    "apple-notification-history"
    "process-notifications"
    "process-notifications-cron"
)

DEPLOY_FAILED=0
for func in "${FUNCTIONS[@]}"; do
    echo -n "  Deploying $func..."
    if supabase functions deploy $func --no-verify-jwt > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
    else
        echo -e " ${RED}✗${NC}"
        DEPLOY_FAILED=1
    fi
done

if [ $DEPLOY_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All Edge Functions deployed successfully${NC}"
else
    echo -e "${YELLOW}⚠ Some Edge Functions failed to deploy${NC}"
    echo "You can retry individual functions with: supabase functions deploy <function-name>"
fi

# Setup cron job via SQL
echo ""
echo -e "${YELLOW}Setting Up Cron Jobs${NC}"
echo "--------------------"

# Create cron job using the project configuration
CRON_SQL="
-- Unschedule existing job if exists
SELECT cron.unschedule('process-pending-notifications') 
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-pending-notifications'
);

-- Create new cron job
SELECT cron.schedule(
    'process-pending-notifications',
    '*/5 * * * *',
    \$\$
    SELECT net.http_post(
        url := '$API_URL/functions/v1/process-notifications-cron',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer $SERVICE_ROLE_KEY',
            'x-cron-secret', '$CRON_SECRET'
        ),
        body := jsonb_build_object(
            'trigger', 'cron',
            'limit', 50
        )
    ) AS request_id;
    \$\$
);
"

echo "$CRON_SQL" | supabase db execute

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Cron jobs configured${NC}"
else
    echo -e "${YELLOW}⚠ Cron job setup may need manual configuration${NC}"
fi

# Final summary
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}       Setup Completed Successfully!        ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Project Details:${NC}"
echo "  Project URL: $API_URL"
echo "  Dashboard: https://supabase.com/dashboard/project/$PROJECT_ID"
echo ""
echo -e "${YELLOW}Important Next Steps:${NC}"
echo ""
echo "1. Configure Apple credentials in Supabase Dashboard:"
echo "   Settings > Edge Functions > Environment Variables"
echo "   - APPLE_PRIVATE_KEY (your .p8 file content)"
echo "   - APPLE_KEY_ID"
echo "   - APPLE_ISSUER_ID"
echo "   - APPLE_BUNDLE_ID"
echo ""
echo "2. Configure Apple App Store Server Notifications:"
echo "   URL: $API_URL/functions/v1/webhook"
echo ""
echo "3. Monitor your deployment:"
echo "   - Cron Jobs: https://supabase.com/dashboard/project/$PROJECT_ID/integrations/cron"
echo "   - Edge Functions: https://supabase.com/dashboard/project/$PROJECT_ID/functions"
echo "   - Database: https://supabase.com/dashboard/project/$PROJECT_ID/database/tables"
echo ""
echo -e "${GREEN}Your project is ready to use!${NC}"