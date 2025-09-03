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
    const pathSegments = url.pathname.split('/')
    const requestId = pathSegments[pathSegments.length - 1]
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Use service role to access the data
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if this is a request for a specific consumption request
    if (requestId && requestId !== 'consumption-requests') {
      const { data, error } = await supabase
        .from('consumption_request_details')
        .select('*')
        .eq('request_id', requestId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return new Response(
            JSON.stringify({ error: 'Consumption request not found' }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 404
            }
          )
        }
        throw error
      }

      return new Response(
        JSON.stringify(data),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // Otherwise, handle list request
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const status = url.searchParams.get('status') // optional filter by status
    const environment = url.searchParams.get('environment') // optional filter by environment

    let query = supabase
      .from('consumption_request_details')
      .select('*', { count: 'exact' })
      .order('request_created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('request_status', status)
    }

    if (environment) {
      query = query.eq('environment', environment)
    }

    const { data, error, count } = await query

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify({
        data: data || [],
        total: count || 0,
        limit,
        offset
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error fetching consumption requests:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to fetch consumption requests'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})