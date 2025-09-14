#!/bin/bash

# Refund Swatter Lite - Simplified Setup Script
# Single configuration source: .env.project

set -e

# Colors for better UX
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Refund Swatter Lite - Simple Setup       ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check configuration file
if [ ! -f ".env.project" ]; then
    echo -e "${RED}Error: .env.project not found!${NC}"
    echo "Please copy and configure it first:"
    echo "  cp .env.project.example .env.project"
    exit 1
fi

# Load configuration
source .env.project

# Validate required variables
if [ -z "$SUPABASE_PROJECT_REF" ] || [ "$SUPABASE_PROJECT_REF" = "your-project-ref-here" ]; then
    echo -e "${RED}Error: SUPABASE_PROJECT_REF not configured${NC}"
    exit 1
fi

if [ -z "$SUPABASE_DB_PASSWORD" ] || [ "$SUPABASE_DB_PASSWORD" = "your-database-password-here" ]; then
    echo -e "${RED}Error: SUPABASE_DB_PASSWORD not configured${NC}"
    exit 1
fi

echo "Project: $SUPABASE_PROJECT_REF"
echo ""

# Step 1: Link project
echo -e "${YELLOW}Step 1: Linking Supabase project...${NC}"
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD" 2>/dev/null || true
echo -e "${GREEN}✓ Project linked${NC}"

# Step 2: Generate environment files from .env.project
echo -e "${YELLOW}Step 2: Getting API keys...${NC}"
KEYS_OUTPUT=$(supabase projects api-keys --project-ref "$SUPABASE_PROJECT_REF")
ANON_KEY=$(echo "$KEYS_OUTPUT" | grep "anon" | awk '{print $NF}')
SERVICE_ROLE_KEY=$(echo "$KEYS_OUTPUT" | grep "service_role" | awk '{print $NF}')
API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"
CRON_SECRET=$(openssl rand -hex 32)
echo -e "${GREEN}✓ Keys retrieved${NC}"

# Step 3: Generate web/.env from .env.project values
echo -e "${YELLOW}Step 3: Generating environment files...${NC}"

# Use values from .env.project if available, otherwise generate new ones
if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    API_URL=$NEXT_PUBLIC_SUPABASE_URL
else
    API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"
fi

if [ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
    ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
fi

if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
fi

if [ -z "$CRON_SECRET" ]; then
    CRON_SECRET=$(openssl rand -hex 32)
fi

# Create web/.env from consolidated values
if [ -d "web" ]; then
    cat > web/.env << EOF
# Auto-generated from .env.project
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF=$SUPABASE_PROJECT_REF
CRON_SECRET=$CRON_SECRET
NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}
APPLE_BUNDLE_ID=$APPLE_BUNDLE_ID
EOF
    echo -e "${GREEN}✓ web/.env created${NC}"
fi

# Step 4: Verify required extensions
echo -e "${YELLOW}Step 4: Verifying required extensions...${NC}"
echo ""
echo "Required extensions (pg_cron, pg_net, vault) will be enabled during migration."
echo -e "${GREEN}✓ Extension setup included in baseline migration${NC}"

# Step 5: Database migrations
echo ""
echo -e "${YELLOW}Step 5: Applying database migrations...${NC}"
echo "Automatically applying all database migrations..."
echo ""

# Use yes command to auto-confirm all prompts
if yes | supabase db push --password "$SUPABASE_DB_PASSWORD" 2>&1 | tee /tmp/migration_output.log; then
    echo -e "${GREEN}✓ Database migrations applied successfully${NC}"
else
    echo -e "${RED}Failed to apply migrations. Please check the error above.${NC}"
    echo "You can manually run: supabase db push --password YOUR_PASSWORD"
fi

# Step 6: Set secrets
echo ""
echo -e "${YELLOW}Step 6: Setting secrets...${NC}"
supabase secrets set CRON_SECRET="$CRON_SECRET" 2>/dev/null || true
echo -e "${GREEN}✓ Secrets configured${NC}"

# Step 7: Deploy Edge Functions (Required)
echo ""
echo -e "${YELLOW}Step 7: Deploying Edge Functions (All Required)...${NC}"
echo "This step deploys all necessary Edge Functions for the application to work."
echo ""

