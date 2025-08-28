import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const response = await fetch(`${supabaseUrl}/rest/v1/config?select=*&id=eq.1`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.statusText}`)
    }

    const data = await response.json()
    return NextResponse.json(data[0] || null)
  } catch (error: any) {
    console.error('Error fetching config:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch config' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const response = await fetch(`${supabaseUrl}/rest/v1/config?id=eq.1`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(`Failed to update config: ${response.statusText}`)
    }

    const data = await response.json()
    return NextResponse.json(data[0] || null)
  } catch (error: any) {
    console.error('Error updating config:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update config' },
      { status: 500 }
    )
  }
}