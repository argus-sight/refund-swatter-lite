import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await supabase
      .from('consumption_request_details')
      .select('*')
      .eq('request_id', params.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Consumption request not found' },
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching consumption request:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch consumption request' },
      { status: 500 }
    )
  }
}