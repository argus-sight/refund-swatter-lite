import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { notification_uuid, environment } = await request.json()

    if (!notification_uuid) {
      return NextResponse.json({ error: 'Notification UUID is required' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Call the Supabase Edge Function to reprocess the notification
    const response = await fetch(
      `${supabaseUrl}/functions/v1/reprocess-notification`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notification_uuid,
          environment,
        }),
      }
    )

    const result = await response.json()
    
    if (!response.ok) {
      console.error('Edge function error:', result)
      return NextResponse.json(
        { 
          error: result.error || 'Failed to reprocess notification',
          details: result.details,
          requestId: result.requestId
        },
        { status: response.status }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: result.message || 'Notification reprocessed successfully',
      details: result.details
    })
  } catch (error) {
    console.error('Error reprocessing notification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}