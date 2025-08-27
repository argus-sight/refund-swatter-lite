import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as jose from 'https://deno.land/x/jose@v4.13.1/index.ts'

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

    // Determine environment from payload
    const environment = payload.data?.environment || 'Production'
    console.log(`[${requestId}] Environment determined: ${environment}`)
    
    // Store raw notification
    console.log(`[${requestId}] Storing raw notification in database...`)
    const { data: notification, error: notificationError } = await supabase
      .from('notifications_raw')
      .insert({
        notification_type: payload.notificationType,
        subtype: payload.subtype,
        notification_uuid: payload.notificationUUID,
        signed_payload: signedPayload,
        decoded_payload: payload,
        environment: environment,
        status: 'pending'
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

    // Process based on notification type
    if (payload.notificationType === 'CONSUMPTION_REQUEST') {
      console.log(`[${requestId}] >>> Processing CONSUMPTION_REQUEST`)
      
      const transactionInfo = payload.data?.transactionInfo || {}
      const consumptionRequestReason = payload.data?.consumptionRequestReason
      console.log(`[${requestId}] Original Transaction ID: ${transactionInfo.originalTransactionId}`)
      console.log(`[${requestId}] Consumption Request Reason: ${consumptionRequestReason}`)
      
      // Create consumption request
      const deadline = new Date()
      deadline.setHours(deadline.getHours() + 12) // 12 hour deadline
      
      const { data: consumptionRequest, error: requestError } = await supabase
        .from('consumption_requests')
        .insert({
          notification_id: notification.id,
          original_transaction_id: transactionInfo.originalTransactionId,
          consumption_request_reason: consumptionRequestReason,
          request_date: new Date().toISOString(),
          deadline: deadline.toISOString(),
          status: 'pending'
        })
        .select()
        .single()

      if (requestError) {
        console.error('Error creating consumption request:', requestError)
        throw requestError
      }

      console.log('Consumption request created:', consumptionRequest.id)
      
      // Process the consumption request
      const { error: processError } = await supabase
        .rpc('process_consumption_request', {
          p_request_id: consumptionRequest.id
        })

      if (processError) {
        console.error('Error processing consumption request:', processError)
      }
    } else {
      // Process other notification types (store transaction data, refunds, etc.)
      const transactionInfo = payload.data?.transactionInfo || {}
      
      if (transactionInfo.transactionId) {
        // Store or update transaction
        const { error: transactionError } = await supabase
          .from('transactions')
          .upsert({
            transaction_id: transactionInfo.transactionId,
            original_transaction_id: transactionInfo.originalTransactionId,
            product_id: transactionInfo.productId,
            product_type: transactionInfo.type,
            purchase_date: transactionInfo.purchaseDate ? new Date(transactionInfo.purchaseDate).toISOString() : null,
            original_purchase_date: transactionInfo.originalPurchaseDate ? new Date(transactionInfo.originalPurchaseDate).toISOString() : null,
            expiration_date: transactionInfo.expiresDate ? new Date(transactionInfo.expiresDate).toISOString() : null,
            price: transactionInfo.price ? transactionInfo.price / 1000 : null, // Apple sends in milliunits
            currency: transactionInfo.currency,
            quantity: transactionInfo.quantity || 1,
            app_account_token: transactionInfo.appAccountToken,
            in_app_ownership_type: transactionInfo.inAppOwnershipType,
            environment: environment
          })

        if (transactionError) {
          console.error('Error storing transaction:', transactionError)
        }
      }
      
      // Handle refunds
      if (payload.notificationType === 'REFUND' || payload.notificationType === 'REFUND_DECLINED') {
        const { error: refundError } = await supabase
          .from('refunds')
          .insert({
            transaction_id: transactionInfo.transactionId,
            original_transaction_id: transactionInfo.originalTransactionId,
            refund_date: new Date().toISOString(),
            refund_amount: transactionInfo.price ? transactionInfo.price / 1000 : null,
            refund_reason: transactionInfo.transactionReason || payload.notificationType
          })

        if (refundError) {
          console.error('Error storing refund:', refundError)
        }
      }
    }

    // Update notification as processed
    console.log(`[${requestId}] Updating notification status to processed...`)
    const { error: updateError } = await supabase
      .from('notifications_raw')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString()
      })
      .eq('id', notification.id)
    
    if (updateError) {
      console.error(`[${requestId}] WARNING: Failed to update notification status:`, updateError)
    } else {
      console.log(`[${requestId}] ✓ Notification status updated to processed`)
    }

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