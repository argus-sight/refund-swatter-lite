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
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }

    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/')
    const requestId = pathSegments[pathSegments.length - 1]
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // First, verify the user's token
    const token = authHeader.replace('Bearer ', '')
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    })
    
    // Verify the user is authenticated
    const { data: { user }, error: authError } = await userSupabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }
    
    // Now use service role to access the data
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