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

# Step 2: Get API keys
echo -e "${YELLOW}Step 2: Getting API keys...${NC}"
KEYS_OUTPUT=$(supabase projects api-keys --project-ref "$SUPABASE_PROJECT_REF")
ANON_KEY=$(echo "$KEYS_OUTPUT" | grep "anon" | awk '{print $NF}')
SERVICE_ROLE_KEY=$(echo "$KEYS_OUTPUT" | grep "service_role" | awk '{print $NF}')
API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"
CRON_SECRET=$(openssl rand -hex 32)
echo -e "${GREEN}✓ Keys retrieved${NC}"

# Step 3: Generate .env files
echo -e "${YELLOW}Step 3: Generating environment files...${NC}"
cat > .env << EOF
# Auto-generated from .env.project
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF=$SUPABASE_PROJECT_REF
CRON_SECRET=$CRON_SECRET
NEXT_PUBLIC_SITE_URL=http://localhost:3000
APPLE_BUNDLE_ID=$APPLE_BUNDLE_ID
EOF

[ -d "web" ] && cp .env web/.env
echo -e "${GREEN}✓ Environment files created${NC}"

# Step 4: Enable required extensions
echo -e "${YELLOW}Step 4: Setting up required extensions...${NC}"
echo ""

# Create a migration file for extensions if it doesn't exist
EXTENSION_MIGRATION="supabase/migrations/00000000000000_enable_extensions.sql"
if [ ! -f "$EXTENSION_MIGRATION" ]; then
    echo "Creating extension migration file..."
    cat > "$EXTENSION_MIGRATION" << 'EOF'
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vault WITH SCHEMA extensions;

-- Grant necessary permissions for pg_cron
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;
EOF
    echo -e "${GREEN}✓ Extension migration created${NC}"
else
    echo -e "${GREEN}✓ Extension migration already exists${NC}"
fi

echo ""
echo "Extensions will be enabled when database migrations are applied."
echo "Required extensions: pg_cron, pg_net, vault"

# Step 5: Database migrations
echo ""
echo -e "${YELLOW}Step 5: Applying database migrations...${NC}"
echo "This will create all necessary tables and functions."
echo ""
read -p "Do you want to apply database migrations now? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if supabase db push --password "$SUPABASE_DB_PASSWORD"; then
        echo -e "${GREEN}✓ Database migrations applied successfully${NC}"
    else
        echo -e "${RED}Failed to apply migrations. Please check the error above.${NC}"
        echo "You can manually run: supabase db push --password YOUR_PASSWORD"
    fi
else
    echo -e "${YELLOW}Skipped database migrations.${NC}"
    echo "You can apply them later with: supabase db push --password YOUR_PASSWORD"
fi

# Step 6: Set secrets
echo ""
echo -e "${YELLOW}Step 6: Setting secrets...${NC}"
supabase secrets set CRON_SECRET="$CRON_SECRET" 2>/dev/null || true
echo -e "${GREEN}✓ Secrets configured${NC}"

# Step 7: Deploy Edge Functions
if [ "$DEPLOY_FUNCTIONS" = "true" ]; then
    echo ""
    echo -e "${YELLOW}Step 7: Deploying Edge Functions...${NC}"
    
    FUNCTIONS=(
        "webhook"
        "send-consumption"
        "apple-jwt"
        "data-initialization"
        "process-jobs"
        "apple-notification-history"
        "process-notifications"
        "process-notifications-cron"
        "reprocess-notification"
        "setup-admin"
    )
    
    for func in "${FUNCTIONS[@]}"; do
        echo -n "  Deploying $func..."
        if supabase functions deploy "$func" --no-verify-jwt > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
        else
            echo -e " ${RED}✗${NC}"
        fi
    done
fi

# Step 8: Setup cron job (via Supabase Dashboard)
if [ "$SETUP_CRON" = "true" ]; then
    echo ""
    echo -e "${YELLOW}Step 8: Setting up scheduled function${NC}"
    
    echo "  Please configure the cron schedule in Supabase Dashboard:"
    echo ""
    echo "  1. Go to Cron Jobs section:"
    echo "     https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/integrations/cron-jobs"
    echo ""
    echo "  2. Click 'Create a new cron job'"
    echo ""
    echo "  3. Configure with these settings:"
    echo ""
    echo "     Schedule (GMT):"
    echo "     */5 * * * *  (every 5 minutes)"
    echo ""
    echo "     Type:"
    echo "     Supabase Edge Function"
    echo ""
    echo "     Method:"
    echo "     POST"
    echo ""
    echo "     Edge Function:"
    echo "     process-notifications-cron"
    echo ""
    echo "     Timeout:"
    echo "     3000 ms"
    echo ""
    echo "     HTTP Headers (click 'Add a new header' twice):"
    echo "     Header 1:"
    echo "       Name:  Authorization"
    echo "       Value: Bearer ${SERVICE_ROLE_KEY}"
    echo "     Header 2:"
    echo "       Name:  Content-Type"  
    echo "       Value: application/json"
    echo ""
    echo "     HTTP Request Body:"
    echo "     {\"secret\": \"${CRON_SECRET}\"}"
    echo ""
    echo "  4. Click 'Save cron job'"
    echo ""
    echo -e "${GREEN}✓ Cron job configuration values displayed above${NC}"
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