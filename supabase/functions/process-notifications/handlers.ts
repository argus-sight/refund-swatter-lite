// Processing handlers for different notification types

export async function processRefund(supabase: any, notification: any, transactionInfo: any, environment: string) {
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
      onConflict: 'transaction_id,refund_date',
      ignoreDuplicates: true 
    })

  if (error) throw new Error(`Failed to process refund: ${error.message}`)
}

export async function processConsumptionRequest(supabase: any, notification: any, transactionInfo: any, data: any, environment: string) {
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
      p_original_transaction_id: originalTransactionId
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

export async function processSubscribed(supabase: any, transactionInfo: any, subtype: string, environment: string) {
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

export async function processRenewal(supabase: any, notification: any, transactionInfo: any, subtype: string, environment: string) {
  // Same as processSubscribed for renewals
  await processSubscribed(supabase, transactionInfo, subtype, environment)
}

export async function processOneTimeCharge(supabase: any, notification: any, transactionInfo: any, environment: string) {
  // Same as processSubscribed for one-time purchases
  await processSubscribed(supabase, transactionInfo, null, environment)
}