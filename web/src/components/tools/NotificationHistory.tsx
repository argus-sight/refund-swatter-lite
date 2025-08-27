'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'

interface NotificationHistoryProps {
  environment: AppleEnvironment
}

export default function NotificationHistory({ environment }: NotificationHistoryProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [params, setParams] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    notificationTypes: [] as string[],
    transactionId: ''
  })

  const handleFetch = async () => {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/apple-notification-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...params,
          environment
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch notification history')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const notificationTypeOptions = [
    'CONSUMPTION_REQUEST',
    'INITIAL_BUY',
    'DID_RENEW',
    'REFUND',
    'REFUND_DECLINED',
    'OFFER_REDEEMED',
    'SUBSCRIBED'
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Apple Notification History</h2>
      <p className="text-sm text-gray-600 mb-4">
        Query notification history directly from Apple
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={params.startDate}
              onChange={(e) => setParams({ ...params, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={params.endDate}
              onChange={(e) => setParams({ ...params, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Transaction ID (Optional)
          </label>
          <input
            type="text"
            value={params.transactionId}
            onChange={(e) => setParams({ ...params, transactionId: e.target.value })}
            placeholder="Original transaction ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notification Types (Optional)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {notificationTypeOptions.map(type => (
              <label key={type} className="flex items-center">
                <input
                  type="checkbox"
                  checked={params.notificationTypes.includes(type)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setParams({ 
                        ...params, 
                        notificationTypes: [...params.notificationTypes, type] 
                      })
                    } else {
                      setParams({ 
                        ...params, 
                        notificationTypes: params.notificationTypes.filter(t => t !== type) 
                      })
                    }
                  }}
                  className="mr-2"
                />
                <span className="text-sm">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
            {error}
          </div>
        )}

        <button
          onClick={handleFetch}
          disabled={loading}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Fetching...' : 'Fetch Notification History'}
        </button>

        {result && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Results ({result.totalCount || result.notifications?.length || 0} notifications fetched)
            </h3>
            {result.totalCount > 20 && (
              <p className="text-xs text-green-600 mb-2">
                ✓ Successfully fetched all {result.totalCount} notifications across multiple pages
              </p>
            )}
            <div className="max-h-96 overflow-y-auto bg-gray-50 rounded p-3">
              {result.notifications && result.notifications.length > 0 ? (
                <div className="space-y-2">
                  {result.notifications.map((notif: any, index: number) => (
                    <div key={index} className="bg-white p-2 rounded text-xs">
                      <div className="flex justify-between">
                        <span className="font-semibold">{notif.notificationType}</span>
                        <span className="text-gray-500">{notif.notificationUUID?.substring(0, 8)}...</span>
                      </div>
                      {notif.subtype && (
                        <div className="text-gray-600">Subtype: {notif.subtype}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No notifications found</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}