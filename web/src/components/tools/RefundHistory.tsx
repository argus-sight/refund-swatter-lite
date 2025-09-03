'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import { supabase } from '@/lib/supabase'

interface RefundHistoryProps {
  environment: AppleEnvironment
}

export default function RefundHistory({ environment }: RefundHistoryProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [transactionId, setTransactionId] = useState('')

  const handleFetch = async () => {
    if (!transactionId) {
      setError('Please enter a transaction ID')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No session available')
      }
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/apple-refund-history`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId,
          environment
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch refund history')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Apple Refund History</h2>
      <p className="text-sm text-gray-600 mb-4">
        Get refund history for a specific transaction from Apple
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Transaction ID
          </label>
          <input
            type="text"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="Enter original transaction ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
            {error}
          </div>
        )}

        <button
          onClick={handleFetch}
          disabled={loading || !transactionId}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Fetching...' : 'Fetch Refund History'}
        </button>

        {result && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Refund History
            </h3>
            <div className="bg-gray-50 rounded p-3">
              {result.refundHistory && result.refundHistory.length > 0 ? (
                <div className="space-y-2">
                  {result.refundHistory.map((refund: any, index: number) => (
                    <div key={index} className="bg-white p-3 rounded">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Transaction ID:</span>
                          <p className="font-mono text-xs">{refund.transactionId}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Refund Date:</span>
                          <p className="text-xs">{new Date(refund.refundDate * 1000).toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Amount:</span>
                          <p className="text-xs">${(refund.price / 1000).toFixed(2)} {refund.currency}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Reason:</span>
                          <p className="text-xs">{refund.refundReason || 'Not specified'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No refunds found for this transaction</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}