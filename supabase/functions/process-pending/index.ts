import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  try {
    // Verify authentication
    const auth = await verifyAuth(req, {
      allowServiceRole: false,
      requireAdmin: true
    })

    if (!auth.isValid) {
      return auth.errorResponse!
    }

    const { user } = auth

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 405
        }
      )
    }

    const body = await req.json()
    const { limit = 50, source } = body
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization')!
    
    console.log(`Processing pending notifications: limit=${limit}, source=${source || 'all'}`)
    
    // Get count of pending notifications using service role for accurate count
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    let countQuery = supabaseAdmin
      .from('notifications_raw')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    
    if (source) {
      countQuery = countQuery.eq('source', source)
    }
    
    const { count, error: countError } = await countQuery
    
    if (countError) {
      throw new Error(`Failed to count pending notifications: ${countError.message}`)
    }
    
    console.log(`Found ${count || 0} pending notifications`)
    
    if (!count || count === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending notifications to process',
          processed: 0,
          total: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }
    
    // Calculate number of batches needed
    const batchSize = Math.min(limit, 50) // Max 50 per batch
    const batches = Math.ceil(count / batchSize)
    
    console.log(`Will process in ${batches} batch(es) of up to ${batchSize} notifications each`)
    
    const results = []
    
    // Trigger processing for each batch
    for (let i = 0; i < batches; i++) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/process-notifications`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            limit: batchSize
          })
        })
        
        const data = await response.json()
        
        if (!response.ok) {
          console.error(`Batch ${i + 1} failed:`, data)
          results.push({
            batch: i + 1,
            success: false,
            error: data.error || 'Failed to process batch',
            details: data.details,
            requestId: data.requestId
          })
        } else {
          console.log(`Batch ${i + 1} processed:`, data)
          results.push({
            batch: i + 1,
            success: true,
            processed: data.processed,
            failed: data.failed
          })
        }
        
        // Small delay between batches
        if (i < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error) {
        console.error(`Error processing batch ${i + 1}:`, error)
        results.push({
          batch: i + 1,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    // Calculate totals
    const totalProcessed = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.processed || 0), 0)
    
    const totalFailed = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.failed || 0), 0)
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Processing triggered for ${count} notifications`,
        batches: batches,
        results: results,
        summary: {
          total: count,
          processed: totalProcessed,
          failed: totalFailed,
          pending: count - totalProcessed - totalFailed
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
    
  } catch (error) {
    console.error('Error in process-pending function:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Failed to process notifications'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})