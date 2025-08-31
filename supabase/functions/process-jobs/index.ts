import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  // Check for cron secret first (backward compatibility)
  const cronSecret = req.headers.get('x-cron-secret')
  const expectedSecret = Deno.env.get('CRON_SECRET')
  const hasCronSecret = expectedSecret && cronSecret === expectedSecret

  // If no valid cron secret, verify JWT auth
  if (!hasCronSecret) {
    const auth = await verifyAuth(req, {
      allowServiceRole: true,
      requireAdmin: true
    })

    if (!auth.isValid) {
      console.error('Authentication failed')
      return auth.errorResponse!
    }
    
    console.log(`Authenticated: ${auth.isServiceRole ? 'Service Role' : `User ${auth.user?.email}`}`)
  } else {
    console.log('Authenticated via cron secret')
  }

  try {
    console.log('Processing consumption jobs...')
    
    // Call send-consumption function to process pending jobs
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-consumption`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Send consumption failed: ${errorText}`)
    }

    const result = await response.json()
    console.log('Job processing complete:', result)

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Process jobs error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})