import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getAppleApiBase, AppleEnvironment } from '@/lib/apple'

export async function POST(request: NextRequest) {
  try {
    const { environment } = await request.json()
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    // Get config from config table (single tenant)
    const supabase = await getServiceSupabase()
    
    const { data: config, error: configError } = await supabase
      .from('config')
      .select('id, bundle_id, apple_issuer_id, apple_key_id')
      .eq('id', 1)
      .single()

    if (configError || !config) {
      throw new Error('Configuration not found')
    }
    
    // Get Apple JWT
    console.log('Calling apple-jwt function at:', `${supabaseUrl}/functions/v1/apple-jwt`)
    const jwtResponse = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })

    console.log('JWT response status:', jwtResponse.status)
    console.log('JWT response headers:', Object.fromEntries(jwtResponse.headers.entries()))
    
    const responseText = await jwtResponse.text()
    console.log('JWT response text:', responseText)
    
    if (!jwtResponse.ok) {
      console.error('JWT generation failed:', responseText)
      throw new Error('Failed to generate Apple JWT')
    }

    // Try to parse the response
    let jwtData
    try {
      jwtData = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse JWT response:', parseError)
      console.error('Response was:', responseText)
      throw new Error('Invalid JWT response format')
    }
    
    const { jwt } = jwtData
    
    // Decode and log JWT content for debugging
    try {
      const jwtParts = jwt.split('.')
      const header = JSON.parse(Buffer.from(jwtParts[0], 'base64').toString())
      const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString())
      console.log('JWT Header:', JSON.stringify(header, null, 2))
      console.log('JWT Payload:', JSON.stringify(payload, null, 2))
      console.log('Bundle ID from config:', config.bundle_id)
    } catch (decodeError) {
      console.error('Failed to decode JWT for logging:', decodeError)
    }

    // Send test notification request to Apple
    const apiBase = getAppleApiBase(environment as AppleEnvironment)
    const apiUrl = `${apiBase}/notifications/test`
    const requestBody = {
      bundleId: config.bundle_id
    }
    
    console.log('Sending test notification to Apple:', apiUrl)
    const startTime = Date.now()
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
    const endTime = Date.now()

    console.log('Apple API response status:', response.status)
    console.log('Apple API response headers:', Object.fromEntries(response.headers.entries()))
    const appleResponseText = await response.text()
    console.log('Apple API response body:', appleResponseText || '(empty)')
    
    // Log the API request to apple_api_logs table
    let responseBody = null
    if (appleResponseText) {
      try {
        responseBody = JSON.parse(appleResponseText)
      } catch (e) {
        // If response is not JSON, store as text in an object
        responseBody = { raw: appleResponseText }
      }
    }
    
    await supabase.from('apple_api_logs').insert({
      endpoint: apiUrl,
      method: 'POST',
      request_body: requestBody,
      response_status: response.status,
      response_body: responseBody,
      response_time_ms: endTime - startTime,
      environment: environment,
      notes: 'Test notification request'
    })
    
    // Handle empty response for 401 errors
    if (response.status === 401) {
      console.error('Authentication failed. JWT may be invalid or Apple credentials are incorrect.')
      console.log('JWT used:', jwt.substring(0, 50) + '...')
      throw new Error('Apple API authentication failed. Please check your Apple credentials (Issuer ID, Key ID, and Private Key).')
    }
    
    let data = null
    if (appleResponseText) {
      try {
        data = JSON.parse(appleResponseText)
      } catch (parseError) {
        console.error('Failed to parse Apple API response:', parseError)
        console.error('Response was:', appleResponseText)
        throw new Error('Invalid Apple API response format')
      }
    }

    if (!response.ok) {
      throw new Error(data?.errorMessage || `Apple API error: ${response.status} ${response.statusText}`)
    }

    return NextResponse.json({
      success: true,
      testNotificationToken: data.testNotificationToken
    })

  } catch (error) {
    console.error('Test webhook error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Test failed' 
      },
      { status: 500 }
    )
  }
}