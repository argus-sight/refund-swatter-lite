import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const environment = searchParams.get('environment')
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Build the RPC body with optional environment parameter
    const rpcBody = environment ? { p_environment: environment } : {}

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_consumption_metrics_summary`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(rpcBody)
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error('Supabase RPC error:', data)
      return NextResponse.json(
        { 
          error: data.message || data.error || `Failed to fetch metrics: ${response.statusText}`,
          details: data
        },
        { status: response.status }
      )
    }
    // Supabase RPC returns an array, but we need the first element
    const metrics = Array.isArray(data) && data.length > 0 ? data[0] : data
    return NextResponse.json(metrics)
  } catch (error: any) {
    console.error('Error fetching consumption metrics:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}