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
    const { transactionId, revision, environment } = await req.json()
    
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
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

    // Fetch transaction history
    const apiBase = APPLE_API_BASE[environment as keyof typeof APPLE_API_BASE] || APPLE_API_BASE.sandbox
    let url = `${apiBase}/history/${transactionId}`
    if (revision) {
      url += `?revision=${revision}`
    }

    console.log('Fetching transaction history:', {
      url,
      transactionId,
      environment,
      apiBase
    })

    const startTime = Date.now()
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`
      }
    })
    const endTime = Date.now()

    const responseText = await response.text()
    let data = null
    
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error('Failed to parse response:', responseText)
      return new Response(
        JSON.stringify({ 
          error: 'Invalid response from Apple API',
          responseText
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 502
        }
      )
    }

    // Log the API request
    await supabase.from('apple_api_logs').insert({
      endpoint: url,
      method: 'GET',
      request_body: null,
      response_status: response.status,
      response_body: data,
      response_time_ms: endTime - startTime,
      environment: environment,
      notes: `Transaction history for ${transactionId}`
    })

    if (!response.ok) {
      console.error('Apple API error:', data)
      return new Response(
        JSON.stringify({ 
          error: data.errorMessage || data.error || 'Failed to fetch transaction history',
          errorCode: data.errorCode,
          details: data
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: response.status
        }
      )
    }

    // Parse transaction data
    const signedTransactions = data.signedTransactions || []
    const transactions = []
    
    for (const signedTransaction of signedTransactions) {
      try {
        const parts = signedTransaction.split('.')
        const payload = JSON.parse(atob(parts[1]))
        transactions.push(payload)
      } catch (e) {
        console.error('Error parsing signed transaction:', e)
      }
    }

    const result = {
      ...data,
      transactions,
      hasResponse: !!data.hasMore,
      revision: data.revision
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error fetching transaction history:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to fetch transaction history'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})