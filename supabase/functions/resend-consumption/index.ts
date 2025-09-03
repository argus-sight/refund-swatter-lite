import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { requestId, jobId } = await req.json()
    
    if (!requestId && !jobId) {
      return new Response(
        JSON.stringify({ error: 'Either requestId or jobId is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let targetJobId = jobId

    // If only requestId is provided, find or create a job
    if (!jobId && requestId) {
      // Check if there's an existing job
      const { data: existingJob } = await supabase
        .from('send_consumption_jobs')
        .select('id')
        .eq('consumption_request_id', requestId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (existingJob) {
        targetJobId = existingJob.id
        
        // Reset the existing job to pending
        await supabase
          .from('send_consumption_jobs')
          .update({
            status: 'pending',
            retry_count: 0,
            scheduled_at: new Date().toISOString(),
            error_message: null,
            response_status_code: null,
            sent_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetJobId)
      } else {
        // Create a new job
        const { data: consumptionRequest, error: fetchError } = await supabase
          .from('consumption_requests')
          .select('id, original_transaction_id')
          .eq('id', requestId)
          .single()

        if (fetchError || !consumptionRequest) {
          throw new Error('Consumption request not found')
        }

        // Calculate consumption data
        const { data: calculatedData, error: calcError } = await supabase
          .rpc('calculate_consumption_data', {
            p_original_transaction_id: consumptionRequest.original_transaction_id
          })

        if (calcError) {
          throw new Error(`Failed to calculate consumption data: ${calcError.message}`)
        }

        // Create new job
        const { data: newJob, error: createError } = await supabase
          .from('send_consumption_jobs')
          .insert({
            consumption_request_id: requestId,
            consumption_data: calculatedData,
            status: 'pending',
            scheduled_at: new Date().toISOString()
          })
          .select('id')
          .single()

        if (createError || !newJob) {
          throw new Error('Failed to create send job')
        }

        targetJobId = newJob.id
      }
    }

    // Call send-consumption Edge Function with the specific job ID
    const response = await fetch(`${supabaseUrl}/functions/v1/send-consumption`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobId: targetJobId,
        immediate: true
      })
    })

    const result = await response.json()
    
    if (!response.ok) {
      console.error('Edge Function error:', result)
      return new Response(
        JSON.stringify({ 
          error: result.error || 'Failed to resend consumption data',
          details: result
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: response.status
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Consumption data resent successfully',
        jobId: targetJobId,
        result: result
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error resending consumption:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to resend consumption data'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})