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
    const { notificationId } = await req.json()
    
    if (!notificationId) {
      return new Response(
        JSON.stringify({ error: 'Notification ID is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // First, reset the notification status to pending
    const { data: notification, error: updateError } = await supabase
      .from('notifications_raw')
      .update({ 
        status: 'pending',
        processed_at: null,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Failed to reset notification: ${updateError.message}`)
    }

    // Call process-notifications Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/process-notifications`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        limit: 1, // Process just this notification
        notificationType: notification.notification_type
      })
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to process notification')
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Notification queued for retry',
        data: result
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error retrying notification:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to retry notification'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})