import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'
import { AppleEnvironment, normalizeEnvironment } from '../_shared/constants.ts'

// Apple API base URLs
const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com/inApps/v1'
const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'

// Maximum number of pages to fetch to prevent infinite loops
const MAX_PAGES = 100
// Delay between API calls to respect rate limits (milliseconds)
const API_CALL_DELAY = 100

async function getAppleJWT(supabase: any, requestId: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const jwtStartTime = Date.now()
    
    const response = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })
    
    const jwtDuration = Date.now() - jwtStartTime
    if (!response.ok) {
      const errorData = await response.json()
      console.error(`[${requestId}] ❌ Failed to generate JWT:`, errorData)
      throw new Error(errorData.error || 'Failed to generate JWT')
    }

    const data = await response.json()
    return data.jwt
  } catch (error) {
    console.error(`[${requestId}] ERROR getting Apple JWT:`, error)
    throw new Error('Failed to get Apple JWT')
  }
}

async function fetchNotificationHistoryPage(
  jwt: string,
  apiBase: string,
  requestBody: any,
  paginationToken: string | null,
  pageNumber: number,
  supabase: any,
  requestId: string
): Promise<{ notifications: any[], hasMore: boolean, paginationToken: string | null }> {
  // Build URL with pagination token as query parameter
  let url = `${apiBase}/notifications/history`
  if (paginationToken) {
    url += `?paginationToken=${encodeURIComponent(paginationToken)}`
  }

  // Request body should NOT include paginationToken
  const body = requestBody
  
  let logId: string | null = null
  const startTime = Date.now()

  // Log the request details
  if (paginationToken) {
  }

  try {
    // Log API call to database (with full URL including query params)
    const { data: logData, error: logError } = await supabase
      .from('apple_api_logs')
      .insert({
        endpoint: url,  // This now includes ?paginationToken=xxx if present
        method: 'POST',
        request_headers: {
          'Authorization': `Bearer ${jwt.substring(0, 50)}...`,
          'Content-Type': 'application/json',
          'User-Agent': 'RefundSwatterLite/1.0'
        },
        request_body: body,
        notes: `Notification history page ${pageNumber} - Request ID: ${requestId}${paginationToken ? ' (with pagination)' : ' (first page)'}`
      })
      .select('id')
      .single()
    
    if (logError) {
      console.error(`[${requestId}] ⚠️ Failed to create database log:`, logError)
      console.error(`[${requestId}] Error details:`, JSON.stringify(logError, null, 2))
    } else if (logData) {
      logId = logData.id
    } else {
      console.warn(`[${requestId}] ⚠️ No error but also no log ID returned`)
    }

    // Make API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'User-Agent': 'RefundSwatterLite/1.0'
      },
      body: JSON.stringify(body)
    })

    const responseText = await response.text()
    const duration = Date.now() - startTime

    // Log the response details
    // Parse response for logging
    let responseData: any = null
    try {
      responseData = JSON.parse(responseText)
    } catch (e) {
    }

    // Update database log with response
    if (logId) {
      const { error: updateError } = await supabase
        .from('apple_api_logs')
        .update({
          response_status: response.status,
          response_headers: Object.fromEntries(response.headers.entries()),
          response_body: responseData || { raw: responseText.substring(0, 1000) },
          duration_ms: duration
        })
        .eq('id', logId)
      
      if (updateError) {
        console.error(`[${requestId}] ⚠️ Failed to update database log:`, updateError)
      } else {
      }
    } else {
      console.warn(`[${requestId}] ⚠️ No log ID available, skipping response logging`)
    }

    if (!response.ok) {
      const errorData = responseData || { errorMessage: responseText }
      console.error(`[${requestId}] ❌ Apple API error on page ${pageNumber}:`)
      console.error(`[${requestId}] Status: ${response.status}`)
      console.error(`[${requestId}] Error:`, errorData)
      
      // Create detailed error object
      const errorDetails = {
        status: response.status,
        message: errorData.errorMessage || errorData.error || `Apple API returned ${response.status}`,
        appleErrorCode: errorData.errorCode,
        appleErrorMessage: errorData.errorMessage,
        fullResponse: errorData
      }
      
      const error = new Error(errorDetails.message)
      ;(error as any).details = errorDetails
      throw error
    }

    const data = responseData || JSON.parse(responseText)
    // Parse signed payloads
    const notifications = (data.notificationHistory || []).map((item: any) => {
      try {
        // Decode the JWT payload (second part of the signed payload)
        const parts = item.signedPayload.split('.')
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1]))
          return {
            ...payload,
            signedPayload: item.signedPayload
          }
        }
        return item
      } catch (error) {
        console.warn(`[${requestId}] Failed to parse notification payload:`, error)
        return item
      }
    })

    return {
      notifications,
      hasMore: data.hasMore || false,
      paginationToken: data.paginationToken || null
    }

  } catch (error) {
    console.error(`[${requestId}] Error fetching page ${pageNumber}:`, error)
    throw error
  }
}

