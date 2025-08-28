import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProcessOptions {
  limit?: number
  notificationType?: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request options
    const options: ProcessOptions = req.method === 'POST' ? await req.json() : {}
    const limit = options.limit || 50
    const notificationType = options.notificationType

    // Query pending notifications
    let query = supabase
      .from('notifications_raw')
      .select('*')
      .eq('status', 'pending')
      .order('received_at', { ascending: true })
      .limit(limit)

    if (notificationType) {
      query = query.eq('notification_type', notificationType)
    }

    const { data: notifications, error: fetchError } = await query

    if (fetchError) {
      throw new Error(`Failed to fetch notifications: ${fetchError.message}`)
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ 
          processed: 0, 
          message: 'No pending notifications to process' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Process each notification
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as any[]
    }

    for (const notification of notifications) {
      try {
        await processNotification(supabase, notification)
        
        // Mark as processed
        const { error: updateError } = await supabase
          .from('notifications_raw')
          .update({ 
            status: 'processed',
            processed_at: new Date().toISOString()
          })
          .eq('id', notification.id)

        if (updateError) {
          throw new Error(`Failed to update status: ${updateError.message}`)
        }

        results.processed++
      } catch (error) {
        // Mark as failed
        await supabase
          .from('notifications_raw')
          .update({ 
            status: 'failed',
            error_message: error.message
          })
          .eq('id', notification.id)

        results.failed++
        results.errors.push({
          notificationId: notification.id,
          notificationType: notification.notification_type,
          error: error.message
        })
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.processed,
        failed: results.failed,
        total: notifications.length,
        errors: results.errors.length > 0 ? results.errors : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})

async function processNotification(supabase: any, notification: any) {
  const { notification_type, subtype, decoded_payload } = notification
  
  // Extract common transaction info if available
  const transactionInfo = decoded_payload?.data?.signedTransactionInfo

  switch (notification_type) {
    // ===== Core Types (Priority 1) =====
    case 'REFUND':
      await processRefund(supabase, notification, transactionInfo)
      break

    case 'CONSUMPTION_REQUEST':
      await processConsumptionRequest(supabase, notification, decoded_payload.data)
      break

    case 'SUBSCRIBED':
      await processSubscribed(supabase, notification, transactionInfo, subtype)
      break

    case 'DID_RENEW':
      await processRenewal(supabase, notification, transactionInfo, subtype)
      break

    case 'ONE_TIME_CHARGE':
      await processOneTimeCharge(supabase, notification, transactionInfo)
      break

    // ===== Subscription Status Changes (Priority 1) =====
    case 'DID_CHANGE_RENEWAL_STATUS':
      await processRenewalStatusChange(supabase, notification, transactionInfo, subtype)
      break

    case 'EXPIRED':
      await processExpired(supabase, notification, transactionInfo, subtype)
      break

    // ===== Billing Issues (Priority 2) =====
    case 'DID_FAIL_TO_RENEW':
      await processFailedRenewal(supabase, notification, transactionInfo, subtype)
      break

    case 'GRACE_PERIOD_EXPIRED':
      await processGracePeriodExpired(supabase, notification, transactionInfo)
      break

    // ===== Refund Extensions (Priority 2) =====
    case 'REFUND_DECLINED':
      await processRefundDeclined(supabase, notification, transactionInfo)
      break

    case 'REFUND_REVERSED':
      await processRefundReversed(supabase, notification, transactionInfo)
      break

    // ===== Subscription Changes (Priority 2) =====
    case 'DID_CHANGE_RENEWAL_PREF':
      await processRenewalPrefChange(supabase, notification, transactionInfo, subtype)
      break

    // ===== Marketing (Priority 3) =====
    case 'OFFER_REDEEMED':
      await processOfferRedeemed(supabase, notification, transactionInfo, subtype)
      break

    case 'PRICE_INCREASE':
      await processPriceIncrease(supabase, notification, transactionInfo, subtype)
      break

    // ===== Other Types =====
    case 'TEST':
      console.log('Test notification received')
      break

    case 'REVOKE':
      await processRevoke(supabase, notification, transactionInfo)
      break

    default:
      console.log(`Unhandled notification type: ${notification_type}`)
  }
}

// ===== Processing Functions =====

async function processRefund(supabase: any, notification: any, transactionInfo: any) {
  if (!transactionInfo) return

  // For refunds, use originalTransactionId if available, otherwise use transactionId
  const originalTransactionId = transactionInfo.originalTransactionId || transactionInfo.transactionId

  const refundData = {
    transaction_id: transactionInfo.transactionId,
    original_transaction_id: originalTransactionId,
    refund_date: transactionInfo.revocationDate ? 
      new Date(transactionInfo.revocationDate).toISOString() : 
      new Date().toISOString(),
    refund_amount: transactionInfo.price ? transactionInfo.price / 1000 : null,
    refund_reason: transactionInfo.revocationReason || null
  }

  const { error } = await supabase
    .from('refunds')
    .upsert(refundData, { 
      onConflict: 'transaction_id',
      ignoreDuplicates: true 
    })

  if (error) throw new Error(`Failed to process refund: ${error.message}`)
}

async function processConsumptionRequest(supabase: any, notification: any, data: any) {
  const consumptionData = {
    notification_id: notification.id,
    original_transaction_id: data.consumptionRequestReason?.originalTransactionId || data.originalTransactionId,
    consumption_request_reason: data.consumptionRequestReason?.reason || null,
    request_date: new Date().toISOString(),
    deadline: data.consumptionRequestReason?.deadline ? 
      new Date(data.consumptionRequestReason.deadline).toISOString() : 
      new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // Default 12 hours
    status: 'pending'
  }

  // Insert consumption request
  const { data: consumptionRequest, error: insertError } = await supabase
    .from('consumption_requests')
    .insert(consumptionData)
    .select()
    .single()

  if (insertError) throw new Error(`Failed to create consumption request: ${insertError.message}`)

  // Create send job
  const jobData = {
    consumption_request_id: consumptionRequest.id,
    status: 'pending',
    scheduled_at: new Date().toISOString()
  }

  const { error: jobError } = await supabase
    .from('send_consumption_jobs')
    .insert(jobData)

  if (jobError) throw new Error(`Failed to create send job: ${jobError.message}`)
}

async function processSubscribed(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  if (!transactionInfo) return

  // For initial subscriptions, originalTransactionId might be null or same as transactionId
  const originalTransactionId = transactionInfo.originalTransactionId || transactionInfo.transactionId

  const transactionData = {
    transaction_id: transactionInfo.transactionId,
    original_transaction_id: originalTransactionId,
    product_id: transactionInfo.productId,
    product_type: transactionInfo.type,
    purchase_date: transactionInfo.purchaseDate ? 
      new Date(transactionInfo.purchaseDate).toISOString() : null,
    original_purchase_date: transactionInfo.originalPurchaseDate ?
      new Date(transactionInfo.originalPurchaseDate).toISOString() : null,
    expiration_date: transactionInfo.expiresDate ?
      new Date(transactionInfo.expiresDate).toISOString() : null,
    price: transactionInfo.price ? transactionInfo.price / 1000 : null,
    currency: transactionInfo.currency,
    app_account_token: transactionInfo.appAccountToken,
    environment: transactionInfo.environment
  }

  const { error } = await supabase
    .from('transactions')
    .upsert(transactionData, { 
      onConflict: 'transaction_id'
    })

  if (error) throw new Error(`Failed to process subscription: ${error.message}`)
}

async function processRenewal(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  // Same as processSubscribed for renewals
  await processSubscribed(supabase, notification, transactionInfo, subtype)
}

async function processOneTimeCharge(supabase: any, notification: any, transactionInfo: any) {
  // Same as processSubscribed for one-time purchases
  await processSubscribed(supabase, notification, transactionInfo, null)
}

async function processRenewalStatusChange(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  if (!transactionInfo) return

  const originalTransactionId = transactionInfo.originalTransactionId || transactionInfo.transactionId

  // Update transaction with renewal status
  const updateData: any = {
    updated_at: new Date().toISOString()
  }

  // Track auto-renewal status in a custom field if needed
  // For now, just update the timestamp to track the change

  const { error } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('original_transaction_id', originalTransactionId)

  if (error) throw new Error(`Failed to update renewal status: ${error.message}`)
}

async function processExpired(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  if (!transactionInfo) return

  const originalTransactionId = transactionInfo.originalTransactionId || transactionInfo.transactionId

  // Update transaction expiration
  const { error } = await supabase
    .from('transactions')
    .update({
      expiration_date: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('original_transaction_id', originalTransactionId)

  if (error) throw new Error(`Failed to process expiration: ${error.message}`)
}

async function processFailedRenewal(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  // Log failed renewal attempt
  console.log(`Failed renewal for transaction: ${transactionInfo?.originalTransactionId}, subtype: ${subtype}`)
}

async function processGracePeriodExpired(supabase: any, notification: any, transactionInfo: any) {
  // Log grace period expiration
  console.log(`Grace period expired for transaction: ${transactionInfo?.originalTransactionId}`)
}

async function processRefundDeclined(supabase: any, notification: any, transactionInfo: any) {
  // Log declined refund
  console.log(`Refund declined for transaction: ${transactionInfo?.originalTransactionId}`)
}

async function processRefundReversed(supabase: any, notification: any, transactionInfo: any) {
  if (!transactionInfo) return

  // Remove the refund record or mark it as reversed
  const { error } = await supabase
    .from('refunds')
    .delete()
    .eq('transaction_id', transactionInfo.transactionId)

  if (error) {
    console.error(`Failed to reverse refund: ${error.message}`)
  }
}

async function processRenewalPrefChange(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  // Log preference change
  console.log(`Renewal preference changed: ${subtype} for transaction: ${transactionInfo?.originalTransactionId}`)
}

async function processOfferRedeemed(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  // Process offer redemption
  await processSubscribed(supabase, notification, transactionInfo, subtype)
}

async function processPriceIncrease(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  // Log price increase notification
  console.log(`Price increase notification: ${subtype} for transaction: ${transactionInfo?.originalTransactionId}`)
}

async function processRevoke(supabase: any, notification: any, transactionInfo: any) {
  // Handle family sharing revocation
  console.log(`Family sharing revoked for transaction: ${transactionInfo?.originalTransactionId}`)
}