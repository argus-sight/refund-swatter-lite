import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Apple API base URLs
const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com/inApps/v1'
const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'

// Maximum number of pages to fetch to prevent infinite loops
const MAX_PAGES = 100
// Delay between API calls to respect rate limits (milliseconds)
const API_CALL_DELAY = 100
// Batch size for database insertions
const DB_BATCH_SIZE = 50

async function getAppleJWT(supabase: any, requestId: string): Promise<string> {
  try {
    console.log(`[${requestId}] Getting Apple JWT token...`)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const response = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      console.error(`[${requestId}] Failed to generate JWT:`, errorData)
      throw new Error(errorData.error || 'Failed to generate JWT')
    }

    const data = await response.json()
    console.log(`[${requestId}] ✓ Apple JWT obtained successfully`)
    return data.jwt
  } catch (error) {
    console.error(`[${requestId}] ERROR getting Apple JWT:`, error)
    throw new Error('Failed to get Apple JWT')
  }
}

async function storeNotifications(
  notifications: any[],
  supabase: any,
  requestId: string,
  pageNumber: number
): Promise<{ inserted: number, errors: any[] }> {
  console.log(`[${requestId}] Storing ${notifications.length} notifications from page ${pageNumber} to database...`)
  
  let inserted = 0
  let errors = []
  
  // Process notifications in batches
  for (let i = 0; i < notifications.length; i += DB_BATCH_SIZE) {
    const batch = notifications.slice(i, i + DB_BATCH_SIZE)
    
    // Prepare notifications for insertion into notifications_raw table
    const notificationsToInsert = batch.map((notification: any) => ({
      notification_uuid: notification.notificationUUID,
      notification_type: notification.notificationType,
      subtype: notification.subtype,
      signed_payload: notification.signedPayload || '', // Store the original signed payload
      decoded_payload: {
        version: notification.version,
        signedDate: notification.signedDate,
        data: notification.data,
        summary: notification.summary,
        externalPurchaseToken: notification.externalPurchaseToken,
        appAppleId: notification.appAppleId,
        bundleId: notification.bundleId,
        bundleVersion: notification.bundleVersion,
        status: notification.status
      },
      environment: notification.environment,
      status: 'pending', // Will be processed later
      received_at: new Date().toISOString(),
      source: 'history_api', // Mark as coming from history API
      signed_date: notification.signedDate ? new Date(notification.signedDate) : null
    }))

    // Insert with upsert to handle duplicates
    const { data, error } = await supabase
      .from('notifications_raw')
      .upsert(notificationsToInsert, {
        onConflict: 'notification_uuid',
        ignoreDuplicates: false
      })
      .select()

    if (error) {
      console.error(`[${requestId}] Batch insert error (${i}-${i + batch.length}):`, error)
      errors.push({ 
        pageNumber,
        batch: `${i}-${i + batch.length}`, 
        error: error.message 
      })
    } else {
      const insertedCount = data?.length || 0
      inserted += insertedCount
      console.log(`[${requestId}] ✓ Batch ${i}-${i + batch.length} stored: ${insertedCount} notifications`)
    }
  }
  
  console.log(`[${requestId}] Page ${pageNumber} storage complete: ${inserted}/${notifications.length} inserted`)
  return { inserted, errors }
}

async function fetchAndStoreNotificationHistoryPage(
  jwt: string,
  apiBase: string,
  requestBody: any,
  paginationToken: string | null,
  pageNumber: number,
  supabase: any,
  requestId: string
): Promise<{ 
  notifications: number, 
  inserted: number,
  errors: any[],
  hasMore: boolean, 
  paginationToken: string | null 
}> {
  
  console.log(`[${requestId}] ========================================`)
  console.log(`[${requestId}] Processing page ${pageNumber}...`)
  
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
    // Log API call to database
    const { data: logData, error: logError } = await supabase
      .from('apple_api_logs')
      .insert({
        endpoint: url,
        method: 'POST',
        request_headers: {
          'Authorization': `Bearer ${jwt.substring(0, 50)}...`,
          'Content-Type': 'application/json',
          'User-Agent': 'RefundSwatterLite/1.0'
        },
        request_body: body,
        notes: `Data initialization page ${pageNumber} - Request ID: ${requestId}${paginationToken ? ' (with pagination)' : ' (first page)'}`
      })
      .select('id')
      .single()
    
    if (!logError && logData) {
      logId = logData.id
      console.log(`[${requestId}] Database log ID: ${logId}`)
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
    
    // Parse response
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
      await supabase
        .from('apple_api_logs')
        .update({
          response_status: response.status,
          response_headers: Object.fromEntries(response.headers.entries()),
          response_body: responseData || { raw: responseText.substring(0, 1000) },
          duration_ms: duration
        })
        .eq('id', logId)
    }

    if (!response.ok) {
      const errorData = responseData || { errorMessage: responseText }
      console.error(`[${requestId}] ❌ Apple API error on page ${pageNumber}:`)
      console.error(`[${requestId}] Status: ${response.status}`)
      console.error(`[${requestId}] Error:`, errorData)
      throw new Error(errorData.errorMessage || `Apple API returned ${response.status}`)
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

    // Store notifications immediately after fetching
    const storeResult = await storeNotifications(notifications, supabase, requestId, pageNumber)

    return {
      notifications: notifications.length,
      inserted: storeResult.inserted,
      errors: storeResult.errors,
      hasMore: data.hasMore || false,
      paginationToken: data.paginationToken || null
    }

  } catch (error) {
    console.error(`[${requestId}] Error processing page ${pageNumber}:`, error)
    throw error
  }
}

