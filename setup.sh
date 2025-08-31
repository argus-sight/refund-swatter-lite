#!/bin/bash

# Refund Swatter Lite - Interactive Setup & Deployment Script
# Simplified one-click deployment with minimal user input

set -e

# Colors for better UX
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Refund Swatter Lite - Quick Setup        ${NC}"
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

# Function to validate project ref format
validate_project_ref() {
    if [[ ! $1 =~ ^[a-z]{20}$ ]]; then
        echo -e "${RED}Invalid project reference format.${NC}"
        echo "Project reference should be 20 lowercase letters (e.g., dmyhbzzrpjfbevehpwkp)"
        return 1
    fi
    return 0
}

# Function to extract project ref from URL
extract_project_ref() {
    if [[ $1 =~ https://([a-z]{20})\.supabase\.co ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi
    return 1
}

# Check if already configured
if [ -f .env ] && [ -f supabase/config.toml ]; then
    PROJECT_ID=$(grep "project_id" supabase/config.toml 2>/dev/null | cut -d '"' -f 2)
    if [ ! -z "$PROJECT_ID" ]; then
        echo -e "${GREEN}Existing configuration detected!${NC}"
        echo "Project ID: $PROJECT_ID"
        read -p "Do you want to use the existing configuration? (Y/n): " -n 1 -r USE_EXISTING
        echo ""
        if [[ ! $USE_EXISTING =~ ^[Nn]$ ]]; then
            # Load existing config
            if [ -f .env ]; then
                source .env
                SKIP_INPUT=true
            fi
        fi
    fi
fi

# Interactive input for minimal configuration
if [ "$SKIP_INPUT" != "true" ]; then
    echo -e "${YELLOW}Step 1: Project Configuration${NC}"
    echo "--------------------------------"
    
    # Get project reference
    while true; do
        echo "Enter your Supabase project reference or URL:"
        echo "(You can find this in Supabase Dashboard > Settings > General)"
        read -r PROJECT_INPUT
        
        # Check if it's a URL or direct project ref
        if [[ $PROJECT_INPUT =~ ^https:// ]]; then
            PROJECT_REF=$(extract_project_ref "$PROJECT_INPUT")
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ Extracted project reference: $PROJECT_REF${NC}"
                break
            else
                echo -e "${RED}Could not extract project reference from URL${NC}"
            fi
        else
            PROJECT_REF=$PROJECT_INPUT
            if validate_project_ref "$PROJECT_REF"; then
                echo -e "${GREEN}✓ Valid project reference${NC}"
                break
            fi
        fi
    done
    
    PROJECT_ID=$PROJECT_REF
fi

echo ""
echo -e "${YELLOW}Step 2: Linking to Supabase Project${NC}"
echo "------------------------------------"

# Link to Supabase project - use interactive mode for password
echo "Linking to project: $PROJECT_ID"
echo -e "${YELLOW}Please enter your database password when prompted:${NC}"

# Try with https DNS resolver to avoid Docker network issues
supabase link --project-ref $PROJECT_ID --dns-resolver https

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Successfully linked to project${NC}"
else
    echo -e "${RED}Failed to link to project. Please check your credentials.${NC}"
    exit 1
fi

# Get configuration from Supabase
echo ""
echo -e "${YELLOW}Step 3: Retrieving Project Configuration${NC}"
echo "-----------------------------------------"

# For remote projects, we need to get the keys differently
# Try using supabase gen keys with experimental flag
KEYS_JSON=$(supabase gen keys --experimental --project-ref $PROJECT_ID --output json 2>/dev/null)

if [ $? -eq 0 ] && [ ! -z "$KEYS_JSON" ]; then
    # Extract keys from JSON output
    ANON_KEY=$(echo "$KEYS_JSON" | grep -o '"SUPABASE_AUTH_ANON_KEY":"[^"]*' | cut -d'"' -f4)
    SERVICE_ROLE_KEY=$(echo "$KEYS_JSON" | grep -o '"SUPABASE_AUTH_SERVICE_ROLE_KEY":"[^"]*' | cut -d'"' -f4)
    API_URL="https://$PROJECT_ID.supabase.co"
    
    if [ ! -z "$ANON_KEY" ] && [ ! -z "$SERVICE_ROLE_KEY" ]; then
        echo -e "${GREEN}✓ Retrieved project configuration${NC}"
    else
        echo -e "${RED}Failed to extract keys from response${NC}"
        echo "Please ensure you have proper access to this project."
        exit 1
    fi
else
    echo -e "${YELLOW}Could not retrieve keys automatically.${NC}"
    echo ""
    echo "Please get your project keys from the Supabase Dashboard:"
    echo "1. Go to: https://supabase.com/dashboard/project/$PROJECT_ID/settings/api"
    echo "2. Copy the 'anon' key and 'service_role' key"
    echo ""
    read -p "Enter your project's anon key: " ANON_KEY
    read -p "Enter your project's service_role key: " SERVICE_ROLE_KEY
    API_URL="https://$PROJECT_ID.supabase.co"
    
    if [ ! -z "$ANON_KEY" ] && [ ! -z "$SERVICE_ROLE_KEY" ]; then
        echo -e "${GREEN}✓ Keys configured${NC}"
    else
        echo -e "${RED}Keys are required to continue${NC}"
        exit 1
    fi
fi

# Generate CRON_SECRET if not exists
if [ -z "$CRON_SECRET" ]; then
    CRON_SECRET=$(openssl rand -hex 32)
    echo -e "${GREEN}✓ Generated CRON_SECRET${NC}"
fi

# Save configuration to .env
echo ""
echo -e "${YELLOW}Step 4: Saving Configuration${NC}"
echo "-----------------------------"

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

# Create temp directory if needed for project reference
mkdir -p supabase/.temp
echo "$PROJECT_ID" > supabase/.temp/project-ref

# Database migrations
echo ""
echo -e "${YELLOW}Step 5: Applying Database Migrations${NC}"
echo "-------------------------------------"

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
echo -e "${YELLOW}Step 6: Setting Up Secrets${NC}"
echo "---------------------------"

supabase secrets set CRON_SECRET=$CRON_SECRET
echo -e "${GREEN}✓ Secrets configured${NC}"

# Deploy Edge Functions
echo ""
echo -e "${YELLOW}Step 7: Deploying Edge Functions${NC}"
echo "---------------------------------"

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
echo -e "${YELLOW}Step 8: Setting Up Cron Jobs${NC}"
echo "-----------------------------"

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

# Optional: Web application setup
echo ""
read -p "Do you want to setup the web dashboard for local development? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "web" ]; then
        echo -e "${YELLOW}Setting up web application...${NC}"
        cd web
        
        # Install dependencies
        echo "Installing dependencies..."
        npm install
        
        # Build application
        echo "Building application..."
        npm run build
        
        cd ..
        echo -e "${GREEN}✓ Web application setup complete${NC}"
        echo ""
        echo "To start the dashboard locally:"
        echo "  cd web && npm run dev"
        echo "Then access: http://localhost:3000"
    fi
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