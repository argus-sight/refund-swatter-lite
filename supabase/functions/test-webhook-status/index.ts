import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'
import { AppleEnvironment, normalizeEnvironment } from '../_shared/constants.ts'

const corsHeaders = getCorsHeaders()

const APPLE_API_BASE = {
  production: 'https://api.storekit.itunes.apple.com/inApps/v1',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'
}

serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  try {
    // Verify authentication
    const auth = await verifyAuth(req, {
      allowServiceRole: false,
      requireAdmin: true
    })

    if (!auth.isValid) {
      return auth.errorResponse!
    }

    const { user } = auth

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 405
        }
      )
    }

    const { testNotificationToken, environment } = await req.json()
    
    if (!testNotificationToken) {
      return new Response(
        JSON.stringify({ error: 'Test notification token is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get Apple JWT
    const jwtResponse = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!jwtResponse.ok) {
      throw new Error('Failed to generate Apple JWT')
    }

    const { jwt } = await jwtResponse.json()

    // Check test notification status with retry logic
    const normalizedEnv = normalizeEnvironment(environment)
    const apiBase = normalizedEnv === AppleEnvironment.SANDBOX ? APPLE_API_BASE.sandbox : APPLE_API_BASE.production
    const apiUrl = `${apiBase}/notifications/test/${testNotificationToken}`
    
    const MAX_RETRIES = 3
    const RETRY_DELAY = 2000 // 2 seconds
    let lastError = null
    let lastData = null
    let lastResponse = null
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`Attempt ${attempt} of ${MAX_RETRIES} to check test notification status`)
      
      const startTime = Date.now()
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`
        }
      })
      const endTime = Date.now()

      const data = await response.json()
      lastResponse = response
      lastData = data
      
      console.log(`Apple status check response (attempt ${attempt}):`, JSON.stringify(data, null, 2))
      
      // Log the API request to apple_api_logs table
      const { error: logError } = await supabaseAdmin.from('apple_api_logs').insert({
        endpoint: apiUrl,
        method: 'GET',
        request_body: null,
        response_status: response.status,
        response_body: data,
        duration_ms: endTime - startTime,
        notes: `Test notification status check for token: ${testNotificationToken} - ${environment} (attempt ${attempt}/${MAX_RETRIES})`
      })
      
      if (logError) {
        console.error('Failed to log API request:', logError)
      }

      // Check if we got a successful response
      if (response.ok) {
        // If we got a success, return the data
        console.log('Successfully retrieved test notification status')
        lastError = null
        break
      }
      
      // Check for specific error that requires retry
      if (data.errorCode === 4040010 || 
          (data.errorMessage && data.errorMessage.includes('expired or the notification and status are not yet available'))) {
        console.log('Token expired or not yet available, will retry...')
        lastError = data
        
        // If not the last attempt, wait before retrying
        if (attempt < MAX_RETRIES) {
          console.log(`Waiting ${RETRY_DELAY}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        }
      } else {
        // For other errors, don't retry
        console.error('Non-retryable Apple API error:', data)
        return new Response(
          JSON.stringify({ 
            error: data.errorMessage || data.error || 'Failed to check test notification status',
            errorCode: data.errorCode,
            details: data
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: response.status
          }
        )
      }
    }
    
    // If we exhausted all retries and still have an error
    if (lastError) {
      console.error('Failed after all retries:', lastError)
      return new Response(
        JSON.stringify({ 
          error: lastError.errorMessage || lastError.error || 'Test notification status not available after multiple retries',
          errorCode: lastError.errorCode,
          details: lastError,
          retriesExhausted: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: lastResponse?.status || 404
        }
      )
    }

    // Return the data directly, not nested under 'status'
    return new Response(
      JSON.stringify(lastData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Test status error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Status check failed'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})