async function fetchAllNotificationHistory(
  jwt: string,
  environment: string,
  requestBody: any,
  supabase: any,
  requestId: string
): Promise<any[]> {
  
  // Normalize environment for consistent comparison
  const normalizedEnv = normalizeEnvironment(environment)
  const apiBase = normalizedEnv === AppleEnvironment.SANDBOX ? APPLE_API_BASE_SANDBOX : APPLE_API_BASE_PRODUCTION
  const allNotifications: any[] = []
  let hasMore = true
  let paginationToken: string | null = null
  let pageNumber = 1
  while (hasMore && pageNumber <= MAX_PAGES) {
    try {
      // Add delay between API calls (except for the first call)
      if (pageNumber > 1) {
        await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY))
      }

      const pageResult = await fetchNotificationHistoryPage(
        jwt,
        apiBase,
        requestBody,
        paginationToken,
        pageNumber,
        supabase,
        requestId
      )

      // Add notifications from this page to the total
      const previousCount = allNotifications.length
      allNotifications.push(...pageResult.notifications)
      // Update pagination state
      hasMore = pageResult.hasMore
      paginationToken = pageResult.paginationToken

      if (hasMore) {
      } else {
      }

      pageNumber++

    } catch (error) {
      console.error(`[${requestId}] ❌ Failed to fetch page ${pageNumber}:`, error)
      console.error(`[${requestId}] Stopping pagination and returning ${allNotifications.length} notifications collected so far`)
      // Return what we have so far instead of failing completely
      break
    }
  }

  if (pageNumber > MAX_PAGES && hasMore) {
    console.warn(`[${requestId}] ⚠️ WARNING: Reached maximum page limit (${MAX_PAGES})`)
    console.warn(`[${requestId}] There may be more data available but stopping to prevent infinite loops`)
  }
  // Check how many API logs were created
  const { data: logCount, error: logCountError } = await supabase
    .from('apple_api_logs')
    .select('id', { count: 'exact', head: true })
    .like('notes', `%Request ID: ${requestId}%`)
  
  if (!logCountError) {
  }
  return allNotifications
}

