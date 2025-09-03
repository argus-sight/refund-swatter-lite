import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

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
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header present:', !!authHeader)
    console.log('Auth header format:', authHeader ? authHeader.substring(0, 20) + '...' : 'none')
    
    if (!authHeader) {
      console.log('No authorization header found')
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    // Extract the token from the Authorization header
    const token = authHeader.replace('Bearer ', '')
    console.log('Token extracted, length:', token.length)
    
    // Create Supabase client and verify the user's token
    console.log('Creating Supabase client for user verification')
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey)
    
    // Verify the user is authenticated using the token directly
    console.log('Verifying user token...')
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(token)
    
    if (authError) {
      console.error('Auth error:', authError.message)
      console.error('Auth error details:', authError)
    }
    
    if (!user) {
      console.log('No user found from token')
    } else {
      console.log('User authenticated:', user.id)
    }
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid or expired token',
          details: authError?.message || 'No user found'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 405
        }
      )
    }

    const { environment } = await req.json()
    
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Get config from config table (single tenant)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: config, error: configError } = await supabaseAdmin
      .from('config')
      .select('id, bundle_id, apple_issuer_id, apple_key_id')
      .eq('id', 1)
      .single()

    if (configError || !config) {
      console.error('Config error:', configError)
      throw new Error('Configuration not found')
    }
    
    console.log('Config loaded:', {
      bundle_id: config.bundle_id,
      apple_issuer_id: config.apple_issuer_id,
      apple_key_id: config.apple_key_id
    })
    
    // Get Apple JWT
    console.log('Calling apple-jwt function at:', `${supabaseUrl}/functions/v1/apple-jwt`)
    const jwtResponse = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })

    console.log('JWT response status:', jwtResponse.status)
    
    const responseText = await jwtResponse.text()
    console.log('JWT response text:', responseText)
    
    if (!jwtResponse.ok) {
      console.error('JWT generation failed:', responseText)
      throw new Error('Failed to generate Apple JWT')
    }

    // Try to parse the response
    let jwtData
    try {
      jwtData = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse JWT response:', parseError)
      console.error('Response was:', responseText)
      throw new Error('Invalid JWT response format')
    }
    
    const { jwt } = jwtData
    
    // Decode and log JWT content for debugging
    try {
      const jwtParts = jwt.split('.')
      const header = JSON.parse(atob(jwtParts[0]))
      const payload = JSON.parse(atob(jwtParts[1]))
      console.log('JWT Header:', JSON.stringify(header, null, 2))
      console.log('JWT Payload:', JSON.stringify(payload, null, 2))
      console.log('Bundle ID from config:', config.bundle_id)
    } catch (decodeError) {
      console.error('Failed to decode JWT for logging:', decodeError)
    }

    // Send test notification request to Apple
    const apiBase = APPLE_API_BASE[environment as keyof typeof APPLE_API_BASE] || APPLE_API_BASE.sandbox
    const apiUrl = `${apiBase}/notifications/test`
    const requestBody = {
      bundleId: config.bundle_id
    }
    
    console.log('Sending test notification to Apple:', apiUrl)
    const startTime = Date.now()
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
    const endTime = Date.now()

    console.log('Apple API response status:', response.status)
    const appleResponseText = await response.text()
    console.log('Apple API response body:', appleResponseText || '(empty)')
    
    // Log the API request to apple_api_logs table
    let responseBody = null
    if (appleResponseText) {
      try {
        responseBody = JSON.parse(appleResponseText)
      } catch (e) {
        // If response is not JSON, store as text in an object
        responseBody = { raw: appleResponseText }
      }
    }
    
    await supabaseAdmin.from('apple_api_logs').insert({
      endpoint: apiUrl,
      method: 'POST',
      request_body: requestBody,
      response_status: response.status,
      response_body: responseBody,
      response_time_ms: endTime - startTime,
      environment: environment,
      notes: 'Test notification request'
    })
    
    // Handle empty response for 401 errors
    if (response.status === 401) {
      console.error('Authentication failed. JWT may be invalid or Apple credentials are incorrect.')
      console.log('JWT used:', jwt.substring(0, 50) + '...')
      return new Response(
        JSON.stringify({ 
          error: 'Apple API authentication failed. Please check your Apple credentials (Issuer ID, Key ID, and Private Key).',
          errorCode: 'AUTH_FAILED',
          details: {
            status: 401,
            message: 'Authentication failed'
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }
    
    let data = null
    if (appleResponseText) {
      try {
        data = JSON.parse(appleResponseText)
      } catch (parseError) {
        console.error('Failed to parse Apple API response:', parseError)
        console.error('Response was:', appleResponseText)
        return new Response(
          JSON.stringify({ 
            error: 'Invalid Apple API response format',
            details: {
              status: response.status,
              responseText: appleResponseText
            }
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 502
          }
        )
      }
    }

    if (!response.ok) {
      console.error('Apple API error:', data)
      return new Response(
        JSON.stringify({ 
          error: data?.errorMessage || data?.error || `Apple API error: ${response.status} ${response.statusText}`,
          errorCode: data?.errorCode,
          details: data
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: response.status
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        testNotificationToken: data.testNotificationToken
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Test webhook error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Test failed'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})