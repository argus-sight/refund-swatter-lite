import { NextRequest, NextResponse } from 'next/server'
import { getAppleApiBase, AppleEnvironment } from '@/lib/apple'

export async function POST(request: NextRequest) {
  try {
    const { transactionId, revision, environment } = await request.json()
    
    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
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
    const apiBase = getAppleApiBase(environment as AppleEnvironment)
    let url = `${apiBase}/history/${transactionId}`
    if (revision) {
      url += `?revision=${revision}`
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`
      }
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.errorMessage || 'Failed to fetch transaction history')
    }

    // Parse signed transactions
    const transactions = data.signedTransactions?.map((signedTx: string) => {
      try {
        const payload = JSON.parse(atob(signedTx.split('.')[1]))
        return payload
      } catch {
        return null
      }
    }).filter(Boolean)

    return NextResponse.json({
      transactions,
      hasMore: data.hasMore,
      revision: data.revision,
      bundleId: data.bundleId,
      appAppleId: data.appAppleId
    })

  } catch (error) {
    console.error('Transaction history error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transaction history' },
      { status: 500 }
    )
  }
}