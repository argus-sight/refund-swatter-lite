import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  console.log('[CRON] Process notifications cron job started')

  try {
    // Verify this is a valid cron request (check authorization header)
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      throw new Error('Unauthorized: Missing authorization header')
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Query for pending notifications that need processing
    // Criteria:
    // 1. Status is 'pending' OR 'failed' (with retry logic)
    // 2. Received more than 5 minutes ago (to avoid processing very recent ones)
    // 3. For failed ones: check retry count and last retry time
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    // Get pending notifications older than 5 minutes
    const { data: pendingNotifications, error: pendingError } = await supabase
      .from('notifications_raw')
      .select('id, notification_type, retry_count')
      .eq('status', 'pending')
      .lt('received_at', fiveMinutesAgo)
      .order('received_at', { ascending: true })
      .limit(50)

    if (pendingError) {
      console.error('[CRON] Error fetching pending notifications:', pendingError)
    }

    // Get failed notifications eligible for retry
    const { data: failedNotifications, error: failedError } = await supabase
      .from('notifications_raw')
      .select('id, notification_type, retry_count, last_retry_at')
      .eq('status', 'failed')
      .lt('retry_count', 3)  // Max 3 retries
      .or(`last_retry_at.is.null,last_retry_at.lt.${thirtyMinutesAgo}`)  // Retry after 30 minutes
      .order('received_at', { ascending: true })
      .limit(20)

    if (failedError) {
      console.error('[CRON] Error fetching failed notifications:', failedError)
    }

    const totalPending = (pendingNotifications?.length || 0) + (failedNotifications?.length || 0)
    
    if (totalPending === 0) {
      console.log('[CRON] No notifications to process')
      return new Response(
        JSON.stringify({ 
          message: 'No notifications to process',
          duration: Date.now() - startTime
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    console.log(`[CRON] Found ${totalPending} notifications to process`)
    console.log(`[CRON] - Pending: ${pendingNotifications?.length || 0}`)
    console.log(`[CRON] - Failed (retry): ${failedNotifications?.length || 0}`)

    // Update retry count for failed notifications
    if (failedNotifications && failedNotifications.length > 0) {
      for (const notification of failedNotifications) {
        await supabase
          .from('notifications_raw')
          .update({
            retry_count: (notification.retry_count || 0) + 1,
            last_retry_at: new Date().toISOString(),
            status: 'pending'  // Reset to pending for retry
          })
          .eq('id', notification.id)
      }
    }

    // Call process-notifications function
    const processUrl = `${supabaseUrl}/functions/v1/process-notifications`
    
    const processResponse = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        limit: totalPending
      })
    })

    let processResult = { processed: 0, failed: 0 }
    
    if (processResponse.ok) {
      processResult = await processResponse.json()
      console.log(`[CRON] Processing completed:`)
      console.log(`[CRON] - Processed: ${processResult.processed}`)
      console.log(`[CRON] - Failed: ${processResult.failed}`)
    } else {
      console.error('[CRON] Failed to process notifications:', await processResponse.text())
    }

    // Check for permanently failed notifications (retry_count >= 3)
    const { data: permanentlyFailed, error: permanentError } = await supabase
      .from('notifications_raw')
      .select('count')
      .eq('status', 'failed')
      .gte('retry_count', 3)
      .single()

    if (!permanentError && permanentlyFailed?.count > 0) {
      console.warn(`[CRON] WARNING: ${permanentlyFailed.count} notifications permanently failed (exceeded retry limit)`)
      
      // Mark them as permanently failed
      await supabase
        .from('notifications_raw')
        .update({ status: 'failed_permanent' })
        .eq('status', 'failed')
        .gte('retry_count', 3)
    }

    const duration = Date.now() - startTime
    console.log(`[CRON] Cron job completed in ${duration}ms`)

    return new Response(
      JSON.stringify({ 
        processed: processResult.processed,
        failed: processResult.failed,
        totalFound: totalPending,
        permanentlyFailed: permanentlyFailed?.count || 0,
        duration
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[CRON] Error in cron job:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        duration
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})