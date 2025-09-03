import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'

const corsHeaders = getCorsHeaders()

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
      requireAdmin: false
    })

    if (!auth.isValid) {
      return auth.errorResponse!
    }

    const { user } = auth

    const url = new URL(req.url)
    const environment = url.searchParams.get('environment')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Now use service role to access the data
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the RPC function
    const { data, error } = await supabase.rpc('get_consumption_metrics_summary', 
      environment ? { p_environment: environment } : {}
    )

    if (error) {
      console.error('Supabase RPC error:', error)
      return new Response(
        JSON.stringify({ 
          error: error.message || 'Failed to fetch metrics',
          details: error
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }
    
    // Supabase RPC returns an array, but we need the first element
    const metrics = Array.isArray(data) && data.length > 0 ? data[0] : data
    
    return new Response(
      JSON.stringify(metrics),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error fetching consumption metrics:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to fetch metrics'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})