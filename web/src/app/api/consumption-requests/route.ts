import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status') // optional filter by status
    const environment = searchParams.get('environment') // optional filter by environment

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let query = supabase
      .from('consumption_request_details')
      .select('*')
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

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      limit,
      offset
    })
  } catch (error: any) {
    console.error('Error fetching consumption requests:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch consumption requests' },
      { status: 500 }
    )
  }
}