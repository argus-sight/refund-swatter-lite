import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Apple API base URLs
const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com/inApps/v1'
const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'

async function getAppleJWT(supabase: any, requestId: string): Promise<string> {
  try {
    console.log(`[${requestId}] Getting Apple JWT token...`)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    console.log(`[${requestId}] Calling apple-jwt function...`)
    const response = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    console.log(`[${requestId}] Apple JWT response status: ${response.status}`)
    
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
  
  console.log(`[${reqId}] >>> Sending consumption data to Apple`)
  console.log(`[${reqId}] Transaction ID: ${originalTransactionId}`)
  console.log(`[${reqId}] Request ID: ${consumptionRequestId || 'N/A'}`)
  
  try {
    // Select the correct Apple API base URL based on environment
    const apiBase = environment === 'sandbox' ? APPLE_API_BASE_SANDBOX : APPLE_API_BASE_PRODUCTION
    const url = `${apiBase}/transactions/consumption/${originalTransactionId}`
    const requestHeaders = {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'User-Agent': 'RefundSwatterLite/1.0'
    }
    
    console.log('Sending consumption data to Apple:')
    console.log('Environment:', environment)
    console.log('URL:', url)
    console.log('Consumption data:', JSON.stringify(consumptionData, null, 2))
    
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
      console.log('Successfully sent consumption data to Apple')
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
  
  console.log(`[${requestId}] ==> Send-Consumption Request Started`)
  console.log(`[${requestId}] Method: ${req.method}`)
  console.log(`[${requestId}] URL: ${req.url}`)
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] CORS preflight request handled`)
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    console.log(`[${requestId}] Initializing Supabase client...`)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    console.log(`[${requestId}] Supabase client initialized`)

    // Check if request body contains a specific jobId for immediate processing
    let jobId: string | null = null
    let immediate = false
    
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        jobId = body.jobId || null
        immediate = body.immediate || false
        console.log(`[${requestId}] Request body - jobId: ${jobId}, immediate: ${immediate}`)
      } catch (e) {
        console.log(`[${requestId}] No valid JSON body provided`)
      }
    }

    let jobs
    let jobsError

    if (jobId) {
      // Process specific job immediately
      console.log(`[${requestId}] Fetching specific job: ${jobId}`)
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
      console.log(`[${requestId}] Fetching pending consumption jobs...`)
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

    console.log(`[${requestId}] Found ${jobs?.length || 0} pending jobs`)

    if (!jobs || jobs.length === 0) {
      console.log(`[${requestId}] No pending jobs to process`)
      const duration = Date.now() - startTime
      console.log(`[${requestId}] Request completed in ${duration}ms`)
      return new Response(
        JSON.stringify({ message: 'No pending jobs', requestId, processingTime: duration }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Get Apple JWT
    const jwt = await getAppleJWT(supabase, requestId)

    // Process each job
    console.log(`[${requestId}] Starting to process ${jobs.length} jobs...`)
    const results = []
    for (const job of jobs) {
      console.log(`[${requestId}] >>> Processing job ${job.id}`)
      console.log(`[${requestId}] Job status: ${job.status}`)
      console.log(`[${requestId}] Retry count: ${job.retry_count}/${job.max_retries}`)
      
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
      console.log(`[${requestId}] Using environment: ${environment} for job ${job.id}`)
      
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Send consumption error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})