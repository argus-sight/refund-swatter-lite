#!/bin/bash

# Refund Swatter Lite - Complete Setup & Deployment Script
# This script handles both initial setup and deployment

set -e

echo "==========================================="
echo "  Refund Swatter Lite - Setup & Deploy    "
echo "==========================================="
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI is not installed."
    echo "Please install it first: https://supabase.com/docs/guides/cli"
    echo ""
    echo "For macOS: brew install supabase/tap/supabase"
    echo "For npm: npm install -g supabase"
    exit 1
fi

# Check if project is linked
PROJECT_ID=$(grep "project_id" supabase/config.toml 2>/dev/null | cut -d '"' -f 2)
if [ -z "$PROJECT_ID" ]; then
    echo "Supabase project is not linked."
    echo ""
    
    # Try to extract from .env if exists
    if [ -f .env ]; then
        source .env
        if [ ! -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
            PROJECT_REF=$(echo $NEXT_PUBLIC_SUPABASE_URL | sed 's/https:\/\/\(.*\)\.supabase\.co/\1/')
            echo "Found project reference in .env: $PROJECT_REF"
            echo "Linking to Supabase project..."
            supabase link --project-ref $PROJECT_REF
            PROJECT_ID=$PROJECT_REF
        fi
    fi
    
    if [ -z "$PROJECT_ID" ]; then
        echo "Please link your Supabase project first:"
        echo "  supabase link --project-ref your-project-ref"
        echo ""
        echo "You can find your project ref in Supabase Dashboard > Settings > General"
        exit 1
    fi
fi

# Ensure .temp directory and files exist for Supabase CLI
if [ ! -z "$PROJECT_ID" ]; then
    # Create .temp directory if it doesn't exist
    if [ ! -d "supabase/.temp" ]; then
        echo "Creating Supabase temp directory..."
        mkdir -p supabase/.temp
    fi
    
    # Create project-ref file if it doesn't exist
    if [ ! -f "supabase/.temp/project-ref" ]; then
        echo "Creating project reference file..."
        echo "$PROJECT_ID" > supabase/.temp/project-ref
    fi
    
    # Create pooler-url file if it doesn't exist
    if [ ! -f "supabase/.temp/pooler-url" ]; then
        echo "Creating pooler URL file..."
        # Standard Supabase pooler URL format
        # Note: Region may vary (aws-0-us-east-1 or aws-1-us-east-1)
        # Use printf instead of echo to avoid trailing newline
        printf "postgresql://postgres.$PROJECT_ID:[YOUR-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres" > supabase/.temp/pooler-url
    fi
fi

echo "Project ID: $PROJECT_ID"
echo ""

# Step 1: Push database migrations
echo "Step 1: Applying database migrations..."
echo "----------------------------------------"
supabase db push

if [ $? -eq 0 ]; then
    echo "✓ Database migrations applied successfully"
else
    echo "✗ Failed to apply database migrations"
    echo ""
    echo "Common issues:"
    echo "1. Ensure these extensions are enabled in Supabase Dashboard:"
    echo "   - pg_cron"
    echo "   - vault"
    echo "   - pg_net"
    echo "2. Go to: https://supabase.com/dashboard/project/$PROJECT_ID/database/extensions"
    exit 1
fi

# Step 2: Deploy Edge Functions
echo ""
echo "Step 2: Deploying Edge Functions..."
echo "------------------------------------"

# List of functions to deploy
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
    echo "  Deploying $func..."
    supabase functions deploy $func --no-verify-jwt
    if [ $? -eq 0 ]; then
        echo "  ✓ $func deployed"
    else
        echo "  ✗ Failed to deploy $func"
        DEPLOY_FAILED=1
    fi
done

if [ $DEPLOY_FAILED -eq 0 ]; then
    echo "✓ All Edge Functions deployed successfully"
else
    echo "✗ Some Edge Functions failed to deploy"
    exit 1
fi

# Step 3: Setup secrets (if CRON_SECRET not set)
echo ""
echo "Step 3: Setting up secrets..."
echo "------------------------------"

if [ -f .env ]; then
    source .env
fi

if [ -z "$CRON_SECRET" ]; then
    CRON_SECRET=$(openssl rand -hex 32)
    echo "Generated new CRON_SECRET"
    
    # Add to .env if file exists
    if [ -f .env ]; then
        echo "CRON_SECRET=$CRON_SECRET" >> .env
        echo "✓ CRON_SECRET added to .env"
    else
        echo "CRON_SECRET=$CRON_SECRET"
        echo "⚠ Please save this CRON_SECRET"
    fi
    
    # Set in Supabase
    supabase secrets set CRON_SECRET=$CRON_SECRET
else
    echo "✓ CRON_SECRET already configured"
fi

# Step 4: Verify cron job setup
echo ""
echo "Step 4: Verifying cron job configuration..."
echo "-------------------------------------------"

# Try to check cron jobs
CRON_CHECK=$(supabase db execute --sql "
SELECT COUNT(*) as job_count 
FROM cron.job 
WHERE jobname IN ('process-pending-notifications', 'process-notifications-fallback')
AND active = true;
" 2>/dev/null | grep -o '[0-9]' | head -1)

if [ ! -z "$CRON_CHECK" ] && [ "$CRON_CHECK" -gt 0 ]; then
    echo "✓ Cron jobs configured successfully ($CRON_CHECK active jobs)"
else
    echo "⚠ Cron jobs may not be properly configured"
    echo "  The migration should have set them up automatically"
    echo "  You can verify in Supabase Dashboard: Integrations > Cron"
fi

# Step 5: Initialize data (optional)
echo ""
read -p "Do you want to initialize sample data? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Initializing sample data..."
    
    PROJECT_URL="https://$PROJECT_ID.supabase.co"
    ANON_KEY=$(supabase status --json 2>/dev/null | grep -o '"anon_key":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$ANON_KEY" ]; then
        echo "  ⚠ Could not retrieve anon key. Skipping data initialization."
    else
        RESPONSE=$(curl -X POST "$PROJECT_URL/functions/v1/data-initialization" \
            -H "Authorization: Bearer $ANON_KEY" \
            -H "Content-Type: application/json" \
            -d '{"action": "initialize"}' \
            --silent --write-out "HTTPSTATUS:%{http_code}")
        
        HTTP_STATUS=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
        
        if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 204 ]; then
            echo "  ✓ Sample data initialized"
        else
            echo "  ⚠ Failed to initialize sample data (HTTP $HTTP_STATUS)"
        fi
    fi
fi

# Step 6: Web application setup (optional for local development)
echo ""
read -p "Do you want to setup the web dashboard for local development? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "web" ]; then
        echo "Setting up web application..."
        cd web
        
        # Check if .env.local exists
        if [ ! -f .env.local ]; then
            echo "Creating .env.local..."
            cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=https://$PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(supabase status --json 2>/dev/null | grep -o '"anon_key":"[^"]*' | cut -d'"' -f4)
SUPABASE_SERVICE_ROLE_KEY=$(supabase status --json 2>/dev/null | grep -o '"service_role_key":"[^"]*' | cut -d'"' -f4)
EOF
            echo "✓ Created .env.local with Supabase credentials"
        fi
        
        echo "Installing dependencies..."
        npm install
        
        echo "Building application..."
        npm run build
        
        cd ..
        echo "✓ Web application setup complete"
        echo ""
        echo "To start the dashboard locally:"
        echo "  cd web && npm run dev"
        echo "Then access: http://localhost:3000"
    else
        echo "⚠ Web directory not found. Skipping web setup."
    fi
fi

# Display deployment summary
echo ""
echo "==========================================="
echo "        Deployment Complete Summary        "
echo "==========================================="
echo ""
echo "✓ Database migrations: Applied"
echo "✓ Edge Functions: Deployed (${#FUNCTIONS[@]} functions)"

if [ ! -z "$CRON_CHECK" ] && [ "$CRON_CHECK" -gt 0 ]; then
    echo "✓ Cron Jobs: Configured ($CRON_CHECK active)"
else
    echo "⚠ Cron Jobs: May need verification"
fi

echo ""
echo "Project Details:"
echo "----------------"
echo "Project URL: https://$PROJECT_ID.supabase.co"
echo "Dashboard: https://supabase.com/dashboard/project/$PROJECT_ID"
echo ""
echo "Important Next Steps:"
echo "--------------------"
echo "1. Configure Apple credentials in Supabase Dashboard:"
echo "   Settings > Edge Functions > Environment Variables"
echo "   - APPLE_PRIVATE_KEY (your .p8 file content)"
echo "   - APPLE_KEY_ID"
echo "   - APPLE_ISSUER_ID"
echo "   - APPLE_BUNDLE_ID"
echo ""
echo "2. Configure Apple App Store Server Notifications:"
echo "   URL: https://$PROJECT_ID.supabase.co/functions/v1/webhook"
echo ""
echo "3. Monitor cron jobs:"
echo "   https://supabase.com/dashboard/project/$PROJECT_ID/integrations/cron"
echo ""
echo "4. View Edge Functions logs:"
echo "   https://supabase.com/dashboard/project/$PROJECT_ID/functions"
echo ""
echo "==========================================="
echo "Setup & Deployment completed successfully!"
echo "==========================================="