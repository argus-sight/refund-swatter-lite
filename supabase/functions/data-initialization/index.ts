import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Apple API base URLs
const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com/inApps/v1'
const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'

async function getAppleJWT(): Promise<string> {
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
    throw new Error('Failed to generate JWT')
  }

  const data = await response.json()
  return data.jwt
}

async function fetchNotificationHistory(
  jwt: string,
  environment: string,
  startDate?: Date,
  endDate?: Date,
  notificationTypes?: string[]
): Promise<any> {
  const apiBase = environment === 'sandbox' ? APPLE_API_BASE_SANDBOX : APPLE_API_BASE_PRODUCTION
  const url = new URL(`${apiBase}/notifications/history`)
  
  // Build request body
  const body: any = {
    startDate: startDate ? startDate.toISOString() : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: endDate ? endDate.toISOString() : new Date().toISOString()
  }
  
  if (notificationTypes && notificationTypes.length > 0) {
    body.notificationTypes = notificationTypes
  }
  
  console.log('Fetching notification history from Apple:')
  console.log('Environment:', environment)
  console.log('Date range:', body.startDate, 'to', body.endDate)
  
  const allNotifications = []
  let paginationToken = null
  let hasMore = true
  
  while (hasMore) {
    const requestBody = { ...body }
    if (paginationToken) {
      requestBody.paginationToken = paginationToken
    }
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Apple API error: ${response.status} - ${errorText}`)
    }
    
    const data = await response.json()
    
    if (data.notificationHistory && data.notificationHistory.length > 0) {
      allNotifications.push(...data.notificationHistory)
    }
    
    hasMore = data.hasMore || false
    paginationToken = data.paginationToken
    
    console.log(`Fetched ${data.notificationHistory?.length || 0} notifications, hasMore: ${hasMore}`)
  }
  
  return allNotifications
}

async function processNotification(
  signedPayload: string,
  supabase: any
): Promise<void> {
  try {
    // Call webhook function to process the notification
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const response = await fetch(`${supabaseUrl}/functions/v1/webhook`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ signedPayload })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Error processing notification:', errorText)
    }
  } catch (error) {
    console.error('Failed to process notification:', error)
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const body = await req.json()
    const { startDate, endDate, notificationTypes, processData = true } = body
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Get config
    const { data: config, error: configError } = await supabase
      .from('config')
      .select('environment, bundle_id')
      .single()
    
    if (configError || !config) {
      throw new Error('Configuration not found')
    }
    
    // Get Apple JWT
    const jwt = await getAppleJWT()
    
    // Fetch notification history from Apple
    const notifications = await fetchNotificationHistory(
      jwt,
      config.environment,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      notificationTypes
    )
    
    console.log(`Total notifications fetched: ${notifications.length}`)
    
    let processedCount = 0
    let errorCount = 0
    
    if (processData) {
      // Process each notification
      for (const notification of notifications) {
        try {
          await processNotification(notification.signedPayload, supabase)
          processedCount++
          
          // Add small delay to avoid overwhelming the system
          if (processedCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        } catch (error) {
          console.error('Error processing notification:', error)
          errorCount++
        }
      }
    }
    
    const result = {
      success: true,
      total: notifications.length,
      processed: processedCount,
      errors: errorCount,
      environment: config.environment,
      dateRange: {
        start: startDate || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        end: endDate || new Date().toISOString()
      }
    }
    
    console.log('Data initialization complete:', result)
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
    
  } catch (error) {
    console.error('Data initialization error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})