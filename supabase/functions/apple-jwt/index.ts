import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as jose from 'https://deno.land/x/jose@v4.13.1/index.ts'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'

serve(async (req) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  console.log(`[${requestId}] ==> Apple JWT Generation Request Started`)
  console.log(`[${requestId}] Method: ${req.method}`)
  console.log(`[${requestId}] URL: ${req.url}`)
  
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) {
    console.log(`[${requestId}] CORS preflight request handled`)
    return corsResponse
  }

  // Verify authentication - only allow service role (internal calls)
  const auth = await verifyAuth(req, {
    allowServiceRole: true,
    requireAdmin: false  // Service role doesn't need admin check
  })

  if (!auth.isValid) {
    console.log(`[${requestId}] Authentication failed`)
    return auth.errorResponse!
  }

  console.log(`[${requestId}] Authenticated: ${auth.isServiceRole ? 'Service Role' : 'User'}`)

  try {
    // Parse request body if needed (not used in single-tenant setup)
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        console.log(`[${requestId}] Request body received (ignored in single-tenant mode)`)
      } catch (e) {
        console.log(`[${requestId}] No request body or invalid JSON`)
      }
    }
    
    // Initialize Supabase client
    console.log(`[${requestId}] Initializing Supabase client...`)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    console.log(`[${requestId}] Supabase client initialized`)

    // Get config from database - using config table (single tenant)
    console.log(`[${requestId}] Fetching Apple configuration from database...`)
    
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

    console.log(`[${requestId}] Configuration fetched successfully`)
    console.log(`[${requestId}] Issuer ID: ${config.apple_issuer_id ? 'Present' : 'Missing'}`)
    console.log(`[${requestId}] Key ID: ${config.apple_key_id ? 'Present' : 'Missing'}`)

    if (!config.apple_issuer_id || !config.apple_key_id) {
      console.error(`[${requestId}] ERROR: Apple credentials not properly configured`)
      console.error(`[${requestId}] Missing: ${!config.apple_issuer_id ? 'apple_issuer_id' : ''} ${!config.apple_key_id ? 'apple_key_id' : ''}`)
      throw new Error('Apple credentials not configured')
    }

    // Get private key from vault/database (single tenant)
    console.log(`[${requestId}] Retrieving Apple private key from vault`)
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

    console.log(`[${requestId}] Private key retrieved successfully`)
    console.log(`[${requestId}] Key length: ${privateKeyData.length} characters`)

    // Import the private key
    console.log(`[${requestId}] Importing private key for ES256 algorithm...`)
    let privateKey
    try {
      privateKey = await jose.importPKCS8(privateKeyData, 'ES256')
      console.log(`[${requestId}] ✓ Private key imported successfully`)
    } catch (importError) {
      console.error(`[${requestId}] ERROR importing private key:`, importError)
      throw new Error('Invalid private key format')
    }

    // Create JWT with Apple's required claims
    console.log(`[${requestId}] Creating JWT with Apple claims...`)
    console.log(`[${requestId}] JWT Header: { alg: 'ES256', kid: '${config.apple_key_id}', typ: 'JWT' }`)
    console.log(`[${requestId}] JWT Issuer: ${config.apple_issuer_id}`)
    console.log(`[${requestId}] JWT Bundle ID (bid): ${config.bundle_id}`)
    console.log(`[${requestId}] JWT Audience: appstoreconnect-v1`)
    console.log(`[${requestId}] JWT Expiration: 1 hour`)
    
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

    console.log(`[${requestId}] ✓ JWT generated successfully`)
    console.log(`[${requestId}] JWT length: ${jwt.length} characters`)
    
    // Decode to verify structure (for logging purposes only)
    const parts = jwt.split('.')
    if (parts.length === 3) {
      const header = JSON.parse(atob(parts[0]))
      const payload = JSON.parse(atob(parts[1]))
      console.log(`[${requestId}] JWT verification:`)
      console.log(`[${requestId}]   - Header algorithm: ${header.alg}`)
      console.log(`[${requestId}]   - Header key ID: ${header.kid}`)
      console.log(`[${requestId}]   - Payload issuer: ${payload.iss}`)
      console.log(`[${requestId}]   - Payload bundle ID (bid): ${payload.bid}`)
      console.log(`[${requestId}]   - Payload audience: ${payload.aud}`)
      console.log(`[${requestId}]   - Issued at: ${new Date(payload.iat * 1000).toISOString()}`)
      console.log(`[${requestId}]   - Expires at: ${new Date(payload.exp * 1000).toISOString()}`)
    }

    const duration = Date.now() - startTime
    console.log(`[${requestId}] ==> Request completed successfully`)
    console.log(`[${requestId}] Total processing time: ${duration}ms`)

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