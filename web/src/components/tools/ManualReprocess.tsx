'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { callEdgeFunction } from '@/lib/edge-functions'

interface ManualReprocessProps {
  environment: AppleEnvironment
}

interface ProcessResult {
  success: boolean
  message: string
  details?: {
    notification_uuid: string
    original_transaction_id: string
    job_id: string
    job_status: string
    response_code?: number
    sent_at?: string
  }
}

export default function ManualReprocess({ environment }: ManualReprocessProps) {
  const [notificationUuid, setNotificationUuid] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<ProcessResult | null>(null)

  const handleReprocess = async () => {
    if (!notificationUuid.trim()) {
      setResult({ success: false, message: 'Please enter a notification UUID' })
      return
    }

    setProcessing(true)
    setResult(null)

    try {
      const { data, error } = await callEdgeFunction('reprocess-notification', {
        notification_uuid: notificationUuid.trim(),
      })

      if (error) {
        setResult({
          success: false,
          message: error.message || 'Failed to reprocess notification'
        })
      } else {
        setResult({
          success: true,
          message: data.message || 'Notification reprocessed successfully',
          details: data.details
        })
        // Clear input after successful processing
        setNotificationUuid('')
      }
    } catch (error) {
      console.error('Error reprocessing notification:', error)
      setResult({
        success: false,
        message: 'An error occurred while reprocessing the notification',
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <ArrowPathIcon className="h-5 w-5 mr-2 text-gray-500" />
          Manual Notification Reprocessing
        </h2>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Enter a notification UUID to manually trigger the complete processing flow.
              This will reprocess the notification from scratch and update all related records
              (excluding apple_api_log entries).
            </p>
          </div>

          <div>
            <label htmlFor="notification-uuid" className="block text-sm font-medium text-gray-700 mb-2">
              Notification UUID
            </label>
            <input
              id="notification-uuid"
              type="text"
              value={notificationUuid}
              onChange={(e) => setNotificationUuid(e.target.value)}
              placeholder="e.g., 41148ee0-6bc7-4a44-aede-5fd2f65f29d8"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={processing}
            />
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={handleReprocess}
              disabled={processing || !notificationUuid.trim()}
              className={`
                px-4 py-2 rounded-md font-medium transition-colors
                ${processing || !notificationUuid.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }
              `}
            >
              {processing ? (
                <span className="flex items-center">
                  <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </span>
              ) : (
                'Apply'
              )}
            </button>

            {result && (
              <div className="flex-1">
                <div
                  className={`
                    px-4 py-2 rounded-md text-sm
                    ${result.success
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                    }
                  `}
                >
                  {result.message}
                </div>
                {result.success && result.details && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-700 mb-2">Processing Details:</h4>
                    <dl className="text-xs space-y-1">
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Transaction ID:</dt>
                        <dd className="font-mono text-gray-900">{result.details.original_transaction_id}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Job ID:</dt>
                        <dd className="font-mono text-gray-900">{result.details.job_id}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Status:</dt>
                        <dd className={`font-medium ${
                          result.details.job_status === 'sent' ? 'text-green-600' : 
                          result.details.job_status === 'pending' ? 'text-yellow-600' : 
                          result.details.job_status === 'failed' ? 'text-red-600' : 'text-gray-600'
                        }`}>{result.details.job_status}</dd>
                      </div>
                      {result.details.response_code && (
                        <div className="flex justify-between">
                          <dt className="text-gray-600">Response Code:</dt>
                          <dd className="font-mono text-gray-900">{result.details.response_code}</dd>
                        </div>
                      )}
                      {result.details.sent_at && (
                        <div className="flex justify-between">
                          <dt className="text-gray-600">Sent At:</dt>
                          <dd className="text-gray-900">{new Date(result.details.sent_at).toLocaleString()}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-yellow-800 mb-2">Important Notes:</h3>
        <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
          <li>This will completely reprocess the notification as if it was received for the first time</li>
          <li>All existing records (transactions, refunds, consumption requests) will be updated</li>
          <li>The apple_api_log table will NOT be modified to preserve the audit trail</li>
          <li>Make sure the notification UUID exists in the system before reprocessing</li>
        </ul>
      </div>
    </div>
  )
}