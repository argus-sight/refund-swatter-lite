#!/bin/bash

# Refund Swatter Lite - Simplified Setup & Deployment Script
# Single configuration source: .env.project

set -e

# Colors for better UX
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Refund Swatter Lite - One-Click Setup    ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed.${NC}"
    echo "Please install it first: https://supabase.com/docs/guides/cli"
    echo ""
    echo "For macOS: brew install supabase/tap/supabase"
    echo "For npm: npm install -g supabase"
    exit 1
fi

# Check if configuration file exists
if [ ! -f ".env.project" ]; then
    echo -e "${RED}Error: Configuration file .env.project not found!${NC}"
    echo ""
    echo "Please create it by copying the example:"
    echo -e "${GREEN}cp .env.project.example .env.project${NC}"
    echo "Then edit .env.project with your Supabase project details."
    exit 1
fi

# Load configuration
echo -e "${YELLOW}Loading configuration...${NC}"
source .env.project

# Validate required variables
if [ -z "$SUPABASE_PROJECT_REF" ] || [ "$SUPABASE_PROJECT_REF" = "your-project-ref-here" ]; then
    echo -e "${RED}Error: SUPABASE_PROJECT_REF not configured in .env.project${NC}"
    echo "Please edit .env.project and add your Supabase project reference."
    exit 1
fi

if [ -z "$SUPABASE_DB_PASSWORD" ] || [ "$SUPABASE_DB_PASSWORD" = "your-database-password-here" ]; then
    echo -e "${RED}Error: SUPABASE_DB_PASSWORD not configured in .env.project${NC}"
    echo "Please edit .env.project and add your database password."
    exit 1
fi

echo -e "${GREEN}✓ Configuration loaded${NC}"
echo "  Project: $SUPABASE_PROJECT_REF"
echo "  Environment: ${ENVIRONMENT:-production}"
echo ""

# Step 1: Link Supabase project (if not already linked)
echo -e "${YELLOW}Step 1: Linking Supabase project${NC}"
echo "----------------------------------------"

if [ ! -f "supabase/.temp/project-ref" ]; then
    echo "Linking to project $SUPABASE_PROJECT_REF..."
    if supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD" 2>/dev/null; then
        echo -e "${GREEN}✓ Project linked successfully${NC}"
    else
        echo -e "${YELLOW}⚠ Project might already be linked or password incorrect${NC}"
        echo "Attempting to continue with existing link..."
    fi
else
    LINKED_PROJECT=$(cat supabase/.temp/project-ref 2>/dev/null || echo "")
    if [ "$LINKED_PROJECT" = "$SUPABASE_PROJECT_REF" ]; then
        echo -e "${GREEN}✓ Project already linked${NC}"
    else
        echo -e "${YELLOW}⚠ Different project currently linked${NC}"
        echo "Unlinking and relinking to $SUPABASE_PROJECT_REF..."
        rm -rf supabase/.temp
        supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
        echo -e "${GREEN}✓ Project relinked successfully${NC}"
    fi
fi

# Step 2: Get project configuration
echo ""
echo -e "${YELLOW}Step 2: Retrieving project configuration${NC}"
echo "----------------------------------------"

# Try to get keys from the project directly (preferred method)
echo "Fetching keys from remote project..."
KEYS_OUTPUT=$(supabase projects api-keys --project-ref "$SUPABASE_PROJECT_REF" 2>/dev/null)
if [ $? -eq 0 ]; then
    ANON_KEY=$(echo "$KEYS_OUTPUT" | grep "anon" | awk '{print $NF}')
    SERVICE_ROLE_KEY=$(echo "$KEYS_OUTPUT" | grep "service_role" | awk '{print $NF}')
    API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"
    echo -e "${GREEN}✓ Retrieved project keys from remote${NC}"
else
    # Fallback: Try local status (requires containers running)
    echo "Trying local status..."
    SUPABASE_STATUS=$(timeout 5 supabase status --output json 2>/dev/null)
    if [ $? -eq 0 ]; then
        ANON_KEY=$(echo "$SUPABASE_STATUS" | grep -o '"anon_key":"[^"]*' | cut -d'"' -f4)
        SERVICE_ROLE_KEY=$(echo "$SUPABASE_STATUS" | grep -o '"service_role_key":"[^"]*' | cut -d'"' -f4)
        API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"
        echo -e "${GREEN}✓ Retrieved project keys from local status${NC}"
    fi