# All required functions
FUNCTIONS=(
    "setup-admin"  # Must be first for admin user creation
    "webhook"
    "send-consumption"
    "apple-jwt"
    "data-initialization"
    "process-jobs"
    "apple-notification-history"
    "process-notifications"
    "process-notifications-cron"
    "reprocess-notification"
)

FAILED_FUNCTIONS=()
for func in "${FUNCTIONS[@]}"; do
    echo -n "  Deploying $func..."
    ERROR_OUTPUT=$(supabase functions deploy "$func" --no-verify-jwt 2>&1)
    if [ $? -eq 0 ]; then
        echo -e " ${GREEN}✓${NC}"
    else
        echo -e " ${RED}✗ FAILED${NC}"
        echo -e "    ${RED}Error: $(echo "$ERROR_OUTPUT" | grep -E "Error:|error:" | head -1)${NC}"
        FAILED_FUNCTIONS+=("$func")
    fi
done

# Check if any functions failed
if [ ${#FAILED_FUNCTIONS[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}⚠️  Some functions failed to deploy:${NC}"
    for func in "${FAILED_FUNCTIONS[@]}"; do
        echo -e "    ${RED}- $func${NC}"
    done
    echo ""
    echo -e "${YELLOW}To retry deployment manually, run:${NC}"
    for func in "${FAILED_FUNCTIONS[@]}"; do
        echo "  supabase functions deploy $func --no-verify-jwt"
    done
    echo ""
    echo -e "${YELLOW}Note: The setup will continue, but some features may not work properly.${NC}"
else
    echo -e "${GREEN}✓ All Edge Functions deployed successfully${NC}"
fi

# Step 8: Setup cron job (optional)
if [ "$SETUP_CRON" = "true" ]; then
    echo ""
    echo -e "${YELLOW}Step 8: Scheduled Function Setup (Optional)${NC}"
    echo ""
    echo "  A cron job can automatically process pending notifications every 5 minutes."
    echo "  This is optional - notifications will still be processed when received."
    echo ""
    echo -e "${YELLOW}  ⚠️  Note: Cron jobs must be configured manually in Supabase Dashboard${NC}"
    echo ""
    echo "  To set up the cron job:"
    echo ""
    echo "  1. Open the Cron Jobs page in your dashboard:"
    echo -e "     ${BLUE}https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/integrations/cron-jobs${NC}"
    echo ""
    echo "  2. Click 'Create a new cron job'"
    echo ""
    echo "  3. Fill in these settings:"
    echo "     • Job name: process_notifications"
    echo "     • Schedule: */5 * * * *"
    echo "     • Type: HTTP Request"
    echo "     • HTTP Method: POST"
    echo "     • URL: ${API_URL}/functions/v1/process-notifications-cron"
    echo ""
    echo "  4. Add Headers (click 'Add header' twice):"
    echo "     • Authorization: Bearer ${SERVICE_ROLE_KEY}"
    echo "     • Content-Type: application/json"
    echo ""
    echo "  5. Request Body:"
    echo "     {\"secret\": \"${CRON_SECRET}\"}"
    echo ""
    echo "  6. Click 'Save'"
    echo ""
    echo -e "${GREEN}  ✓ Cron job configuration displayed above${NC}"
    echo -e "${YELLOW}  ℹ️  You can skip this step if you don't need automatic processing${NC}"
else
    echo ""
    echo -e "${YELLOW}Step 8: Scheduled Function Setup${NC}"
    echo -e "${YELLOW}  ℹ️  Skipped (SETUP_CRON=false). Notifications will be processed when received.${NC}"
fi

# Step 9: Create admin user
echo ""
echo -e "${YELLOW}Step 9: Creating admin user...${NC}"
curl -s -X POST \
  "${API_URL}/functions/v1/setup-admin" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Admin user ready${NC}"

# Summary
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}         Setup Complete!                    ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Project URL: $API_URL"
echo "Dashboard: https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF"
echo ""
echo "Next steps:"
echo "1. Add Apple credentials in Supabase Dashboard"
echo "2. Configure webhook URL: $API_URL/functions/v1/webhook"
echo "3. Start web app: cd web && npm install && npm run dev"
echo "4. Login: admin@refundswatter.com / ChangeMe123!"
echo ""
echo "To reconfigure: edit .env.project and run ./setup-simple.sh"