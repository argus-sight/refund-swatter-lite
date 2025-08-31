import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { requestId, jobId } = await request.json()
    
    if (!requestId && !jobId) {
      return NextResponse.json(
        { error: 'Either requestId or jobId is required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
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

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to send consumption data: ${error}`)
    }

    const result = await response.json()

    // Update consumption request status based on result
    if (requestId && result.results && result.results.length > 0) {
      const jobResult = result.results[0]
      await supabase
        .from('consumption_requests')
        .update({
          status: jobResult.success ? 'sent' : 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)
    }

    return NextResponse.json({
      success: true,
      message: 'Consumption data resent to Apple',
      result
    })
  } catch (error: any) {
    console.error('Error resending consumption data:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to resend consumption data' },
      { status: 500 }
    )
  }
}