import { NextRequest, NextResponse } from 'next/server'
import { getAppleApiBase, AppleEnvironment } from '@/lib/apple'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { testNotificationToken, environment } = await request.json()
    
    if (!testNotificationToken) {
      return NextResponse.json(
        { error: 'Test notification token is required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = await getServiceSupabase()
    
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

    // Check test notification status
    const apiBase = getAppleApiBase(environment as AppleEnvironment)
    const apiUrl = `${apiBase}/notifications/test/${testNotificationToken}`
    
    const startTime = Date.now()
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`
      }
    })
    const endTime = Date.now()

    const data = await response.json()
    
    console.log('Apple status check response:', JSON.stringify(data, null, 2))
    
    // Log the API request to apple_api_logs table
    await supabase.from('apple_api_logs').insert({
      endpoint: apiUrl,
      method: 'GET',
      request_body: null,
      response_status: response.status,
      response_body: data,
      response_time_ms: endTime - startTime,
      environment: environment,
      notes: `Test notification status check for token: ${testNotificationToken}`
    })

    if (!response.ok) {
      throw new Error(data.errorMessage || 'Failed to check test notification status')
    }

    // Return the data directly, not nested under 'status'
    return NextResponse.json(data)

  } catch (error) {
    console.error('Test status error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    )
  }
}