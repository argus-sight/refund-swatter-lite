import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { notificationId } = await request.json()
    
    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // First, reset the notification status to pending
    const { data: notification, error: updateError } = await supabase
      .from('notifications_raw')
      .update({ 
        status: 'pending',
        processed_at: null,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Failed to reset notification: ${updateError.message}`)
    }

    // Call process-notifications Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/process-notifications`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        limit: 1, // Process just this notification
        notificationType: notification.notification_type
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to trigger processing: ${error}`)
    }

    const result = await response.json()

    return NextResponse.json({
      success: true,
      message: 'Notification reprocessing triggered',
      result
    })
  } catch (error: any) {
    console.error('Error retrying notification:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to retry notification' },
      { status: 500 }
    )
  }
}