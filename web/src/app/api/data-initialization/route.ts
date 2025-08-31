import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    // Get the user's session
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const body = await request.json()
    const { environment, startDate, endDate, notificationType, transactionId } = body
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const userToken = session.access_token
    
    // Call the data-initialization Edge Function that handles pagination and real-time storage
    const response = await fetch(`${supabaseUrl}/functions/v1/data-initialization`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
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

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to initialize data')
    }

    // The Edge Function now returns the initialization summary
    return NextResponse.json({
      success: true,
      summary: data.summary,
      requestId: data.requestId,
      processingTime: data.processingTime
    })

  } catch (error) {
    console.error('Data initialization error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initialize data' },
      { status: 500 }
    )
  }
}