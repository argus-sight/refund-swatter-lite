import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

const APPLE_API_BASE = {
  production: 'https://api.storekit.itunes.apple.com/inApps/v1',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authResult = await requireAuth(req)
    if (authResult.error) {
      return authResult.error
    }
    const { supabase, user } = authResult

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

    // Check test notification status
    const apiBase = APPLE_API_BASE[environment as keyof typeof APPLE_API_BASE] || APPLE_API_BASE.sandbox
    const apiUrl = `${apiBase}/notifications/test/${testNotificationToken}`
    
    const startTime = Date.now()
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`
      }
    })
    const endTime = Date.now()

    const data = await response.json()
    
    console.log('Apple status check response:', JSON.stringify(data, null, 2))
    
    // Log the API request to apple_api_logs table
    await supabaseAdmin.from('apple_api_logs').insert({
      endpoint: apiUrl,
      method: 'GET',
      request_body: null,
      response_status: response.status,
      response_body: data,
      response_time_ms: endTime - startTime,
      environment: environment,
      notes: `Test notification status check for token: ${testNotificationToken}`
    })

    if (!response.ok) {
      console.error('Apple API error:', data)
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

    // Return the data directly, not nested under 'status'
    return new Response(
      JSON.stringify(data),
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