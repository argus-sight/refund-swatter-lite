import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { notification_uuid } = await req.json()

    if (!notification_uuid) {
      return new Response(
        JSON.stringify({ error: 'notification_uuid is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if this is a CONSUMPTION_REQUEST notification
    // First check notifications_raw
    const { data: notification, error: notificationError } = await supabase
      .from('notifications_raw')
      .select('id, notification_type, original_transaction_id: decoded_transaction_info->originalTransactionId')
      .eq('notification_uuid', notification_uuid)
      .single()

    if (!notificationError && notification && notification.notification_type === 'CONSUMPTION_REQUEST') {
      // This is a consumption request, handle it specially
      
      // Find the existing consumption request
      const { data: consumptionRequest, error: crError } = await supabase
        .from('consumption_requests')
        .select('id, original_transaction_id')
        .eq('notification_id', notification.id)
        .single()

      if (!crError && consumptionRequest) {
        // Get the original_transaction_id
        const originalTransactionId = consumptionRequest.original_transaction_id || notification.original_transaction_id

        if (originalTransactionId) {
          // 1. Recalculate consumption data with the latest logic
          const { data: consumptionData, error: calcError } = await supabase
            .rpc('calculate_consumption_data', { p_original_transaction_id: originalTransactionId })

          if (calcError) {
            throw new Error(`Failed to calculate consumption data: ${calcError.message}`)
          }

          // 2. Create a new send_consumption_job
          const { data: newJob, error: jobError } = await supabase
            .from('send_consumption_jobs')
            .insert({
              consumption_request_id: consumptionRequest.id,
              status: 'pending',
              consumption_data: consumptionData,
              scheduled_at: new Date().toISOString()
            })
            .select()
            .single()

          if (jobError) {
            throw new Error(`Failed to create send job: ${jobError.message}`)
          }

          // 3. Trigger the send-consumption function to process immediately
          const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-consumption`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
          })

          if (!sendResponse.ok) {
            console.error('Failed to trigger send-consumption:', await sendResponse.text())
          }

          // 4. Get the updated job status
          const { data: updatedJob } = await supabase
            .from('send_consumption_jobs')
            .select('status, response_status_code, sent_at')
            .eq('id', newJob.id)
            .single()

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Consumption request reprocessed successfully',
              details: {
                notification_uuid,
                original_transaction_id: originalTransactionId,
                job_id: newJob.id,
                job_status: updatedJob?.status || 'pending',
                response_code: updatedJob?.response_status_code,
                sent_at: updatedJob?.sent_at
              }
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else {
          throw new Error('Original transaction ID not found')
        }
      } else {
        throw new Error('Consumption request not found')
      }
    } else {
      // Check if it exists in consumption_request_webhooks (legacy data)
      const { data: consumptionWebhook } = await supabase
        .from('consumption_request_webhooks')
        .select(`
          notification_uuid,
          consumption_requests (
            id,
            original_transaction_id
          )
        `)
        .eq('notification_uuid', notification_uuid)
        .single()

      if (consumptionWebhook && consumptionWebhook.consumption_requests) {
        const consumptionRequest = consumptionWebhook.consumption_requests
        const originalTransactionId = consumptionRequest.original_transaction_id

        if (originalTransactionId) {
          // 1. Recalculate consumption data
          const { data: consumptionData, error: calcError } = await supabase
            .rpc('calculate_consumption_data', { p_original_transaction_id: originalTransactionId })

          if (calcError) {
            throw new Error(`Failed to calculate consumption data: ${calcError.message}`)
          }

          // 2. Create a new send_consumption_job
          const { data: newJob, error: jobError } = await supabase
            .from('send_consumption_jobs')
            .insert({
              consumption_request_id: consumptionRequest.id,
              status: 'pending',
              consumption_data: consumptionData,
              scheduled_at: new Date().toISOString()
            })
            .select()
            .single()

          if (jobError) {
            throw new Error(`Failed to create send job: ${jobError.message}`)
          }

          // 3. Trigger the send-consumption function
          const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-consumption`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
          })

          if (!sendResponse.ok) {
            console.error('Failed to trigger send-consumption:', await sendResponse.text())
          }

          // 4. Get the updated job status
          const { data: updatedJob } = await supabase
            .from('send_consumption_jobs')
            .select('status, response_status_code, sent_at')
            .eq('id', newJob.id)
            .single()

          return new Response(
            JSON.stringify({
              success: true,
              message: 'Consumption request reprocessed successfully',
              details: {
                notification_uuid,
                original_transaction_id: originalTransactionId,
                job_id: newJob.id,
                job_status: updatedJob?.status || 'pending',
                response_code: updatedJob?.response_status_code,
                sent_at: updatedJob?.sent_at
              }
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else {
          throw new Error('Original transaction ID not found')
        }
      } else {
        return new Response(
          JSON.stringify({ 
            error: 'This notification is not a CONSUMPTION_REQUEST or was not found',
            message: 'Only CONSUMPTION_REQUEST notifications can be reprocessed with this function'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
  } catch (error) {
    console.error('Error reprocessing notification:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})