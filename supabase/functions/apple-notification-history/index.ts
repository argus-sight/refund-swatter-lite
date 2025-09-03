import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'

// Apple API base URLs
const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com/inApps/v1'
const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'

// Maximum number of pages to fetch to prevent infinite loops
const MAX_PAGES = 100
// Delay between API calls to respect rate limits (milliseconds)
const API_CALL_DELAY = 100

async function getAppleJWT(supabase: any, requestId: string): Promise<string> {
  try {
    console.log(`[${requestId}] Getting Apple JWT token...`)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    console.log(`[${requestId}] Calling apple-jwt function at: ${supabaseUrl}/functions/v1/apple-jwt`)
    const jwtStartTime = Date.now()
    
    const response = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })
    
    const jwtDuration = Date.now() - jwtStartTime
    console.log(`[${requestId}] JWT generation response status: ${response.status} (took ${jwtDuration}ms)`)
    
    if (!response.ok) {
      const errorData = await response.json()
      console.error(`[${requestId}] ❌ Failed to generate JWT:`, errorData)
      throw new Error(errorData.error || 'Failed to generate JWT')
    }

    const data = await response.json()
    console.log(`[${requestId}] ✓ Apple JWT obtained successfully`)
    console.log(`[${requestId}] JWT length: ${data.jwt?.length || 0} characters`)
    console.log(`[${requestId}] JWT preview: ${data.jwt?.substring(0, 50)}...`)
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
  
  console.log(`[${requestId}] ========================================`)
  console.log(`[${requestId}] Fetching page ${pageNumber}...`)
  
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
  console.log(`[${requestId}] >>> Apple API Request (Page ${pageNumber})`)
  console.log(`[${requestId}] URL: ${url}`)
  console.log(`[${requestId}] Method: POST`)
  console.log(`[${requestId}] Request Body:`, JSON.stringify(body, null, 2))
  if (paginationToken) {
    console.log(`[${requestId}] Pagination Token (in URL): ${paginationToken.substring(0, 20)}...`)
  }

  try {
    // Log API call to database (with full URL including query params)
    console.log(`[${requestId}] Attempting to log API call to database...`)
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
      console.log(`[${requestId}] ✓ Database log created with ID: ${logId}`)
    } else {
      console.warn(`[${requestId}] ⚠️ No error but also no log ID returned`)
    }

    // Make API request
    console.log(`[${requestId}] Sending request to Apple API...`)
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
    console.log(`[${requestId}] <<< Apple API Response (Page ${pageNumber})`)
    console.log(`[${requestId}] Status: ${response.status}`)
    console.log(`[${requestId}] Duration: ${duration}ms`)
    console.log(`[${requestId}] Response Headers:`, Object.fromEntries(response.headers.entries()))
    
    // Parse response for logging
    let responseData: any = null
    try {
      responseData = JSON.parse(responseText)
      console.log(`[${requestId}] Response Body:`, JSON.stringify({
        hasMore: responseData.hasMore,
        paginationToken: responseData.paginationToken ? `${responseData.paginationToken.substring(0, 20)}...` : null,
        notificationHistoryCount: responseData.notificationHistory?.length || 0,
        errorMessage: responseData.errorMessage
      }, null, 2))
    } catch (e) {
      console.log(`[${requestId}] Response Body (raw):`, responseText.substring(0, 500))
    }

    // Update database log with response
    if (logId) {
      console.log(`[${requestId}] Updating database log ${logId} with response...`)
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
        console.log(`[${requestId}] ✓ Database log updated with response`)
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
    console.log(`[${requestId}] ✓ Page ${pageNumber} fetched successfully`)
    console.log(`[${requestId}] - Has more pages: ${data.hasMore}`)
    console.log(`[${requestId}] - Notifications in this page: ${data.notificationHistory?.length || 0}`)

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
  
  const apiBase = environment === 'sandbox' ? APPLE_API_BASE_SANDBOX : APPLE_API_BASE_PRODUCTION
  const allNotifications: any[] = []
  let hasMore = true
  let paginationToken: string | null = null
  let pageNumber = 1

  console.log(`[${requestId}] ============================================================`)
  console.log(`[${requestId}] Starting to fetch all notification history pages...`)
  console.log(`[${requestId}] ============================================================`)
  console.log(`[${requestId}] Environment: ${environment}`)
  console.log(`[${requestId}] API Base URL: ${apiBase}`)
  console.log(`[${requestId}] Request parameters:`, JSON.stringify(requestBody, null, 2))
  console.log(`[${requestId}] Max pages limit: ${MAX_PAGES}`)
  console.log(`[${requestId}] Delay between calls: ${API_CALL_DELAY}ms`)

  while (hasMore && pageNumber <= MAX_PAGES) {
    try {
      // Add delay between API calls (except for the first call)
      if (pageNumber > 1) {
        console.log(`[${requestId}] Waiting ${API_CALL_DELAY}ms before next request...`)
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
      
      console.log(`[${requestId}] Page ${pageNumber} processing complete:`)
      console.log(`[${requestId}] - Notifications added: ${pageResult.notifications.length}`)
      console.log(`[${requestId}] - Total notifications: ${previousCount} -> ${allNotifications.length}`)
      
      // Update pagination state
      hasMore = pageResult.hasMore
      paginationToken = pageResult.paginationToken

      if (hasMore) {
        console.log(`[${requestId}] More pages available, continuing...`)
      } else {
        console.log(`[${requestId}] No more pages available, stopping pagination`)
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

  console.log(`[${requestId}] ============================================================`)
  console.log(`[${requestId}] ✓ Finished fetching notification history`)
  console.log(`[${requestId}] - Total pages fetched: ${pageNumber - 1}`)
  console.log(`[${requestId}] - Total notifications: ${allNotifications.length}`)
  
  // Check how many API logs were created
  console.log(`[${requestId}] Checking database logs...`)
  const { data: logCount, error: logCountError } = await supabase
    .from('apple_api_logs')
    .select('id', { count: 'exact', head: true })
    .like('notes', `%Request ID: ${requestId}%`)
  
  if (!logCountError) {
    console.log(`[${requestId}] - Database logs created for this request: ${logCount || 0}`)
  }
  
  console.log(`[${requestId}] ============================================================`)

  return allNotifications
}

serve(async (req) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  console.log(`[${requestId}] ************************************************************`)
  console.log(`[${requestId}] ==> Apple Notification History Request Started`)
  console.log(`[${requestId}] Request ID: ${requestId}`)
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`)
  console.log(`[${requestId}] Method: ${req.method}`)
  console.log(`[${requestId}] URL: ${req.url}`)
  console.log(`[${requestId}] Headers:`, Object.fromEntries(req.headers.entries()))
  console.log(`[${requestId}] ************************************************************`)
  
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) {
    console.log(`[${requestId}] CORS preflight request handled`)
    return corsResponse
  }

  // Verify authentication - allow both service role and admin users
  const auth = await verifyAuth(req, {
    allowServiceRole: true,
    requireAdmin: true
  })

  if (!auth.isValid) {
    console.log(`[${requestId}] Authentication failed`)
    return auth.errorResponse!
  }

  console.log(`[${requestId}] Authenticated: ${auth.isServiceRole ? 'Service Role' : `User ${auth.user?.email}`}`)

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

    console.log(`[${requestId}] Parsed request body:`)
    console.log(`[${requestId}] - Environment: ${environment}`)
    console.log(`[${requestId}] - Start Date: ${startDate || 'not specified'}`)
    console.log(`[${requestId}] - End Date: ${endDate || 'not specified'}`)
    console.log(`[${requestId}] - Notification Type: ${notificationType || 'all types'}`)  // Updated log
    console.log(`[${requestId}] - Transaction ID: ${transactionId || 'not specified'}`)
    
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
    console.log(`[${requestId}] Initializing Supabase client...`)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get Apple JWT
    const jwt = await getAppleJWT(supabase, requestId)

    // Build request body for Apple API
    const requestBody: any = {}
    if (startDate) {
      // Start date should be at 00:00:00 of that day
      requestBody.startDate = new Date(startDate).getTime()
    }
    if (endDate) {
      // End date should be at 23:59:59.999 of that day to include the entire day
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      requestBody.endDate = endDateTime.getTime()
      console.log(`[${requestId}] Adjusted end date to include entire day: ${endDateTime.toISOString()}`)
    }
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
    
    console.log(`[${requestId}] ************************************************************`)
    console.log(`[${requestId}] ==> Request Completed Successfully`)
    console.log(`[${requestId}] Total notifications fetched: ${allNotifications.length}`)
    console.log(`[${requestId}] Total processing time: ${duration}ms`)
    console.log(`[${requestId}] Response being sent to client`)
    console.log(`[${requestId}] ************************************************************`)

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