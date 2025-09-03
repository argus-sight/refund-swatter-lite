'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'

interface DataInitializationProps {
  environment: AppleEnvironment
  onComplete?: () => void
}

export default function DataInitialization({ environment, onComplete }: DataInitializationProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<{ message: string; details?: any } | null>(null)
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - (environment === 'Sandbox' ? 30 : 180) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })
  const [notificationTypes, setNotificationTypes] = useState<string[]>([]) // Empty means all types

  const handleInitialize = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/data-initialization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          environment,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          // Don't send notificationType if no specific types are selected (imports all types)
          notificationType: notificationTypes.length === 1 ? notificationTypes[0] : undefined
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Extract detailed error information
        const errorDetails = {
          message: data.error || 'Initialization failed',
          details: {
            status: response.status,
            statusText: response.statusText,
            requestId: data.requestId,
            processingTime: data.processingTime,
            // Include any additional error details from the response
            ...data
          }
        }
        setError(errorDetails)
        return
      }

      setResult(data)
      if (onComplete) {
        onComplete()
      }
    } catch (err) {
      // Handle network or parsing errors
      setError({
        message: err instanceof Error ? err.message : 'An unexpected error occurred',
        details: {
          type: 'NetworkError',
          error: err
        }
      })
    } finally {
      setLoading(false)
    }
  }

  const typeOptions = [
    'CONSUMPTION_REQUEST',
    'INITIAL_BUY',
    'DID_RENEW',
    'REFUND',
    'REFUND_DECLINED',
    'OFFER_REDEEMED',
    'DID_CHANGE_RENEWAL_STATUS',
    'SUBSCRIBED'
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Data Initialization</h2>
      <p className="text-sm text-gray-600 mb-4">
        Import historical notification data from Apple. 
        Default: Last {environment === 'Sandbox' ? '30 days' : '180 days'} of all notification types.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              max={dateRange.endDate}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              min={dateRange.startDate}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Filter by Notification Type (Optional)
          </label>
          <select
            value={notificationTypes[0] || ''}
            onChange={(e) => {
              if (e.target.value) {
                setNotificationTypes([e.target.value])
              } else {
                setNotificationTypes([])
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Types (Recommended)</option>
            {typeOptions.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Leave as "All Types" to import complete data for the date range
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-md">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-red-800">
                  Error: {error.message}
                </h3>
                {error.details && (
                  <div className="mt-2 text-xs text-red-700">
                    {error.details.status && (
                      <p>Status: {error.details.status} {error.details.statusText || ''}</p>
                    )}
                    {error.details.requestId && (
                      <p>Request ID: {error.details.requestId}</p>
                    )}
                    {error.details.processingTime && (
                      <p>Processing Time: {(error.details.processingTime / 1000).toFixed(2)}s</p>
                    )}
                    {error.details.type === 'NetworkError' && (
                      <p className="mt-1">Please check your network connection and try again.</p>
                    )}
                    <details className="mt-2">
                      <summary className="cursor-pointer hover:text-red-900">Show full error details</summary>
                      <pre className="mt-1 p-2 bg-red-100 rounded text-[10px] overflow-x-auto">
                        {JSON.stringify(error.details, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {result && result.success && (
          <div className="bg-green-50 p-3 rounded-md">
            <p className="text-sm text-green-800">
              Successfully imported data
            </p>
            <div className="text-xs text-green-600 mt-1 space-y-1">
              <p>Fetched: {result.summary?.totalFetched || 0} notifications</p>
              <p>Inserted: {result.summary?.inserted || 0} new records</p>
              <p>Skipped: {result.summary?.skipped || 0} duplicates</p>
              {result.summary?.totalPages && (
                <p>Pages processed: {result.summary.totalPages}</p>
              )}
              {result.processingTime && (
                <p>Processing time: {(result.processingTime / 1000).toFixed(1)}s</p>
              )}
              {result.summary?.errors && result.summary.errors.length > 0 && (
                <p className="text-yellow-600">Errors encountered: {result.summary.errors.length}</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleInitialize}
          disabled={loading}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Importing...' : 'Import Historical Data'}
        </button>

        <div className="text-xs text-gray-500">
          Note: This will fetch notifications from Apple for the {environment} environment.
          {environment === 'Sandbox' 
            ? 'Sandbox environment: Recommended to use 30 days or less for better data availability.'
            : 'Production environment: Maximum date range is 180 days.'}
          Data is stored incrementally as each page is fetched.
        </div>
      </div>
    </div>
  )
}