serve(async (req) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  // Verify authentication - allow both service role and admin users
  const auth = await verifyAuth(req, {
    allowServiceRole: false,
    requireAdmin: true
  })

  if (!auth.isValid) {
    return auth.errorResponse!
  }
  try {
    // Parse request body
    const body = await req.json()
    const { 
      environment = 'production', 
      startDate, 
      endDate, 
      notificationType,  // Changed from notificationTypes (plural) to notificationType (singular)
      transactionId 
    } = body
    // Validate that both transactionId and notificationType are not provided together
    if (transactionId && notificationType) {
      console.error(`[${requestId}] Error: Cannot provide both transactionId and notificationType`)
      return new Response(
        JSON.stringify({ 
          error: 'Cannot provide both transactionId and notificationType. Choose one or neither.',
          requestId
        }),
        { 
          headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get Apple JWT
    const jwt = await getAppleJWT(supabase, requestId)

    // Build request body for Apple API following strict date logic rules
    const requestBody: any = {}
    const now = Date.now()
    
    // Step 1: Parse dates if provided
    let parsedStartDate: number | undefined
    let parsedEndDate: number | undefined
    
    if (startDate) {
      // Format: "YYYY-MM-DD" -> treat as UTC date at 00:00:00.000
      const startDateTime = new Date(startDate + 'T00:00:00.000Z')
      parsedStartDate = startDateTime.getTime()
    }
    
    if (endDate) {
      // Format: "YYYY-MM-DD" -> treat as UTC date at 23:59:59.999
      const endDateTime = new Date(endDate + 'T23:59:59.999Z')
      parsedEndDate = endDateTime.getTime()
    }
    
    // Step 2: Apply default values if not provided
    if (!parsedEndDate) {
      // Default: today at 23:59:59.999 UTC
      const today = new Date()
      today.setUTCHours(23, 59, 59, 999)
      parsedEndDate = today.getTime()
    }
    
    if (!parsedStartDate) {
      // Default: 30 days before end date (30 days - 1ms to ensure exactly 30 days)
      parsedStartDate = parsedEndDate - (30 * 24 * 60 * 60 * 1000 - 1)
    }
    
    // Step 3: Normalize and validate
    // 3.1: Swap if endDate < startDate
    if (parsedEndDate < parsedStartDate) {
      const temp = parsedStartDate
      parsedStartDate = parsedEndDate
      parsedEndDate = temp
    }
    
    // 3.2: Check if range exceeds 180 days
    const rangeInMs = parsedEndDate - parsedStartDate
    const maxRangeMs = 180 * 24 * 60 * 60 * 1000 - 1 // 180 days minus 1ms
    if (rangeInMs > maxRangeMs) {
      // Adjust startDate to be exactly 180 days - 1ms before endDate
      parsedStartDate = parsedEndDate - maxRangeMs
    }
    
    // 3.3: Clamp endDate if it's in the future
    const todayEnd = new Date()
    todayEnd.setUTCHours(23, 59, 59, 999)
    const todayEndMs = todayEnd.getTime()
    
    if (parsedEndDate > todayEndMs) {
      parsedEndDate = todayEndMs
      
      // Re-check the 180-day constraint after clamping
      const newRangeInMs = parsedEndDate - parsedStartDate
      if (newRangeInMs > maxRangeMs) {
        parsedStartDate = parsedEndDate - maxRangeMs
      }
    }
    
    // Step 4: Set final values
    requestBody.startDate = parsedStartDate
    requestBody.endDate = parsedEndDate
    
    const finalRangeDays = (parsedEndDate - parsedStartDate) / (24 * 60 * 60 * 1000)
    if (notificationType) {
      requestBody.notificationType = notificationType  // Use singular form as per Apple API spec
    }
    if (transactionId) {
      requestBody.originalTransactionId = transactionId
    }

    // Fetch all pages of notification history
    const allNotifications = await fetchAllNotificationHistory(
      jwt,
      environment,
      requestBody,
      supabase,
      requestId
    )

    const duration = Date.now() - startTime
    return new Response(
      JSON.stringify({
        notifications: allNotifications,
        totalCount: allNotifications.length,
        requestId,
        processingTime: duration
      }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    
    console.error(`[${requestId}] ************************************************************`)
    console.error(`[${requestId}] ==> Request Failed with Error`)
    console.error(`[${requestId}] Error Type: ${error.name}`)
    console.error(`[${requestId}] Error Message: ${error.message}`)
    console.error(`[${requestId}] Error Details:`, (error as any).details)
    console.error(`[${requestId}] Stack Trace:`, error.stack)
    console.error(`[${requestId}] Processing time before error: ${duration}ms`)
    console.error(`[${requestId}] ************************************************************`)
    
    // Determine appropriate status code
    const statusCode = (error as any).details?.status || 500
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to fetch notification history',
        details: (error as any).details,
        requestId,
        processingTime: duration
      }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: statusCode 
      }
    )
  }
})