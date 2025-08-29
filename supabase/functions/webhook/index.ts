import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as jose from 'https://deno.land/x/jose@v4.13.1/index.ts'
import { AppleEnvironment, normalizeEnvironment, NotificationStatus, NotificationSource } from '../_shared/constants.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function verifyAppleJWS(signedPayload: string): Promise<any> {
  try {
    console.log('Verifying Apple JWS signature...')
    
    const parts = signedPayload.split('.')
    if (parts.length !== 3) {
      throw new Error(`Invalid JWT format: expected 3 parts, got ${parts.length}`)
    }
    
    const header = JSON.parse(atob(parts[0]))
    
    if (!header.x5c || !Array.isArray(header.x5c) || header.x5c.length === 0) {
      throw new Error('Missing x5c certificate chain in JWT header')
    }
    
    const leafCertBase64 = header.x5c[0]
    const certPem = `-----BEGIN CERTIFICATE-----\n${leafCertBase64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`
    
    const publicKey = await jose.importX509(certPem, header.alg || 'ES256')
    
    const { payload } = await jose.jwtVerify(signedPayload, publicKey, {
      algorithms: ['ES256', 'RS256'],
      clockTolerance: 60
    })
    
    console.log('Apple JWS signature verified successfully')
    return payload
  } catch (error) {
    console.error('Apple JWS verification failed:', error)
    throw new Error(`Apple JWS verification failed: ${error.message}`)
  }
}

async function decodeSignedTransactionInfo(signedTransactionInfo: string): Promise<any> {
  try {
    // signedTransactionInfo is also a JWT, decode it without verification
    // (verification already done at the outer level)
    const parts = signedTransactionInfo.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid transaction JWT format')
    }
    
    // Decode the payload (middle part)
    const payload = JSON.parse(atob(parts[1]))
    return payload
  } catch (error) {
    console.error('Failed to decode signedTransactionInfo:', error)
    return null
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  console.log(`[${requestId}] ==> Webhook Request Started`)
  console.log(`[${requestId}] Method: ${req.method}`)
  console.log(`[${requestId}] URL: ${req.url}`)
  console.log(`[${requestId}] Headers:`, Object.fromEntries(req.headers.entries()))
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] CORS preflight request handled`)
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    console.log(`[${requestId}] Parsing request body...`)
    const body = await req.json()
    const { signedPayload } = body
    
    console.log(`[${requestId}] Request body parsed successfully`)
    console.log(`[${requestId}] Body keys:`, Object.keys(body))

    console.log(`[${requestId}] Apple Store Server Notification received`)

    if (!signedPayload) {
      console.error(`[${requestId}] ERROR: Missing signedPayload in request body`)
      throw new Error('Missing signedPayload in request body')
    }

    // Verify and decode the JWS
    console.log(`[${requestId}] Starting JWS verification...`)
    const payload = await verifyAppleJWS(signedPayload)
    console.log(`[${requestId}] JWS verified successfully`)
    console.log(`[${requestId}] Notification type: ${payload.notificationType}`)
    console.log(`[${requestId}] Subtype: ${payload.subtype || 'N/A'}`)
    console.log(`[${requestId}] Notification UUID: ${payload.notificationUUID}`)
    console.log(`[${requestId}] Environment: ${payload.data?.environment || 'Unknown'}`)
    
    // Initialize Supabase client
    console.log(`[${requestId}] Initializing Supabase client...`)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    console.log(`[${requestId}] Supabase client initialized`)

    // Determine environment from payload and normalize it
    const environment = normalizeEnvironment(payload.data?.environment)
    console.log(`[${requestId}] Environment determined: ${environment}`)
    
    // Decode signedTransactionInfo if present
    let decodedTransactionInfo = null
    if (payload.data?.signedTransactionInfo) {
      console.log(`[${requestId}] Decoding signedTransactionInfo...`)
      decodedTransactionInfo = await decodeSignedTransactionInfo(payload.data.signedTransactionInfo)
      if (decodedTransactionInfo) {
        console.log(`[${requestId}] Transaction ID: ${decodedTransactionInfo.transactionId}`)
        console.log(`[${requestId}] Original Transaction ID: ${decodedTransactionInfo.originalTransactionId || 'N/A'}`)
        console.log(`[${requestId}] Product ID: ${decodedTransactionInfo.productId}`)
      }
    }
    
    // Decode signedRenewalInfo if present
    let decodedRenewalInfo = null
    if (payload.data?.signedRenewalInfo) {
      console.log(`[${requestId}] Decoding signedRenewalInfo...`)
      try {
        const parts = payload.data.signedRenewalInfo.split('.')
        if (parts.length === 3) {
          decodedRenewalInfo = JSON.parse(atob(parts[1]))
        }
      } catch (error) {
        console.error(`[${requestId}] Failed to decode signedRenewalInfo:`, error)
      }
    }
    
    // Extract signed date from payload
    const signedDate = payload.signedDate ? new Date(payload.signedDate) : null
    
    // Create modified payload with decoded transaction info
    const modifiedPayload = {
      ...payload,
      data: {
        ...payload.data,
        signedTransactionInfo: decodedTransactionInfo, // Replace JWT with decoded object
        signedRenewalInfo: decodedRenewalInfo // Replace JWT with decoded object if present
      }
    }
    
    // Store raw notification with decoded transaction info
    console.log(`[${requestId}] Storing raw notification in database...`)
    const { data: notification, error: notificationError } = await supabase
      .from('notifications_raw')
      .insert({
        notification_type: payload.notificationType,
        subtype: payload.subtype,
        notification_uuid: payload.notificationUUID,
        signed_payload: signedPayload,
        decoded_payload: modifiedPayload, // Store modified payload with decoded transaction info
        decoded_transaction_info: decodedTransactionInfo, // Also store separately for easy access
        environment: environment,
        status: NotificationStatus.PENDING,
        source: NotificationSource.WEBHOOK, // Mark as coming from webhook
        signed_date: signedDate
      })
      .select()
      .single()

    if (notificationError) {
      console.error(`[${requestId}] ERROR storing notification:`, notificationError)
      console.error(`[${requestId}] Error details:`, JSON.stringify(notificationError, null, 2))
      throw notificationError
    }

    console.log(`[${requestId}] ✓ Notification stored successfully`)
    console.log(`[${requestId}] Notification ID: ${notification.id}`)

    // Trigger asynchronous processing of the notification
    console.log(`[${requestId}] Triggering notification processing...`)
    const processUrl = `${supabaseUrl}/functions/v1/process-notifications`
    
    // Fire and forget - don't wait for processing to complete
    fetch(processUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        limit: 10  // Process up to 10 pending notifications
      })
    }).then(() => {
      console.log(`[${requestId}] Notification processing triggered successfully`)
    }).catch(error => {
      console.error(`[${requestId}] Failed to trigger notification processing:`, error)
    })

    const duration = Date.now() - startTime
    console.log(`[${requestId}] ==> Request completed successfully`)
    console.log(`[${requestId}] Total processing time: ${duration}ms`)
    console.log(`[${requestId}] Returning success response with notification ID: ${notification.id}`)

    return new Response(
      JSON.stringify({ success: true, id: notification.id, requestId, processingTime: duration }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[${requestId}] ==> ERROR in webhook processing`)
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})