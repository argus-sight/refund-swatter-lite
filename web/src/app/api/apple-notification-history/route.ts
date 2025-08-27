import { NextRequest, NextResponse } from 'next/server'
import { getAppleApiBase, AppleEnvironment } from '@/lib/apple'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { environment, startDate, endDate, notificationTypes, transactionId } = body
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    // Get Apple JWT
    const jwtResponse = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!jwtResponse.ok) {
      throw new Error('Failed to generate Apple JWT')
    }

    const { jwt } = await jwtResponse.json()

    // Build request body
    const requestBody: any = {}
    if (startDate) requestBody.startDate = new Date(startDate).getTime()
    if (endDate) requestBody.endDate = new Date(endDate).getTime()
    if (notificationTypes && notificationTypes.length > 0) {
      requestBody.notificationTypes = notificationTypes
    }
    if (transactionId) requestBody.originalTransactionId = transactionId

    // Fetch notification history
    const apiBase = getAppleApiBase(environment as AppleEnvironment)
    const response = await fetch(`${apiBase}/notifications/history`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.errorMessage || 'Failed to fetch notification history')
    }

    // Parse signed payloads if needed
    const notifications = data.notificationHistory?.map((item: any) => {
      try {
        const payload = JSON.parse(atob(item.signedPayload.split('.')[1]))
        return {
          ...payload,
          signedPayload: item.signedPayload
        }
      } catch {
        return item
      }
    })

    return NextResponse.json({
      notifications,
      hasMore: data.hasMore,
      paginationToken: data.paginationToken
    })

  } catch (error) {
    console.error('Notification history error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch notification history' },
      { status: 500 }
    )
  }
}