# Logging Guide - Refund Swatter Lite

## Overview
All functions and API routes in Refund Swatter Lite now include comprehensive logging to help with debugging and monitoring.

## Log Format

### Edge Functions (Supabase)
Each log entry includes:
- `[RequestID]` - Unique identifier for tracking requests
- Request method, URL, and headers
- Processing steps with timing information
- Success/error status with details
- Total processing time

Example:
```
[abc123] ==> Webhook Request Started
[abc123] Method: POST
[abc123] URL: https://...
[abc123] Processing CONSUMPTION_REQUEST
[abc123] ✓ Request completed successfully
[abc123] Total processing time: 145ms
```

### Frontend API Routes
Uses the ApiLogger class with structured logging:
- Timestamp
- Log level (INFO, WARN, ERROR, SUCCESS, DEBUG)
- Request ID
- Route name
- Duration
- Contextual data

Example:
```
[2024-01-10T10:30:45.123Z] [INFO] [xyz789] [POST /api/setup] [0ms] ==> Request Started
[2024-01-10T10:30:45.234Z] [SUCCESS] [xyz789] [POST /api/setup] [111ms] ✓ Private key stored successfully
```

## Viewing Logs

### Supabase Edge Functions

1. **Via Supabase Dashboard:**
   ```
   https://supabase.com/dashboard/project/<PROJECT-REF>/functions
   ```
   - Click on any function
   - View "Logs" tab
   - Filter by time range or search by request ID

2. **Via Supabase CLI:**
   ```bash
   # Get logs for specific function
   supabase functions logs webhook --project-ref <PROJECT-REF>
   
   # Follow logs in real-time
   supabase functions logs send-consumption --tail --project-ref <PROJECT-REF>
   ```

3. **Via API:**
   Use the `get_logs` function in the Supabase MCP tool

### Frontend Logs

1. **Development (Browser Console):**
   - Open browser DevTools (F12)
   - Check Console tab
   - Filter by log level if needed

2. **Production (Vercel/Server logs):**
   - Check your hosting platform's log viewer
   - For Vercel: https://vercel.com/[your-project]/functions

## Testing Logs

### Test Webhook Function
```bash
curl -X POST https://<PROJECT-REF>.supabase.co/functions/v1/webhook \
  -H "Content-Type: application/json" \
  -d '{"signedPayload": "test"}' \
  -v
```

Check response headers for `requestId`, then search logs with that ID.

### Test Send-Consumption Function
```bash
curl -X POST https://<PROJECT-REF>.supabase.co/functions/v1/send-consumption \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -v
```

### Test Apple JWT Generation
```bash
curl -X POST https://<PROJECT-REF>.supabase.co/functions/v1/apple-jwt \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -v
```

## Log Levels and Their Meanings

### INFO
General information about request processing:
- Request received
- Processing steps
- State transitions

### SUCCESS (✓)
Successful operations:
- Data stored successfully
- JWT generated
- Request completed

### WARN
Non-critical issues:
- Missing optional parameters
- Retry attempts
- Deprecation notices

### ERROR
Critical failures:
- Database errors
- Authentication failures
- External API errors
- Unexpected exceptions

### DEBUG
Detailed information (development only):
- Full request/response bodies
- Intermediate calculations
- State dumps

## Common Log Patterns to Watch For

### Successful Consumption Request Processing
```
[RequestID] Apple Store Server Notification received
[RequestID] Notification type: CONSUMPTION_REQUEST
[RequestID] >>> Processing CONSUMPTION_REQUEST
[RequestID] Original Transaction ID: xxx
[RequestID] ✓ Consumption request created
[RequestID] ✓ Notification status updated to processed
[RequestID] ==> Request completed successfully
```

### Failed JWT Generation
```
[RequestID] ERROR: Apple credentials not properly configured
[RequestID] Missing: apple_private_key
[RequestID] ==> ERROR generating Apple JWT
```

### Database Connection Issues
```
[RequestID] ERROR fetching config: {code: "PGRST301", details: "...", message: "..."}
[RequestID] ERROR in webhook processing
```

## Troubleshooting Using Logs

### 1. Track a Specific Request
Use the request ID to follow the complete flow:
```bash
supabase functions logs webhook --project-ref <PROJECT-REF> | grep "abc123"
```

### 2. Find All Errors in Last Hour
```bash
supabase functions logs --project-ref <PROJECT-REF> | grep "ERROR"
```

### 3. Monitor Processing Times
Look for patterns in processing duration:
```bash
supabase functions logs --project-ref <PROJECT-REF> | grep "Total processing time"
```

### 4. Debug Configuration Issues
Check for configuration-related logs:
```bash
supabase functions logs --project-ref <PROJECT-REF> | grep -E "Configuration|config|credentials"
```

## Performance Monitoring

Each request logs its total processing time. Monitor these to identify:
- Slow database queries
- External API latency
- Function cold starts

Example analysis:
```bash
# Find requests taking over 1000ms
supabase functions logs --project-ref <PROJECT-REF> | grep "Total processing time" | grep -E "[0-9]{4,}ms"
```

## Security Notes

Logs are configured to:
- Never log complete private keys (only length and preview)
- Mask sensitive headers
- Truncate large payloads
- Include request IDs for correlation without exposing user data

## Log Retention

- Supabase Edge Functions: 7 days (default)
- Database logs (apple_api_logs table): 30 days (configurable)
- Frontend logs: Depends on hosting platform

## Customizing Log Levels

For development, you can increase log verbosity by setting environment variables:
```bash
# In web/.env
LOG_LEVEL=debug
```

For production, keep minimal logging:
```bash
LOG_LEVEL=error
```
