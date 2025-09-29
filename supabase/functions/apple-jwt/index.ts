import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as jose from 'https://deno.land/x/jose@v4.13.1/index.ts'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'

serve(async (req) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  // Verify authentication - only allow service role (internal calls)
  const auth = await verifyAuth(req, {
    allowServiceRole: true,
    requireAdmin: false  // Service role doesn't need admin check
  })

  if (!auth.isValid || !auth.isServiceRole) {
    return auth.errorResponse!
  }
  try {
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    // Get config from database - using config table (single tenant)
    const { data: config, error: configError } = await supabase
      .from('config')
      .select('bundle_id, apple_issuer_id, apple_key_id')
      .eq('id', 1)
      .single()

    if (configError) {
      console.error(`[${requestId}] ERROR fetching config:`, configError)
      throw new Error('Configuration fetch failed')
    }

    if (!config) {
      console.error(`[${requestId}] ERROR: No configuration found in database`)
      throw new Error('Configuration not found')
    }
    if (!config.apple_issuer_id || !config.apple_key_id) {
      console.error(`[${requestId}] ERROR: Apple credentials not properly configured`)
      console.error(`[${requestId}] Missing: ${!config.apple_issuer_id ? 'apple_issuer_id' : ''} ${!config.apple_key_id ? 'apple_key_id' : ''}`)
      throw new Error('Apple credentials not configured')
    }

    // Get private key from vault/database (single tenant)
    const { data: privateKeyData, error: keyError } = await supabase
      .rpc('get_apple_private_key')

    if (keyError) {
      console.error(`[${requestId}] ERROR retrieving private key:`, keyError)
      console.error(`[${requestId}] Error details:`, JSON.stringify(keyError, null, 2))
      throw new Error('Failed to retrieve Apple private key')
    }

    if (!privateKeyData) {
      console.error(`[${requestId}] ERROR: Private key data is empty`)
      throw new Error('Private key not found')
    }
    // Import the private key
    let privateKey
    try {
      privateKey = await jose.importPKCS8(privateKeyData, 'ES256')
    } catch (importError) {
      console.error(`[${requestId}] ERROR importing private key:`, importError)
      throw new Error('Invalid private key format')
    }

    // Create JWT with Apple's required claims
    const jwt = await new jose.SignJWT({ bid: config.bundle_id })
      .setProtectedHeader({ 
        alg: 'ES256',
        kid: config.apple_key_id,
        typ: 'JWT'
      })
      .setIssuer(config.apple_issuer_id)
      .setIssuedAt()
      .setExpirationTime('1h')
      .setAudience('appstoreconnect-v1')
      .sign(privateKey)

    const duration = Date.now() - startTime
    return new Response(
      JSON.stringify({ 
        jwt,
        requestId,
        processingTime: duration 
      }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[${requestId}] ==> ERROR generating Apple JWT`)
    console.error(`[${requestId}] Error type: ${error.name}`)
    console.error(`[${requestId}] Error message: ${error.message}`)
    console.error(`[${requestId}] Error stack:`, error.stack)
    console.error(`[${requestId}] Processing time before error: ${duration}ms`)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        requestId,
        errorType: error.name,
        processingTime: duration
      }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})