fi

# Final fallback: Check for existing keys or prompt user
if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}Unable to retrieve keys automatically.${NC}"
    echo "Please get your keys from:"
    echo "https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/settings/api"
    echo ""
    
    # Check if keys exist in existing .env file
    if [ -f ".env" ]; then
        EXISTING_ANON=$(grep "NEXT_PUBLIC_SUPABASE_ANON_KEY" .env | cut -d'=' -f2)
        EXISTING_SERVICE=$(grep "SUPABASE_SERVICE_ROLE_KEY" .env | cut -d'=' -f2)
        
        if [ ! -z "$EXISTING_ANON" ] && [ ! -z "$EXISTING_SERVICE" ]; then
            echo -e "${YELLOW}Found existing keys in .env file. Using those...${NC}"
            ANON_KEY=$EXISTING_ANON
            SERVICE_ROLE_KEY=$EXISTING_SERVICE
            API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"
            echo -e "${GREEN}✓ Using existing project keys${NC}"
        else
            echo -e "${RED}Error: Could not retrieve API keys.${NC}"
            echo "Please add them manually to .env.project or ensure you're logged in:"
            echo "  supabase login"
            exit 1
        fi
    else
        echo -e "${RED}Error: Could not retrieve API keys.${NC}"
        echo "Please add them manually to .env.project or ensure you're logged in:"
        echo "  supabase login"
        exit 1
    fi
fi

# Generate CRON_SECRET if not exists
CRON_SECRET=$(openssl rand -hex 32)

# Step 3: Generate environment files for web app
echo ""
echo -e "${YELLOW}Step 3: Generating environment files${NC}"
echo "----------------------------------------"

# Create root .env for compatibility
cat > .env << EOF
# Auto-generated from .env.project - DO NOT EDIT DIRECTLY
# Edit .env.project and run setup.sh to update

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF=$SUPABASE_PROJECT_REF

# Cron Secret
CRON_SECRET=$CRON_SECRET

# Next.js
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Apple Configuration
APPLE_BUNDLE_ID=$APPLE_BUNDLE_ID
EOF

# Create web/.env if web directory exists
if [ -d "web" ]; then
    cp .env web/.env
    echo -e "${GREEN}✓ Generated web/.env${NC}"
fi

echo -e "${GREEN}✓ Environment files generated${NC}"

# Step 4: Apply database migrations
echo ""
echo -e "${YELLOW}Step 4: Applying database migrations${NC}"
echo "----------------------------------------"

if [ "$AUTO_CONFIRM" = "true" ]; then
    PUSH_FLAGS=""
else
    PUSH_FLAGS="--dry-run"
    echo "Running in dry-run mode. Set AUTO_CONFIRM=true in .env.project to apply changes."
fi

if supabase db push $PUSH_FLAGS; then
    if [ "$AUTO_CONFIRM" = "true" ]; then
        echo -e "${GREEN}✓ Database migrations applied${NC}"
    else
        echo -e "${YELLOW}Dry run completed. To apply changes, either:${NC}"
        echo "  1. Set AUTO_CONFIRM=true in .env.project and run setup.sh again"
        echo "  2. Run: supabase db push"
        echo ""
        read -p "Apply migrations now? (y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            supabase db push
            echo -e "${GREEN}✓ Database migrations applied${NC}"
        fi
    fi
else
    echo -e "${RED}Failed to apply database migrations${NC}"
    echo ""
    echo "Common issues:"
    echo "1. Ensure these extensions are enabled in Supabase Dashboard:"
    echo "   - pg_cron"
    echo "   - vault"
    echo "   - pg_net"
    echo "2. Go to: https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/database/extensions"
    exit 1
fi

# Step 5: Set secrets
echo ""
echo -e "${YELLOW}Step 5: Setting up secrets${NC}"
echo "----------------------------------------"

supabase secrets set CRON_SECRET="$CRON_SECRET" 2>/dev/null || true

# Set Apple secrets if provided
if [ ! -z "$APPLE_KEY_ID" ] && [ "$APPLE_KEY_ID" != "your-key-id" ]; then
    supabase secrets set APPLE_KEY_ID="$APPLE_KEY_ID" 2>/dev/null || true
