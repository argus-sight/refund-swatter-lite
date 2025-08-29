import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { limit = 50, source } = body
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    console.log(`Processing pending notifications: limit=${limit}, source=${source || 'all'}`)
    
    // Get count of pending notifications
    const supabase = await getServiceSupabase()
    let countQuery = supabase
      .from('notifications_raw')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    
    if (source) {
      countQuery = countQuery.eq('source', source)
    }
    
    const { count, error: countError } = await countQuery
    
    if (countError) {
      throw new Error(`Failed to count pending notifications: ${countError.message}`)
    }
    
    console.log(`Found ${count || 0} pending notifications`)
    
    if (!count || count === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending notifications to process',
        processed: 0,
        total: 0
      })
    }
    
    // Calculate number of batches needed
    const batchSize = Math.min(limit, 50) // Max 50 per batch
    const batches = Math.ceil(count / batchSize)
    
    console.log(`Will process in ${batches} batch(es) of up to ${batchSize} notifications each`)
    
    const results = []
    
    // Trigger processing for each batch
    for (let i = 0; i < batches; i++) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/process-notifications`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            limit: batchSize
          })
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Batch ${i + 1} failed:`, errorText)
          results.push({
            batch: i + 1,
            success: false,
            error: errorText
          })
        } else {
          const data = await response.json()
          console.log(`Batch ${i + 1} processed:`, data)
          results.push({
            batch: i + 1,
            success: true,
            processed: data.processed,
            failed: data.failed
          })
        }
        
        // Small delay between batches
        if (i < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error) {
        console.error(`Error processing batch ${i + 1}:`, error)
        results.push({
          batch: i + 1,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    // Calculate totals
    const totalProcessed = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.processed || 0), 0)
    
    const totalFailed = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.failed || 0), 0)
    
    return NextResponse.json({
      success: true,
      message: `Processing triggered for ${count} notifications`,
      batches: batches,
      results: results,
      summary: {
        total: count,
        processed: totalProcessed,
        failed: totalFailed,
        pending: count - totalProcessed - totalFailed
      }
    })
    
  } catch (error: any) {
    console.error('Error triggering notification processing:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to process notifications' 
      },
      { status: 500 }
    )
  }
}