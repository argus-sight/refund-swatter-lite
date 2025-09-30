import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'
import { AppleEnvironment, normalizeEnvironment } from '../_shared/constants.ts'
import { getAppleJWT } from '../_shared/apple-jwt.ts'

// Apple API base URLs
const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com/inApps/v1'
const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'

async function sendConsumptionToApple(
  jwt: string,
  originalTransactionId: string,
  consumptionData: any,
  environment: string,
  supabase: any,
  consumptionRequestId?: string,
  requestId?: string
): Promise<{ success: boolean; response?: any; error?: string; statusCode?: number }> {
  const startTime = Date.now()
  let logId: string | null = null
  const reqId = requestId || 'unknown'
  try {
    // Select the correct Apple API base URL based on environment
    const normalizedEnv = normalizeEnvironment(environment)
    const apiBase = normalizedEnv === AppleEnvironment.SANDBOX ? APPLE_API_BASE_SANDBOX : APPLE_API_BASE_PRODUCTION
    const url = `${apiBase}/transactions/consumption/${originalTransactionId}`
    const requestHeaders = {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'User-Agent': 'RefundSwatterLite/1.0'
    }
    // Log API call
    const { data: logData, error: logError } = await supabase
      .from('apple_api_logs')
      .insert({
        consumption_request_id: consumptionRequestId,
        endpoint: url,
        method: 'PUT',
        request_headers: requestHeaders,
        request_body: consumptionData
      })
      .select('id')
      .single()
    
    if (!logError && logData) {
      logId = logData.id
    }
    
    // Send request to Apple
    const response = await fetch(url, {
      method: 'PUT',
      headers: requestHeaders,
      body: JSON.stringify(consumptionData)
    })
    
    const responseText = await response.text()
    const duration = Date.now() - startTime
    
    // Update log with response
    if (logId) {
      await supabase
        .from('apple_api_logs')
        .update({
          response_status: response.status,
          response_headers: Object.fromEntries(response.headers.entries()),
          response_body: responseText ? JSON.parse(responseText) : null,
          duration_ms: duration
        })
        .eq('id', logId)
    }
    
    if (response.status === 200 || response.status === 202) {
      return { 
        success: true, 
        response: responseText ? JSON.parse(responseText) : null,
        statusCode: response.status
      }
    } else {
      console.error('Apple API error:', response.status, responseText)
      return { 
        success: false, 
        error: `Apple API returned ${response.status}: ${responseText}`,
        statusCode: response.status
      }
    }
  } catch (error) {
    console.error('Error sending consumption data:', error)
    return { 
      success: false, 
      error: error.message 
    }
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

  // Verify authentication - allow both service role and admin users
  const auth = await verifyAuth(req, {
    allowServiceRole: true,
    requireAdmin: true
  })

  if (!auth.isValid) {
    return auth.errorResponse!
  }
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    // Check if request body contains a specific jobId for immediate processing
    let jobId: string | null = null
    let immediate = false
    
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        jobId = body.jobId || null
        immediate = body.immediate || false
      } catch (e) {
      }
    }

    let jobs
    let jobsError

    if (jobId) {
      // Process specific job immediately
      const result = await supabase
        .from('send_consumption_jobs')
        .select(`
          *,
          consumption_requests!inner(
            original_transaction_id,
            deadline,
            environment
          )
        `)
        .eq('id', jobId)
        .single()
      
      jobs = result.data ? [result.data] : []
      jobsError = result.error
    } else {
      // Get pending consumption jobs with environment information
      const result = await supabase
        .from('send_consumption_jobs')
        .select(`
          *,
          consumption_requests!inner(
            original_transaction_id,
            deadline,
            environment
          )
        `)
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(10)
      
      jobs = result.data
      jobsError = result.error
    }

    if (jobsError) {
      console.error(`[${requestId}] ERROR fetching jobs:`, jobsError)
      throw jobsError
    }
    if (!jobs || jobs.length === 0) {
      const duration = Date.now() - startTime
      return new Response(
        JSON.stringify({ message: 'No pending jobs', requestId, processingTime: duration }),
        { 
          headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Get Apple JWT
    const jwt = await getAppleJWT(requestId)

    // Process each job
    const results = []
    for (const job of jobs) {
      // Update job status to processing
      await supabase
        .from('send_consumption_jobs')
        .update({ 
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id)

      // Send consumption data to Apple using the environment from consumption_request
      const environment = job.consumption_requests.environment || 'production'  // Default to production if not set
      const result = await sendConsumptionToApple(
        jwt,
        job.consumption_requests.original_transaction_id,
        job.consumption_data,
        environment,
        supabase,
        job.consumption_request_id,
        requestId
      )

      if (result.success) {
        // Update job as sent with status code
        await supabase
          .from('send_consumption_jobs')
          .update({
            status: 'sent',
            response_data: result.response,
            response_status_code: result.statusCode,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        // Update consumption request status
        await supabase
          .from('consumption_requests')
          .update({
            status: 'sent',
            updated_at: new Date().toISOString()
          })
          .eq('id', job.consumption_request_id)

        results.push({ job_id: job.id, success: true })
      } else {
        // Update job as failed with retry logic and status code
        const newRetryCount = job.retry_count + 1
        const shouldRetry = newRetryCount < job.max_retries
        
        await supabase
          .from('send_consumption_jobs')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            error_message: result.error,
            response_status_code: result.statusCode,
            retry_count: newRetryCount,
            scheduled_at: shouldRetry 
              ? new Date(Date.now() + (5 * 60 * 1000)).toISOString() // Retry in 5 minutes
              : job.scheduled_at,
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        if (!shouldRetry) {
          // Update consumption request as failed
          await supabase
            .from('consumption_requests')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', job.consumption_request_id)
        }

        results.push({ 
          job_id: job.id, 
          success: false, 
          error: result.error,
          will_retry: shouldRetry
        })
      }
    }

    return new Response(
      JSON.stringify({ 
        processed: results.length,
        results 
      }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Send consumption error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
