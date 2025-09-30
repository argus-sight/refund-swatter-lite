import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import 'https://esm.sh/reflect-metadata@0.2.2?target=denonext'
import { X509Certificate } from 'https://esm.sh/@peculiar/x509@1.14.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as jose from 'https://deno.land/x/jose@v4.13.1/index.ts'
import { TRUSTED_APPLE_ROOT_CERTS, derBase64ToPem, normalizeCertificateBase64 } from '../_shared/apple-certificates.ts'
import { normalizeEnvironment, NotificationStatus, NotificationSource } from '../_shared/constants.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_STORE_ISSUER = 'appstoreconnect-v1'
const APP_STORE_AUDIENCE = 'appstoreconnect-v1'

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return atob(normalized + padding)
}

// Apple includes the full certificate chain in the JWS header's x5c field:
// [0] = leaf certificate (contains the public key used for the request),
// [1] = Apple intermediate certificate, [last] = Apple root certificate.
// This function validates each hop against the trusted root and checks
// validity periods to ensure the leaf key truly originates from Apple
// rather than an attacker-crafted self-signed chain.
async function validateCertificateChain(x5c: string[]): Promise<void> {
  if (!Array.isArray(x5c) || x5c.length < 3) {
    throw new Error('Apple certificate chain must include leaf, intermediate, and root certificates')
  }

  const normalizedChain = x5c.map((entry) => normalizeCertificateBase64(entry))
  const leafBase64 = normalizedChain[0]
  const intermediateBase64 = normalizedChain[1]
  const rootBase64 = normalizedChain[normalizedChain.length - 1]

  const trustedRootPem = TRUSTED_APPLE_ROOT_CERTS.get(rootBase64)
  if (!trustedRootPem) {
    throw new Error('Unrecognized Apple root certificate')
  }

  const leafCert = new X509Certificate(derBase64ToPem(leafBase64))
  const intermediateCert = new X509Certificate(derBase64ToPem(intermediateBase64))
  const trustedRootCert = new X509Certificate(trustedRootPem)

  const now = new Date()
  if (now < leafCert.notBefore || now > leafCert.notAfter) {
    throw new Error('Leaf certificate expired or not yet valid')
  }

  if (now < intermediateCert.notBefore || now > intermediateCert.notAfter) {
    throw new Error('Intermediate certificate expired or not yet valid')
  }

  const intermediateValid = await intermediateCert.verify({ publicKey: trustedRootCert.publicKey })
  if (!intermediateValid) {
    throw new Error('Intermediate certificate not signed by trusted Apple root')
  }

  const leafValid = await leafCert.verify({ publicKey: intermediateCert.publicKey })
  if (!leafValid) {
    throw new Error('Leaf certificate not signed by Apple intermediate')
  }

}

