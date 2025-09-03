import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APPLE_API_BASE = {
  production: 'https://api.storekit.itunes.apple.com/inApps/v1',
  sandbox: 'https://api.storekit-sandbox.itunes.apple.com/inApps/v1'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { transactionId, environment } = await req.json()
    
    if (!transactionId) {
      return new Response(
        JSON.stringify({ error: 'Transaction ID is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Get Apple JWT
    const jwtResponse = await fetch(`${supabaseUrl}/functions/v1/apple-jwt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!jwtResponse.ok) {
      throw new Error('Failed to generate Apple JWT')
    }

    const { jwt } = await jwtResponse.json()

    // Fetch refund history
    const apiBase = APPLE_API_BASE[environment as keyof typeof APPLE_API_BASE] || APPLE_API_BASE.sandbox
    const response = await fetch(`${apiBase}/refund/lookup/${transactionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`
      }
    })

    if (response.status === 404) {
      return new Response(
        JSON.stringify({ refundHistory: [] }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    const data = await response.json()

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: data.errorMessage || 'Failed to fetch refund history',
          details: data
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: response.status
        }
      )
    }

    // Parse the data
    const refundHistory = data.signedTransactions?.map((signed: string) => {
      try {
        const parts = signed.split('.')
        const payload = JSON.parse(atob(parts[1]))
        return payload
      } catch (e) {
        console.error('Error parsing transaction:', e)
        return null
      }
    }).filter(Boolean) || []

    return new Response(
      JSON.stringify({ refundHistory }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error fetching refund history:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to fetch refund history'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})