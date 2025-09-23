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
  
  // Get request source IP (from headers or connection)
  const sourceIP = req.headers.get('x-forwarded-for') || 
                   req.headers.get('x-real-ip') || 
                   req.headers.get('cf-connecting-ip') || // Cloudflare
                   'unknown'
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let rawBody: string | null = null
  let body: any = null
  
  try {
    // Get raw body for persistence and validation
    rawBody = await req.text()
    
    // Parse request body
    body = JSON.parse(rawBody)
    const { signedPayload } = body

    if (!signedPayload) {
      console.error(`[${requestId}] ERROR: Missing signedPayload in request body`)
      throw new Error('Missing signedPayload in request body')
    }

    // Verify and decode the JWS
    const payload = await verifyAppleJWS(signedPayload)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Determine environment from payload and normalize it
    const environment = normalizeEnvironment(payload.data?.environment)
    
    // Decode signedTransactionInfo if present
    let decodedTransactionInfo = null
    if (payload.data?.signedTransactionInfo) {
      decodedTransactionInfo = await decodeSignedTransactionInfo(payload.data.signedTransactionInfo)
    }
    
    // Decode signedRenewalInfo if present
    let decodedRenewalInfo = null
    if (payload.data?.signedRenewalInfo) {
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
    
    // If this is a CONSUMPTION_REQUEST, store it in the dedicated table
    if (payload.notificationType === 'CONSUMPTION_REQUEST') {
      
      // Extract consumption request specific data
      const consumptionRequestReason = payload.data?.consumptionRequestReason?.reason || null
      const deadline = payload.data?.consumptionRequestReason?.deadline ? 
        new Date(payload.data.consumptionRequestReason.deadline).toISOString() : null
      
      const { data: consumptionWebhook, error: consumptionError } = await supabase
        .from('consumption_request_webhooks')
        .insert({
          request_id: requestId,
          source_ip: sourceIP,
          raw_body: rawBody,
          parsed_body: body,
          notification_type: payload.notificationType,
          subtype: payload.subtype,
          notification_uuid: payload.notificationUUID,
          decoded_payload: modifiedPayload,
          decoded_transaction_info: decodedTransactionInfo,
          original_transaction_id: decodedTransactionInfo?.originalTransactionId || decodedTransactionInfo?.transactionId,
          transaction_id: decodedTransactionInfo?.transactionId,
          product_id: decodedTransactionInfo?.productId,
          consumption_request_reason: consumptionRequestReason,
          deadline: deadline,
          environment: environment,
          processing_status: 'received'
        })
        .select()
        .single()
      
      if (consumptionError) {
        console.error(`[${requestId}] ERROR storing consumption request webhook:`, consumptionError)
        // Don't throw here, continue with normal processing
      }
    }
    
    // Store raw notification with decoded transaction info
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

    
    // Update consumption request webhook with notification_raw_id if it was a CONSUMPTION_REQUEST
    if (payload.notificationType === 'CONSUMPTION_REQUEST') {
      await supabase
        .from('consumption_request_webhooks')
        .update({
          notification_raw_id: notification.id,
          processing_status: 'stored'
        })
        .eq('request_id', requestId)
    }

    // Trigger asynchronous processing of the notification
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
    }).catch(error => {
      console.error(`[${requestId}] Failed to trigger notification processing:`, error)
    })

    const duration = Date.now() - startTime

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
    
    // Log failed request details for debugging
    console.error(`[${requestId}] Failed request details:`)
    console.error(`[${requestId}] - Source IP: ${sourceIP}`)
    if (rawBody) {
      console.error(`[${requestId}] - Raw body length: ${rawBody.length} bytes`)
    }
    
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
