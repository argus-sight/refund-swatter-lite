#!/bin/bash

# Setup script to create default admin user

echo "Setting up default admin user..."

# Check if environment variables are set
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Error: Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables"
  echo "You can source them from web/.env file:"
  echo "  source web/.env"
  exit 1
fi

# Call the setup-admin Edge Function
echo "Creating default admin user..."
response=$(curl -s -X POST \
  "${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/setup-admin" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json")

# Check if the request was successful
if echo "$response" | grep -q '"email"'; then
  echo "✓ Admin user created successfully!"
  echo ""
  echo "Default credentials:"
  echo "  Email: admin@refundswatter.com"
  echo "  Password: ChangeMe123!"
  echo ""
  echo "IMPORTANT: Please change the password on first login!"
elif echo "$response" | grep -q "already exists"; then
  echo "✓ Admin user already exists. No action taken."
else
  echo "✗ Failed to create admin user:"
  echo "$response"
  exit 1
fi

echo ""
echo "You can now login at: ${NEXT_PUBLIC_SUPABASE_URL/\/\/api./\/\/}/login"
echo "Or if running locally: http://localhost:3000/login"