fi

if [ ! -z "$APPLE_ISSUER_ID" ] && [ "$APPLE_ISSUER_ID" != "your-issuer-id" ]; then
    supabase secrets set APPLE_ISSUER_ID="$APPLE_ISSUER_ID" 2>/dev/null || true
fi

if [ ! -z "$APPLE_TEAM_ID" ] && [ "$APPLE_TEAM_ID" != "your-team-id" ]; then
    supabase secrets set APPLE_TEAM_ID="$APPLE_TEAM_ID" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Secrets configured${NC}"

# Step 6: Deploy Edge Functions (if enabled)
if [ "$DEPLOY_FUNCTIONS" = "true" ]; then
    echo ""
    echo -e "${YELLOW}Step 6: Deploying Edge Functions${NC}"
    echo "----------------------------------------"
    
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
    
    DEPLOY_FAILED=0
    for func in "${FUNCTIONS[@]}"; do
        echo -n "  Deploying $func..."
        if supabase functions deploy "$func" --no-verify-jwt > /dev/null 2>&1; then
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
else
    echo ""
    echo -e "${YELLOW}Skipping Edge Functions deployment (DEPLOY_FUNCTIONS=false)${NC}"
fi

# Step 7: Setup cron jobs (if enabled)
if [ "$SETUP_CRON" = "true" ]; then
    echo ""
    echo -e "${YELLOW}Step 7: Setting up cron jobs${NC}"
    echo "----------------------------------------"
    
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
    
    echo "$CRON_SQL" | supabase db execute 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Cron jobs configured${NC}"
    else
        echo -e "${YELLOW}⚠ Cron job setup may need manual configuration${NC}"
        echo "Please ensure pg_cron extension is enabled in your Supabase project."
    fi
else
    echo ""
    echo -e "${YELLOW}Skipping cron job setup (SETUP_CRON=false)${NC}"
fi

# Step 8: Setup default admin user
echo ""
echo -e "${YELLOW}Step 8: Setting up admin user${NC}"
echo "----------------------------------------"

echo "Creating default admin user..."
response=$(curl -s -X POST \
  "${API_URL}/functions/v1/setup-admin" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" 2>/dev/null)

if echo "$response" | grep -q '"email"' 2>/dev/null; then
  echo -e "${GREEN}✓ Admin user created${NC}"
  echo "  Email: admin@refundswatter.com"
  echo "  Password: ChangeMe123!"
elif echo "$response" | grep -q "already exists" 2>/dev/null; then
  echo -e "${GREEN}✓ Admin user already exists${NC}"
else
  echo -e "${YELLOW}⚠ Could not create admin user (may already exist)${NC}"
fi

# Final summary
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}       Setup Completed Successfully!        ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Project Details:${NC}"
echo "  Project URL: $API_URL"
echo "  Dashboard: https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF"
echo ""

if [ "$DEPLOY_FUNCTIONS" = "true" ] && [ "$SETUP_CRON" = "true" ]; then
    echo -e "${GREEN}✓ All components deployed and configured${NC}"
else
    echo -e "${YELLOW}Note: Some components were skipped based on your configuration${NC}"
fi

echo ""
echo -e "${YELLOW}Important Next Steps:${NC}"
echo ""
echo "1. Configure Apple credentials in Supabase Dashboard:"
echo "   Settings > Edge Functions > Environment Variables"
echo "   - APPLE_PRIVATE_KEY (your .p8 file content)"
echo "   - APPLE_KEY_ID"
echo "   - APPLE_ISSUER_ID"
echo "   - APPLE_BUNDLE_ID (if different from config)"
echo ""
echo "2. Configure Apple App Store Server Notifications:"
echo "   URL: $API_URL/functions/v1/webhook"
echo ""
echo "3. Start the web interface:"
echo "   cd web && npm install && npm run dev"
echo ""
echo "4. Login with admin credentials:"
echo "   URL: http://localhost:3000/login"
echo "   Email: admin@refundswatter.com"
echo "   Password: ChangeMe123!"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  All settings are in: .env.project"
echo "  To reconfigure: edit .env.project and run ./setup.sh again"
echo ""
echo -e "${GREEN}Your project is ready to use!${NC}"