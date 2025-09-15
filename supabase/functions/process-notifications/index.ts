import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'


serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  try {
    // Verify authentication - allow service role for internal calls
    const auth = await verifyAuth(req, {
      allowServiceRole: true,
      requireAdmin: true
    })

    if (!auth.isValid) {
      return auth.errorResponse!
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request options
    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const isInvocationPath = pathSegments[pathSegments.length - 1] === 'process-notifications'
    
    if (!isInvocationPath) {
      return new Response(
        JSON.stringify({ error: 'Invalid path' }),
        { 
          status: 404,
          headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        }
      )
    }

    // Check for specific notification types in query params
    const notificationType = url.searchParams.get('notificationType')
    const notificationId = url.searchParams.get('notificationId')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    // Query pending notifications
    let query = supabase
      .from('notifications_raw')
      .select('*')
      .in('status', ['pending', 'failed'])
      .order('received_at', { ascending: true })
      .limit(limit)

    if (notificationType) {
      query = query.eq('notification_type', notificationType)
    }

    if (notificationId) {
      query = query.eq('id', notificationId)
    }

    console.log('Processing notifications:', { notificationType, notificationId, limit })

    const { data: notifications, error: fetchError } = await query

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notifications', details: fetchError.message }),
        { 
          status: 500,
          headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        }
      )
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ 
          processed: 0, 
          message: 'No pending notifications to process' 
        }),
        { 
          headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
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
        
        // Mark as processed and clear any previous error
        const { error: updateError } = await supabase
          .from('notifications_raw')
          .update({ 
            status: 'processed',
            processed_at: new Date().toISOString(),
            error_message: null
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
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message 
      }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})

