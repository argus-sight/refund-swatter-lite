import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = await getServiceSupabase()
    
    const { data, error } = await supabase
      .from('config')
      .select('*')
      .eq('id', 1)
      .single()
    
    if (error) {
      throw new Error(`Failed to fetch config: ${error.message}`)
    }
    
    return NextResponse.json(data || null)
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
    const supabase = await getServiceSupabase()
    
    // Use UPSERT to handle both insert and update cases
    const { data, error } = await supabase
      .from('config')
      .upsert({
        id: 1,
        ...body
      })
      .eq('id', 1)
      .select()
      .single()
    
    if (error) {
      console.error('Config update failed:', error)
      throw new Error(`Failed to update config: ${error.message}`)
    }
    
    return NextResponse.json(data || null)
  } catch (error: any) {
    console.error('Error updating config:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update config' },
      { status: 500 }
    )
  }
}