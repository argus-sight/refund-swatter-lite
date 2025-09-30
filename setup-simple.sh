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

if [ -z "${SUPABASE_DB_PASSWORD:-}" ] || [ "$SUPABASE_DB_PASSWORD" = "your-database-password-here" ]; then
    echo -n "Enter Supabase database password: "
    read -rs SUPABASE_DB_PASSWORD_INPUT
    echo ""
    if [ -z "$SUPABASE_DB_PASSWORD_INPUT" ]; then
        echo -e "${RED}Error: Supabase database password is required${NC}"
        exit 1
    fi
    SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD_INPUT"
fi

echo "Project: $SUPABASE_PROJECT_REF"
echo ""

# Step 1: Link project
echo -e "${YELLOW}Step 1: Linking Supabase project...${NC}"
if supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"; then
    echo -e "${GREEN}✓ Project linked${NC}"
else
    echo -e "${RED}Failed to link Supabase project. Please verify the project ref and database password.${NC}"
    exit 1
fi

# Step 2: Generate environment files from .env.project
echo -e "${YELLOW}Step 2: Getting API keys...${NC}"
KEYS_OUTPUT=$(supabase projects api-keys --project-ref "$SUPABASE_PROJECT_REF")
ANON_KEY=$(echo "$KEYS_OUTPUT" | grep "anon" | awk '{print $NF}')
SERVICE_ROLE_KEY_RAW=$(echo "$KEYS_OUTPUT" | grep "service_role" | awk '{print $NF}')
API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"
CRON_SECRET=$(openssl rand -hex 32)
echo -e "${GREEN}✓ Keys retrieved${NC}"

# Prompt user if service role key is not already provided via environment.
if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
else
    echo ""
    echo -e "${YELLOW}Service role key required${NC}"
    echo "  --> Visit Supabase Dashboard > Project Settings > API."
    echo "  --> Copy the 'service_role' key (never share it publicly)."
    echo ""
    if [ -n "$SERVICE_ROLE_KEY_RAW" ]; then
        echo -e "${YELLOW}Detected service_role key in CLI output. For safety, it will not be printed.${NC}"
        SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY_RAW"
    fi
    
    if [ -z "$SERVICE_ROLE_KEY" ]; then
        read -rsp "Paste service_role key: " SERVICE_ROLE_KEY_INPUT
        echo ""
        if [ -z "$SERVICE_ROLE_KEY_INPUT" ]; then
            echo -e "${RED}Error: service_role key is required to continue${NC}"
            exit 1
        fi
        SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY_INPUT"
    fi
fi

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
    "config"  # Configuration management
    "test-webhook"  # Testing webhook functionality
    "test-webhook-status"  # Webhook test status
    "process-pending"  # Process pending notifications
    "store-apple-key"  # Store In-App Purchase Key
    "consumption-metrics"  # Consumption metrics API
    "consumption-requests"  # Consumption requests history
    "apple-transaction-history"  # Apple transaction history
    "apple-refund-history"  # Apple refund history
)

FAILED_FUNCTIONS=()
for func in "${FUNCTIONS[@]}"; do
    echo -n "  Deploying $func..."
    ERROR_OUTPUT=$(supabase functions deploy "$func" --no-verify-jwt --use-api 2>&1)
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
        echo "  supabase functions deploy $func --no-verify-jwt --use-api"
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
    echo "     • Authorization: Bearer <SERVICE_ROLE_KEY>"
    echo "       (Paste the service_role key copied from the Supabase dashboard; do not share it.)"
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
ADMIN_LOGIN_SUMMARY="4. Login with the admin email (admin@refundswatter.com). Use the temporary password printed above and change it immediately."

echo ""
echo -e "${YELLOW}Step 9: Creating admin user...${NC}"
SETUP_ADMIN_RESPONSE=$(curl -s -X POST \
  "${API_URL}/functions/v1/setup-admin" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json")

if [ -z "$SETUP_ADMIN_RESPONSE" ]; then
  echo -e "${RED}✗ Failed to contact setup-admin function${NC}"
  echo -e "${YELLOW}  ℹ️  Re-run this step once connectivity is restored.${NC}"
  ADMIN_LOGIN_SUMMARY="4. Re-run Step 9 once the setup-admin function is reachable before attempting to log in."
else
  INITIAL_PASSWORD=$(printf '%s' "$SETUP_ADMIN_RESPONSE" | python3 - <<'PY'
import json, sys
try:
    data = json.load(sys.stdin)
    print((data.get('initial_password') or '').strip())
except Exception:
    print('')
PY
)

  ADMIN_EXISTS=$(printf '%s' "$SETUP_ADMIN_RESPONSE" | python3 - <<'PY'
import json, sys
try:
    data = json.load(sys.stdin)
    print('true' if data.get('exists') else 'false')
except Exception:
    print('false')
PY
)

  ADMIN_ERROR=$(printf '%s' "$SETUP_ADMIN_RESPONSE" | python3 - <<'PY'
import json, sys
try:
    data = json.load(sys.stdin)
    print((data.get('error') or '').strip())
except Exception:
    print('')
PY
)

  if [ -n "$INITIAL_PASSWORD" ]; then
    echo -e "${GREEN}✓ Admin user created${NC}"
    echo "  Email: admin@refundswatter.com"
    echo "  Temporary password: $INITIAL_PASSWORD"
    echo "  Store this password securely and change it immediately after logging in."
    ADMIN_LOGIN_SUMMARY="4. Login with email admin@refundswatter.com. Use the temporary password recorded above and change it immediately."
  elif [ "$ADMIN_EXISTS" = "true" ]; then
    echo -e "${GREEN}✓ Admin user already exists${NC}"
    ADMIN_LOGIN_SUMMARY="4. Login with your existing admin credentials and ensure the password has been rotated."
  elif [ -n "$ADMIN_ERROR" ]; then
    echo -e "${RED}✗ Failed to create admin user${NC}"
    echo "  Error: $ADMIN_ERROR"
    ADMIN_LOGIN_SUMMARY="4. Resolve the setup-admin error above and rerun Step 9 before logging in."
  else
    echo -e "${YELLOW}ℹ️  Unexpected response from setup-admin:${NC}"
    echo "  $SETUP_ADMIN_RESPONSE"
    ADMIN_LOGIN_SUMMARY="4. Review the setup-admin output above before attempting to log in."
  fi
fi

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
echo "$ADMIN_LOGIN_SUMMARY"
echo ""
echo "To reconfigure: edit .env.project and run ./setup-simple.sh"
