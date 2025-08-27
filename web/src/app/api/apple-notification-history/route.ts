import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { environment, startDate, endDate, notificationType, transactionId } = body
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    // Call the new Edge Function that handles pagination automatically
    const response = await fetch(`${supabaseUrl}/functions/v1/apple-notification-history`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        environment,
        startDate,
        endDate,
        notificationType,  // Changed from notificationTypes to notificationType
        transactionId
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch notification history')
    }

    // The Edge Function now returns all notifications with pagination handled
    return NextResponse.json({
      notifications: data.notifications,
      totalCount: data.totalCount,
      requestId: data.requestId
    })

  } catch (error) {
    console.error('Notification history error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch notification history' },
      { status: 500 }
    )
  }
}