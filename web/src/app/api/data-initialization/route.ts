import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { environment, startDate, endDate, notificationType, transactionId } = body
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    // Step 1: Fetch notification history using existing API
    const historyResponse = await fetch(`${supabaseUrl}/functions/v1/apple-notification-history`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        environment,
        startDate,
        endDate,
        notificationType,
        transactionId
      })
    })

    const historyData = await historyResponse.json()

    if (!historyResponse.ok) {
      throw new Error(historyData.error || 'Failed to fetch notification history')
    }

    // Step 2: Store notifications in database
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const notifications = historyData.notifications || []
    let inserted = 0
    let skipped = 0
    let errors = []

    // Process notifications in batches to avoid overwhelming the database
    const batchSize = 50
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize)
      
      // Prepare notifications for insertion
      const notificationsToInsert = batch.map((notification: any) => ({
        notification_uuid: notification.notificationUUID,
        notification_type: notification.notificationType,
        subtype: notification.subtype,
        version: notification.version,
        signed_date: notification.signedDate,
        data: notification.data,
        summary: notification.summary,
        external_purchase_token: notification.externalPurchaseToken,
        app_apple_id: notification.appAppleId,
        bundle_id: notification.bundleId,
        bundle_version: notification.bundleVersion,
        environment: notification.environment,
        status: notification.status
      }))

      // Insert with upsert to handle duplicates
      const { data, error } = await supabase
        .from('apple_notifications')
        .upsert(notificationsToInsert, {
          onConflict: 'notification_uuid',
          ignoreDuplicates: false
        })
        .select()

      if (error) {
        console.error('Batch insert error:', error)
        errors.push({ batch: `${i}-${i + batch.length}`, error: error.message })
      } else {
        inserted += data?.length || 0
      }
    }

    // Calculate skipped notifications
    skipped = notifications.length - inserted

    return NextResponse.json({
      success: true,
      summary: {
        totalFetched: notifications.length,
        inserted,
        skipped,
        errors: errors.length > 0 ? errors : undefined
      },
      requestId: historyData.requestId
    })

  } catch (error) {
    console.error('Data initialization error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initialize data' },
      { status: 500 }
    )
  }
}