async function processNotification(supabase: any, notification: any) {
  const { notification_type, subtype, decoded_payload, decoded_transaction_info, environment } = notification
  
  // Extract common transaction info if available
  // For notifications stored by webhook, the signedTransactionInfo is already decoded
  // For older notifications, use decoded_transaction_info field
  const transactionInfo = decoded_payload?.data?.signedTransactionInfo || decoded_transaction_info

  switch (notification_type) {
    // ===== Core Types (Priority 1) =====
    case 'REFUND':
      await processRefund(supabase, notification, transactionInfo, environment)
      break

    case 'CONSUMPTION_REQUEST':
      await processConsumptionRequest(supabase, notification, transactionInfo, decoded_payload.data, environment)
      break

    case 'SUBSCRIBED':
      await processSubscribed(supabase, transactionInfo, subtype, environment)
      break

    case 'DID_RENEW':
      await processRenewal(supabase, notification, transactionInfo, subtype, environment)
      break

    case 'ONE_TIME_CHARGE':
      await processOneTimeCharge(supabase, notification, transactionInfo, environment)
      break

    // ===== Subscription Status Changes (Priority 1) =====
    case 'DID_CHANGE_RENEWAL_STATUS':
      await processRenewalStatusChange(supabase, notification, transactionInfo, subtype, environment)
      break

    case 'EXPIRED':
      await processExpired(supabase, notification, transactionInfo, subtype, environment)
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
      await processOfferRedeemed(supabase, notification, transactionInfo, subtype, environment)
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

async function processRefund(supabase: any, notification: any, transactionInfo: any, environment: string) {
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
    refund_reason: transactionInfo.revocationReason || null,
    environment: environment
  }

  const { error } = await supabase
    .from('refunds')
    .upsert(refundData, { 
      onConflict: 'transaction_id',
      ignoreDuplicates: true 
    })

  if (error) throw new Error(`Failed to process refund: ${error.message}`)
}

async function processConsumptionRequest(supabase: any, notification: any, transactionInfo: any, data: any, environment: string) {
  // Get originalTransactionId from transactionInfo (decoded signedTransactionInfo)
  // For consumption requests, originalTransactionId must come from the transaction being consumed
  const originalTransactionId = transactionInfo?.originalTransactionId || transactionInfo?.transactionId
  
  // Validate that we have an originalTransactionId
  if (!originalTransactionId) {
    throw new Error('Missing originalTransactionId in CONSUMPTION_REQUEST notification')
  }
  
  console.log(`Processing CONSUMPTION_REQUEST for transaction: ${originalTransactionId}`)
  console.log(`Reason: ${data.consumptionRequestReason?.reason || 'Not specified'}`)
  
  const consumptionData = {
    notification_id: notification.id,
    original_transaction_id: originalTransactionId,
    consumption_request_reason: data.consumptionRequestReason?.reason || null,
    request_date: new Date().toISOString(),
    deadline: data.consumptionRequestReason?.deadline ? 
      new Date(data.consumptionRequestReason.deadline).toISOString() : 
      new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // Default 12 hours
    status: 'pending',
    environment: environment
  }

  // Insert consumption request
  const { data: consumptionRequest, error: insertError } = await supabase
    .from('consumption_requests')
    .insert(consumptionData)
    .select()
    .single()

  if (insertError) throw new Error(`Failed to create consumption request: ${insertError.message}`)
  
  // Update consumption_request_webhooks table with the consumption_request_id
  if (notification.notification_uuid) {
    console.log(`Updating consumption_request_webhooks with consumption_request_id: ${consumptionRequest.id}`)
    await supabase
      .from('consumption_request_webhooks')
      .update({
        consumption_request_id: consumptionRequest.id,
        processing_status: 'processed',
        updated_at: new Date().toISOString()
      })
      .eq('notification_uuid', notification.notification_uuid)
  }

  // Calculate consumption data using the database function
  const { data: calculatedData, error: calcError } = await supabase
    .rpc('calculate_consumption_data', {
      p_original_transaction_id: originalTransactionId,
      p_environment: environment
    })

  if (calcError) {
    console.error('Failed to calculate consumption data:', calcError)
    throw new Error(`Failed to calculate consumption data: ${calcError.message}`)
  }

  // Create send job with calculated data
  const jobData = {
    consumption_request_id: consumptionRequest.id,
    consumption_data: calculatedData,
    status: 'pending',
    scheduled_at: new Date().toISOString()
  }

  const { data: job, error: jobError } = await supabase
    .from('send_consumption_jobs')
    .insert(jobData)
    .select()
    .single()

  if (jobError) throw new Error(`Failed to create send job: ${jobError.message}`)

  // Immediately send consumption data to Apple
  try {
    console.log('Immediately sending consumption data to Apple...')
    
    // Call send-consumption Edge Function directly
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-consumption`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobId: job.id, // Send specific job ID to process
        immediate: true // Flag to indicate immediate processing
      })
    })

    if (sendResponse.ok) {
      const result = await sendResponse.json()
      console.log('✓ Consumption data sent immediately:', result)
      
      // Update request status to sent if successful
      await supabase
        .from('consumption_requests')
        .update({
          status: 'sent',
          updated_at: new Date().toISOString()
        })
        .eq('id', consumptionRequest.id)
    } else {
      console.error('Failed to send consumption data immediately:', await sendResponse.text())
      // Job remains pending and will be processed by scheduled task
    }
  } catch (error) {
    console.error('Error sending consumption data immediately:', error)
    // Job remains pending and will be processed by scheduled task
  }
}

async function processSubscribed(supabase: any, transactionInfo: any, subtype: string, environment: string) {
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
    environment: environment  // Use environment from notification, not from transactionInfo
  }

  const { error } = await supabase
    .from('transactions')
    .upsert(transactionData, { 
      onConflict: 'transaction_id'
    })

  if (error) throw new Error(`Failed to process subscription: ${error.message}`)
}

async function processRenewal(supabase: any, notification: any, transactionInfo: any, subtype: string, environment: string) {
  // Same as processSubscribed for renewals
  await processSubscribed(supabase, transactionInfo, subtype, environment)
}

async function processOneTimeCharge(supabase: any, notification: any, transactionInfo: any, environment: string) {
  // Same as processSubscribed for one-time purchases
  await processSubscribed(supabase, transactionInfo, null, environment)
}

async function processRenewalStatusChange(supabase: any, notification: any, transactionInfo: any, subtype: string, environment: string) {
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

async function processExpired(supabase: any, notification: any, transactionInfo: any, subtype: string, environment: string) {
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

async function processOfferRedeemed(supabase: any, notification: any, transactionInfo: any, subtype: string, environment: string) {
  // Process offer redemption
  await processSubscribed(supabase, transactionInfo, subtype, environment)
}

async function processPriceIncrease(supabase: any, notification: any, transactionInfo: any, subtype: string) {
  // Log price increase notification
  console.log(`Price increase notification: ${subtype} for transaction: ${transactionInfo?.originalTransactionId}`)
}

async function processRevoke(supabase: any, notification: any, transactionInfo: any) {
  // Handle family sharing revocation
  console.log(`Family sharing revoked for transaction: ${transactionInfo?.originalTransactionId}`)
}