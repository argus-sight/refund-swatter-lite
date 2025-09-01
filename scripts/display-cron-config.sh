#!/bin/bash

# Script to display cron job configuration values for manual setup
# Useful when you need to configure the cron job in Supabase Dashboard

set -e

echo "============================================"
echo "  Cron Job Configuration Values             "
echo "============================================"
echo ""

# Check configuration
if [ ! -f ".env" ]; then
    echo "Error: .env not found!"
    echo "Please run ./setup-simple.sh first"
    exit 1
fi

# Load configuration
source .env

# Validate required variables
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ -z "$CRON_SECRET" ] || [ -z "$SUPABASE_PROJECT_REF" ]; then
    echo "Error: Required environment variables not set"
    echo "Please run ./setup-simple.sh first"
    exit 1
fi

API_URL="https://$SUPABASE_PROJECT_REF.supabase.co"

echo "Dashboard URL:"
echo "https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/integrations/cron-jobs"
echo ""

echo "Configuration Values:"
echo ""

echo "Schedule (GMT):"
echo "*/5 * * * *"
echo "(This runs every 5 minutes)"
echo ""

echo "Type:"
echo "Supabase Edge Function"
echo ""

echo "Method:"
echo "POST"
echo ""

echo "Edge Function:"
echo "process-notifications-cron"
echo ""

echo "Timeout:"
echo "3000"
echo "(3 seconds in milliseconds)"
echo ""

echo "HTTP Headers:"
echo ""
echo "Header 1:"
echo "  Name:  Authorization"
echo "  Value: Bearer $SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "Header 2:"
echo "  Name:  Content-Type"
echo "  Value: application/json"
echo ""

echo "HTTP Request Body:"
echo "{\"secret\": \"$CRON_SECRET\"}"
echo ""

echo "============================================"
echo "Copy these values to your Supabase Dashboard"
echo "============================================"
echo ""

echo "Instructions:"
echo "1. Go to the Dashboard URL above"
echo "2. Click 'Create a new cron job'"
echo "3. Copy and paste each value into the corresponding field"
echo "4. Click 'Save cron job'"
echo ""

echo "Note: Make sure to copy the values exactly as shown,"
echo "including the Bearer prefix for the Authorization header."