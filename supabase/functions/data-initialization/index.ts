import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AppleEnvironment, normalizeEnvironment, NotificationStatus, NotificationSource } from '../_shared/constants.ts'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'
import { getAppleJWT } from '../_shared/apple-jwt.ts'

// Apple API base URLs
const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com/inApps/v1'
const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'

// Maximum number of pages to fetch to prevent infinite loops
const MAX_PAGES = 100
// Delay between API calls to respect rate limits (milliseconds)
const API_CALL_DELAY = 100
// Batch size for database insertions
const DB_BATCH_SIZE = 50

// Helper function to decode JWT without verification
function decodeJWT(jwt: string): any {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) {
      return null
    }
    // Decode the payload (middle part)
    return JSON.parse(atob(parts[1]))
  } catch (error) {
    console.error('Failed to decode JWT:', error)
    return null
  }
}

async function storeNotifications(
  notifications: any[],
  supabase: any,
  requestId: string,
  pageNumber: number
): Promise<{ inserted: number, errors: any[] }> {
  let inserted = 0
  let errors = []
  
  // Process notifications in batches
  for (let i = 0; i < notifications.length; i += DB_BATCH_SIZE) {
    const batch = notifications.slice(i, i + DB_BATCH_SIZE)
    
    // First, check which notifications already exist
    const uuids = batch.map(n => n.notificationUUID)
    const { data: existingNotifications, error: checkError } = await supabase
      .from('notifications_raw')
      .select('notification_uuid, status')
      .in('notification_uuid', uuids)
    
    if (checkError) {
      console.error(`[${requestId}] Error checking existing notifications:`, checkError)
    }
    
    const existingUuids = new Set((existingNotifications || []).map(n => n.notification_uuid))
    const processedUuids = new Set(
      (existingNotifications || [])
        .filter(n => n.status !== NotificationStatus.PENDING)
        .map(n => n.notification_uuid)
    )
    
    // Only insert notifications that don't exist or are still pending
    const notificationsToInsert = batch
      .filter(notification => {
        const uuid = notification.notificationUUID
        // Skip if already processed (not pending)
        if (processedUuids.has(uuid)) {
          return false
        }
        return true
      })
      .map((notification: any) => {
        // Decode signedTransactionInfo if present
        let decodedTransactionInfo = null
        let modifiedData = notification.data
        
        if (notification.data?.signedTransactionInfo) {
          decodedTransactionInfo = decodeJWT(notification.data.signedTransactionInfo)
          if (decodedTransactionInfo) {
            // Replace the JWT string with the decoded object in the data
            modifiedData = {
              ...notification.data,
              signedTransactionInfo: decodedTransactionInfo
            }
          }
        }
        
        // Also decode signedRenewalInfo if present
        if (notification.data?.signedRenewalInfo) {
          const decodedRenewalInfo = decodeJWT(notification.data.signedRenewalInfo)
          if (decodedRenewalInfo) {
            modifiedData = {
              ...modifiedData,
              signedRenewalInfo: decodedRenewalInfo
            }
          }
        }
        
        return {
          notification_uuid: notification.notificationUUID,
          notification_type: notification.notificationType,
          subtype: notification.subtype,
          signed_payload: notification.signedPayload || '', // Store the original signed payload
          decoded_payload: {
            version: notification.version,
            signedDate: notification.signedDate,
            data: modifiedData, // Use modified data with decoded JWTs
            summary: notification.summary,
            externalPurchaseToken: notification.externalPurchaseToken,
            appAppleId: notification.appAppleId,
            bundleId: notification.bundleId,
            bundleVersion: notification.bundleVersion,
            status: notification.status
          },
          decoded_transaction_info: decodedTransactionInfo, // Store separately for easy access
          environment: notification.data?.environment || normalizeEnvironment(environment),
          status: NotificationStatus.PENDING, // Will be processed later
          received_at: new Date().toISOString(),
          source: NotificationSource.HISTORY_API, // Mark as coming from history API
          signed_date: notification.signedDate ? new Date(notification.signedDate) : null
        }
      })

    if (notificationsToInsert.length > 0) {
      // Check how many are actually new vs existing pending
      const newNotificationUuids = notificationsToInsert
        .map(n => n.notification_uuid)
        .filter(uuid => !existingUuids.has(uuid))
      
      // Use ignoreDuplicates: true to preserve existing records
      const { data, error } = await supabase
        .from('notifications_raw')
        .upsert(notificationsToInsert, {
          onConflict: 'notification_uuid',
          ignoreDuplicates: true  // Don't overwrite existing records
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
        // Count actual new insertions (ignoreDuplicates means existing records won't be in data)
        const insertedCount = newNotificationUuids.length
        inserted += insertedCount
        const skipped = batch.length - notificationsToInsert.length
      }
    } else {
    }
  }
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
    // Parse response
    let responseData: any = null
    try {
      responseData = JSON.parse(responseText)
    } catch (e) {
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
  
  const normalizedEnv = normalizeEnvironment(environment)
  const apiBase = normalizedEnv === AppleEnvironment.SANDBOX ? APPLE_API_BASE_SANDBOX : APPLE_API_BASE_PRODUCTION
  let totalFetched = 0
  let totalInserted = 0
  let allErrors: any[] = []
  let hasMore = true
  let paginationToken: string | null = null
  let pageNumber = 1
  while (hasMore && pageNumber <= MAX_PAGES) {
    try {
      // Add delay between API calls (except for the first call)
      if (pageNumber > 1) {
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
      // Update pagination state
      hasMore = pageResult.hasMore
      paginationToken = pageResult.paginationToken

      if (hasMore) {
      } else {
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
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  // Verify authentication - require admin users only (no service role for this function)
  const auth = await verifyAuth(req, {
    allowServiceRole: false,  // This function should only be called by admin users
    requireAdmin: true
  })

  if (!auth.isValid) {
    return auth.errorResponse!
  }
  try {
    // Initialize Supabase URLs and keys
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Parse request body
    const body = await req.json()
    const { 
      environment = 'production', 
      startDate, 
      endDate, 
      notificationType,
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

    // Use service role client for actual operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get Apple JWT
    const jwt = await getAppleJWT(requestId)

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

    // Check if there are any pending notifications that need processing
    const { count: pendingCount } = await supabase
      .from('notifications_raw')
      .select('*', { count: 'exact', head: true })
      .eq('status', NotificationStatus.PENDING)
      .eq('environment', environment)
      .eq('source', NotificationSource.HISTORY_API)
    
    // Trigger processing if we have new insertions OR existing pending notifications
    if (result.totalInserted > 0 || (pendingCount && pendingCount > 0)) {
      const notificationsToProcess = pendingCount ?? result.totalInserted ?? 0
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const processUrl = `${supabaseUrl}/functions/v1/process-notifications`
        
        // Process in batches of 50 to avoid timeout
        const batchSize = 50
        const batches = Math.ceil(notificationsToProcess / batchSize)
        let totalProcessed = 0
        let totalFailed = 0
        const batchResults = []
        
        for (let i = 0; i < batches; i++) {
          try {
            // Wait for each batch to complete before processing the next one
            const response = await fetch(processUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                limit: batchSize
              })
            })
            
            if (response.ok) {
              const result = await response.json()
              totalProcessed += result.processed || 0
              totalFailed += result.failed || 0
              batchResults.push({
                batch: i + 1,
                processed: result.processed || 0,
                failed: result.failed || 0,
                total: result.total || 0
              })
              // If no notifications were processed in this batch, stop processing
              // This means we've processed all pending notifications
              if (!result.total || result.total === 0) {
                break
              }
            } else {
              const errorText = await response.text()
              console.error(`[${requestId}] ✗ Batch ${i + 1} failed with status ${response.status}: ${errorText}`)
              batchResults.push({
                batch: i + 1,
                error: `HTTP ${response.status}: ${errorText}`
              })
            }
            
            // Delay between batches to avoid overwhelming the system
            // Longer delay for larger batches or if previous batch had failures
            if (i < batches - 1) {
              const delayMs = totalFailed > 0 ? 2000 : 500  // 2s delay if there were failures, 500ms otherwise
              await new Promise(resolve => setTimeout(resolve, delayMs))
            }
          } catch (error) {
            console.error(`[${requestId}] ✗ Batch ${i + 1} encountered error:`, error)
            batchResults.push({
              batch: i + 1,
              error: error instanceof Error ? error.message : String(error)
            })
            
            // Continue with next batch even if one fails
            if (i < batches - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000))  // Wait 2s after error
            }
          }
        }
      } catch (error) {
        console.error(`[${requestId}] ⚠️ Warning: Failed to trigger notification processing:`, error)
        console.error(`[${requestId}] Notifications were imported but not processed automatically`)
        console.error(`[${requestId}] They will remain in 'pending' status until manually processed`)
      }
    }

    const duration = Date.now() - startTime
    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalFetched: result.totalFetched,
          inserted: result.totalInserted,
          skipped: result.totalFetched - result.totalInserted,
          totalPages: result.totalPages,
          errors: result.errors.length > 0 ? result.errors : undefined,
          processingTriggered: result.totalInserted > 0
        },
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
    console.error(`[${requestId}] Error Type: ${error instanceof Error ? error.name : 'Unknown'}`)
    console.error(`[${requestId}] Error Message: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`[${requestId}] Stack Trace:`, error instanceof Error ? error.stack : 'N/A')
    console.error(`[${requestId}] Processing time before error: ${duration}ms`)
    console.error(`[${requestId}] ************************************************************`)
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to initialize data',
        requestId,
        processingTime: duration
      }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