async function initializeAllData(
  jwt: string,
  environment: string,
  requestBody: any,
  supabase: any,
  requestId: string
): Promise<{
  totalFetched: number,
  totalInserted: number,
  totalPages: number,
  errors: any[]
}> {
  
  const apiBase = environment === 'sandbox' ? APPLE_API_BASE_SANDBOX : APPLE_API_BASE_PRODUCTION
  let totalFetched = 0
  let totalInserted = 0
  let allErrors: any[] = []
  let hasMore = true
  let paginationToken: string | null = null
  let pageNumber = 1

  console.log(`[${requestId}] ============================================================`)
  console.log(`[${requestId}] Starting data initialization...`)
  console.log(`[${requestId}] ============================================================`)
  console.log(`[${requestId}] Environment: ${environment}`)
  console.log(`[${requestId}] API Base URL: ${apiBase}`)
  console.log(`[${requestId}] Request parameters:`, JSON.stringify(requestBody, null, 2))
  console.log(`[${requestId}] Max pages limit: ${MAX_PAGES}`)
  console.log(`[${requestId}] Delay between calls: ${API_CALL_DELAY}ms`)
  console.log(`[${requestId}] Database batch size: ${DB_BATCH_SIZE}`)

  while (hasMore && pageNumber <= MAX_PAGES) {
    try {
      // Add delay between API calls (except for the first call)
      if (pageNumber > 1) {
        console.log(`[${requestId}] Waiting ${API_CALL_DELAY}ms before next request...`)
        await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY))
      }

      const pageResult = await fetchAndStoreNotificationHistoryPage(
        jwt,
        apiBase,
        requestBody,
        paginationToken,
        pageNumber,
        supabase,
        requestId
      )

      // Update totals
      totalFetched += pageResult.notifications
      totalInserted += pageResult.inserted
      if (pageResult.errors.length > 0) {
        allErrors.push(...pageResult.errors)
      }
      
      console.log(`[${requestId}] Page ${pageNumber} complete:`)
      console.log(`[${requestId}] - Notifications fetched: ${pageResult.notifications}`)
      console.log(`[${requestId}] - Notifications inserted: ${pageResult.inserted}`)
      console.log(`[${requestId}] - Running total fetched: ${totalFetched}`)
      console.log(`[${requestId}] - Running total inserted: ${totalInserted}`)
      
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
      console.error(`[${requestId}] ❌ Failed to process page ${pageNumber}:`, error)
      allErrors.push({
        pageNumber,
        error: error.message
      })
      console.error(`[${requestId}] Stopping initialization due to error`)
      break
    }
  }

  if (pageNumber > MAX_PAGES && hasMore) {
    console.warn(`[${requestId}] ⚠️ WARNING: Reached maximum page limit (${MAX_PAGES})`)
    console.warn(`[${requestId}] There may be more data available but stopping to prevent infinite loops`)
  }

  console.log(`[${requestId}] ============================================================`)
  console.log(`[${requestId}] ✓ Data initialization completed`)
  console.log(`[${requestId}] - Total pages processed: ${pageNumber - 1}`)
  console.log(`[${requestId}] - Total notifications fetched: ${totalFetched}`)
  console.log(`[${requestId}] - Total notifications inserted: ${totalInserted}`)
  console.log(`[${requestId}] - Total errors: ${allErrors.length}`)
  console.log(`[${requestId}] ============================================================`)

  return {
    totalFetched,
    totalInserted,
    totalPages: pageNumber - 1,
    errors: allErrors
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  
  console.log(`[${requestId}] ************************************************************`)
  console.log(`[${requestId}] ==> Data Initialization Request Started`)
  console.log(`[${requestId}] Request ID: ${requestId}`)
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`)
  console.log(`[${requestId}] Method: ${req.method}`)
  console.log(`[${requestId}] URL: ${req.url}`)
  console.log(`[${requestId}] ************************************************************`)
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] CORS preflight request handled`)
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const body = await req.json()
    const { 
      environment = 'production', 
      startDate, 
      endDate, 
      notificationType,
      transactionId 
    } = body

    console.log(`[${requestId}] Parsed request body:`)
    console.log(`[${requestId}] - Environment: ${environment}`)
    console.log(`[${requestId}] - Start Date: ${startDate || 'not specified'}`)
    console.log(`[${requestId}] - End Date: ${endDate || 'not specified'}`)
    console.log(`[${requestId}] - Notification Type: ${notificationType || 'all types'}`)
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      requestBody.notificationType = notificationType
    }
    if (transactionId) {
      requestBody.originalTransactionId = transactionId
    }

    // Initialize all data with real-time storage
    const result = await initializeAllData(
      jwt,
      environment,
      requestBody,
      supabase,
      requestId
    )

    const duration = Date.now() - startTime
    
    console.log(`[${requestId}] ************************************************************`)
    console.log(`[${requestId}] ==> Request Completed Successfully`)
    console.log(`[${requestId}] Total processing time: ${duration}ms`)
    console.log(`[${requestId}] Response being sent to client`)
    console.log(`[${requestId}] ************************************************************`)

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalFetched: result.totalFetched,
          inserted: result.totalInserted,
          skipped: result.totalFetched - result.totalInserted,
          totalPages: result.totalPages,
          errors: result.errors.length > 0 ? result.errors : undefined
        },
        requestId,
        processingTime: duration
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    
    console.error(`[${requestId}] ************************************************************`)
    console.error(`[${requestId}] ==> Request Failed with Error`)
    console.error(`[${requestId}] Error Type: ${error.name}`)
    console.error(`[${requestId}] Error Message: ${error.message}`)
    console.error(`[${requestId}] Stack Trace:`, error.stack)
    console.error(`[${requestId}] Processing time before error: ${duration}ms`)
    console.error(`[${requestId}] ************************************************************`)
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to initialize data',
        requestId,
        processingTime: duration
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})