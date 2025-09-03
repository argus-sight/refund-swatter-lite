'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import { supabase } from '@/lib/supabase'

interface TransactionHistoryProps {
  environment: AppleEnvironment
}

export default function TransactionHistory({ environment }: TransactionHistoryProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [revision, setRevision] = useState('')

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
      const response = await fetch(`${supabaseUrl}/functions/v1/apple-transaction-history`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId,
          revision,
          environment
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch transaction history')
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
      <h2 className="text-lg font-semibold mb-4">Apple Transaction History</h2>
      <p className="text-sm text-gray-600 mb-4">
        Get transaction history for a user from Apple
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Original Transaction ID
          </label>
          <input
            type="text"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="Enter original transaction ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Revision (Optional)
          </label>
          <input
            type="text"
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
            placeholder="Revision token for pagination"
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
          {loading ? 'Fetching...' : 'Fetch Transaction History'}
        </button>

        {result && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Transaction History ({result.transactions?.length || 0} transactions)
            </h3>
            {transactionId && result.transactions && result.transactions.length > 0 && 
             !result.transactions.some((tx: any) => 
               tx.transactionId === transactionId || 
               tx.originalTransactionId === transactionId
             ) && (
              <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-xs text-yellow-800">
                  <strong>Note:</strong> The queried transaction ID ({transactionId}) was not found in the results. 
                  Apple may have returned related transactions for the same user account.
                </p>
              </div>
            )}
            {result.hasMore && (
              <p className="text-xs text-gray-600 mb-2">
                More transactions available. Revision: {result.revision}
              </p>
            )}
            <div className="max-h-96 overflow-y-auto bg-gray-50 rounded p-3">
              {result.transactions && result.transactions.length > 0 ? (
                <div className="space-y-2">
                  {result.transactions.map((tx: any, index: number) => (
                    <div key={index} className="bg-white p-3 rounded">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="col-span-2">
                          <span className="text-gray-600">Transaction ID:</span>
                          <p className="text-xs font-mono">{tx.transactionId || 'N/A'}</p>
                        </div>
                        {tx.originalTransactionId && tx.originalTransactionId !== tx.transactionId && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Original Transaction ID:</span>
                            <p className="text-xs font-mono">{tx.originalTransactionId}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-600">Product:</span>
                          <p className="text-xs font-semibold">{tx.productId}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Type:</span>
                          <p className="text-xs">{tx.type}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Purchase Date:</span>
                          <p className="text-xs">{tx.purchaseDateFormatted ? 
                            new Date(tx.purchaseDateFormatted).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: '2-digit', 
                              day: '2-digit' 
                            }) : 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Price:</span>
                          <p className="text-xs">
                            {tx.price && tx.currency ? 
                              `${tx.currency === 'USD' ? '$' : tx.currency + ' '}${(tx.price / 1000).toFixed(2)}` : 
                              'N/A'}
                          </p>
                        </div>
                        {tx.expiresDateFormatted && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Expires:</span>
                            <p className="text-xs">{new Date(tx.expiresDateFormatted).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: '2-digit', 
                              day: '2-digit' 
                            })}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No transactions found</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}