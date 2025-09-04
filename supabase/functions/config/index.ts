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
    
    // Use service role to access the data
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (req.method === 'GET') {
      // Fetch config
      const { data, error } = await supabase
        .from('config')
        .select('*')
        .eq('id', 1)
        .single()
      
      if (error) {
        throw new Error(`Failed to fetch config: ${error.message}`)
      }
      
      return new Response(
        JSON.stringify(data || null),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      // Update config
      const body = await req.json()
      
      // Remove the action field if it exists (used for routing but not needed in DB)
      const { action, ...configData } = body
      
      // Use UPSERT to handle both insert and update cases
      const { data, error } = await supabase
        .from('config')
        .upsert({
          id: 1,
          ...configData
        })
        .eq('id', 1)
        .select()
        .single()
      
      if (error) {
        console.error('Config update failed:', error)
        throw new Error(`Failed to update config: ${error.message}`)
      }
      
      return new Response(
        JSON.stringify(data || null),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  } catch (error) {
    console.error('Error in config function:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})