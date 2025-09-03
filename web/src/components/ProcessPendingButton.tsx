'use client'

import { useState } from 'react'
import { callEdgeFunction } from '@/lib/edge-functions'

export default function ProcessPendingButton() {
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleProcess = async () => {
    setProcessing(true)
    setResult(null)
    
    try {
      const { data, error } = await callEdgeFunction('process-pending', {
        limit: 100, // Process up to 100 notifications
        source: 'history_api' // Only process history API imports
      })

      if (error) {
        setResult({ 
          success: false, 
          error: error.message
        })
      } else {
        setResult(data)
      }
    } catch (error) {
      setResult({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Processing failed' 
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Process Pending Notifications</h3>
      
      <button
        onClick={handleProcess}
        disabled={processing}
        className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
      >
        {processing ? 'Processing...' : 'Process Pending History Notifications'}
      </button>

      {result && (
        <div className={`mt-4 p-3 rounded-md ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
          {result.success ? (
            <div className="text-sm text-green-800">
              <p className="font-semibold">Processing triggered successfully!</p>
              {result.summary && (
                <div className="mt-2">
                  <p>Total: {result.summary.total}</p>
                  <p>Processed: {result.summary.processed}</p>
                  <p>Failed: {result.summary.failed}</p>
                  <p>Remaining: {result.summary.pending}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-red-800">
              <p className="font-semibold">Processing failed</p>
              <p>{result.error || result.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}