import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authResult = await requireAuth(req)
    if (authResult.error) {
      return authResult.error
    }
    const { supabase, user } = authResult

    // Check if user is admin
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (adminError || !adminUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403
        }
      )
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 405
        }
      )
    }

    const { privateKey } = await req.json()
    
    if (!privateKey) {
      return new Response(
        JSON.stringify({ error: 'Private key is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }
    
    console.log('Private key received', {
      keyLength: privateKey.length,
      keyPreview: privateKey.substring(0, 50) + '...'
    })

    // Use service role key for storing secrets
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // Store private key using the vault function
    console.log('Storing private key in database...')
    const { data, error } = await supabaseAdmin
      .rpc('store_apple_private_key', {
        p_private_key: privateKey
      })

    if (error) {
      console.error('Failed to store private key', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to store private key',
          details: error.message
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    console.log('Private key stored successfully', { secretId: data })
    
    return new Response(
      JSON.stringify({ 
        success: true,
        secretId: data
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error in store-apple-key function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Setup failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})