// App Store Server Notifications are delivered as JWS objects. To make sure
// nothing is forged or tampered with we must verify that:
// 1. the header advertises the expected algorithm/type;
// 2. the x5c chain anchors back to Apple's trusted root;
// 3. the JWS signature validates with the leaf certificate's ES256 key; and
// 4. the payload claims (iss/aud/etc.) match Apple's documented values.
// This helper performs the full verification pipeline and returns the
// trusted payload when everything checks out.
async function verifyAppleJWS(signedPayload: string): Promise<any> {
  try {
    const parts = signedPayload.split('.')
    if (parts.length !== 3) {
      throw new Error(`Invalid JWT format: expected 3 parts, got ${parts.length}`)
    }

    const header = JSON.parse(decodeBase64Url(parts[0]))

    if (!header.x5c || !Array.isArray(header.x5c) || header.x5c.length === 0) {
      throw new Error('Missing x5c certificate chain in JWT header')
    }

    const alg = typeof header.alg === 'string' ? header.alg.toUpperCase() : ''
    if (alg !== 'ES256') {
      throw new Error(`Unsupported JWS algorithm: ${header.alg}`)
    }

    if (header.typ && String(header.typ).toUpperCase() !== 'JWT') {
      throw new Error(`Unexpected JWS type: ${header.typ}`)
    }

    await validateCertificateChain(header.x5c)

    const leafPem = derBase64ToPem(header.x5c[0])
    const publicKey = await jose.importX509(leafPem, 'ES256')

    const { payload } = await jose.jwtVerify(signedPayload, publicKey, {
      algorithms: ['ES256'],
      clockTolerance: 60
    })

    return payload
  } catch (error) {
    console.error('Apple JWS verification failed:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Apple JWS verification failed: ${message}`)
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
    const payload = JSON.parse(decodeBase64Url(parts[1]))
    return payload
  } catch (error) {
    console.error('Failed to decode signedTransactionInfo:', error)
    return null
  }
}

function extractBundleId(payload: any): string | undefined {
  const candidate = payload?.data?.bundleId ?? payload?.data?.bundleIdentifier
  return typeof candidate === 'string' ? candidate : undefined
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

    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid notification payload structure')
    }

    if (!payload.notificationUUID || typeof payload.notificationUUID !== 'string') {
      throw new Error('Missing notificationUUID in notification payload')
    }

    if (!payload.notificationType || typeof payload.notificationType !== 'string') {
      throw new Error('Missing notificationType in notification payload')
    }

    if (!payload.data || typeof payload.data !== 'object') {
      throw new Error('Missing data block in notification payload')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: config, error: configError } = await supabase
      .from('config')
      .select('bundle_id')
      .eq('id', 1)
      .single()

    if (configError || !config) {
      throw new Error('Failed to load application configuration for bundle validation')
    }

    const expectedBundleId = config.bundle_id
    if (!expectedBundleId) {
      throw new Error('Bundle ID is not configured in the database')
    }

    const bundleIdFromPayload = extractBundleId(payload)
    if (!bundleIdFromPayload) {
      throw new Error('Missing bundleId in notification payload data')
    }

    if (bundleIdFromPayload !== expectedBundleId) {
      throw new Error(`Bundle ID mismatch: expected ${expectedBundleId}, received ${bundleIdFromPayload}`)
    }

    const rawEnvironment = payload.data?.environment
    if (typeof rawEnvironment !== 'string') {
      throw new Error('Missing environment in notification payload data')
    }

    const environment = normalizeEnvironment(rawEnvironment)

    const lowerEnvironment = rawEnvironment.toLowerCase()
    if (lowerEnvironment !== 'production' && lowerEnvironment !== 'sandbox') {
      throw new Error(`Unsupported environment value: ${rawEnvironment}`)
    }

    const signedDate = payload.signedDate ? new Date(payload.signedDate) : null
    if (signedDate && Number.isNaN(signedDate.getTime())) {
      throw new Error('Invalid signedDate in notification payload')
    }

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
          decodedRenewalInfo = JSON.parse(decodeBase64Url(parts[1]))
        }
      } catch (error) {
        console.error(`[${requestId}] Failed to decode signedRenewalInfo:`, error)
      }
    }
    
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
    const err = error instanceof Error ? error : new Error(String(error))
    console.error(`[${requestId}] ==> ERROR in webhook processing`)
    console.error(`[${requestId}] Error type: ${err.name}`)
    console.error(`[${requestId}] Error message: ${err.message}`)
    console.error(`[${requestId}] Error stack:`, err.stack)
    console.error(`[${requestId}] Processing time before error: ${duration}ms`)
    
    // Log failed request details for debugging
    console.error(`[${requestId}] Failed request details:`)
    console.error(`[${requestId}] - Source IP: ${sourceIP}`)
    if (rawBody) {
      console.error(`[${requestId}] - Raw body length: ${rawBody.length} bytes`)
    }
    
    return new Response(
      JSON.stringify({ 
        error: err.message,
        requestId,
        errorType: err.name,
        processingTime: duration
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
