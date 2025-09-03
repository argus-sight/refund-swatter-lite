'use client'

import { useState, useEffect } from 'react'
import { AppleEnvironment } from '@/lib/apple'

interface NotificationHistoryProps {
  environment: AppleEnvironment
}

export default function NotificationHistory({ environment }: NotificationHistoryProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [params, setParams] = useState({
    startDate: new Date(Date.now() - (environment === 'Sandbox' ? 30 : 180) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    notificationType: '',  // Changed from array to single string
    transactionId: ''
  })

  // Update date when environment changes
  useEffect(() => {
    setParams(prev => ({
      ...prev,
      startDate: new Date(Date.now() - (environment === 'Sandbox' ? 30 : 180) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    }))
  }, [environment])

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
    // Refund related
    'CONSUMPTION_REQUEST',
    'REFUND',
    'REFUND_DECLINED',
    'REFUND_REVERSED',
    
    // Subscription lifecycle
    'SUBSCRIBED',
    'DID_RENEW',
    'DID_FAIL_TO_RENEW',
    'EXPIRED',
    'GRACE_PERIOD_EXPIRED',
    
    // Subscription changes
    'DID_CHANGE_RENEWAL_PREF',
    'DID_CHANGE_RENEWAL_STATUS',
    'OFFER_REDEEMED',
    'PRICE_INCREASE',
    'RENEWAL_EXTENDED',
    'RENEWAL_EXTENSION',
    
    // Purchase events
    'ONE_TIME_CHARGE',
    'REVOKE',
    
    // External purchase
    'EXTERNAL_PURCHASE_TOKEN',
    
    // Advanced Commerce API
    'METADATA_UPDATE',
    'MIGRATION',
    'PRICE_CHANGE',
    
    // Testing
    'TEST'
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Apple Notification History</h2>
      <p className="text-sm text-gray-600 mb-4">
        Query notification history directly from Apple 
        ({environment === 'Sandbox' ? 'Sandbox: Last 30 days recommended' : 'Production: Up to 180 days available'})
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
            {environment === 'Sandbox' ? (
              <p className="text-xs text-gray-500 mt-1">
                Sandbox environment: Recommended to query within 30 days for better data availability.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Production environment: Apple returns up to 180 days of notification history.
              </p>
            )}
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
            disabled={!!params.notificationType}  // Disable if notificationType is selected
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {params.notificationType && (
            <p className="text-xs text-gray-500 mt-1">
              Disabled: Cannot use with Notification Type
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notification Type (Optional - Select One)
          </label>
          <select
            value={params.notificationType}
            onChange={(e) => setParams({ ...params, notificationType: e.target.value })}
            disabled={!!params.transactionId}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">All Types</option>
            <optgroup label="Refund Related">
              <option value="CONSUMPTION_REQUEST">CONSUMPTION_REQUEST</option>
              <option value="REFUND">REFUND</option>
              <option value="REFUND_DECLINED">REFUND_DECLINED</option>
              <option value="REFUND_REVERSED">REFUND_REVERSED</option>
            </optgroup>
            <optgroup label="Subscription Lifecycle">
              <option value="SUBSCRIBED">SUBSCRIBED</option>
              <option value="DID_RENEW">DID_RENEW</option>
              <option value="DID_FAIL_TO_RENEW">DID_FAIL_TO_RENEW</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="GRACE_PERIOD_EXPIRED">GRACE_PERIOD_EXPIRED</option>
            </optgroup>
            <optgroup label="Subscription Changes">
              <option value="DID_CHANGE_RENEWAL_PREF">DID_CHANGE_RENEWAL_PREF</option>
              <option value="DID_CHANGE_RENEWAL_STATUS">DID_CHANGE_RENEWAL_STATUS</option>
              <option value="OFFER_REDEEMED">OFFER_REDEEMED</option>
              <option value="PRICE_INCREASE">PRICE_INCREASE</option>
              <option value="RENEWAL_EXTENDED">RENEWAL_EXTENDED</option>
              <option value="RENEWAL_EXTENSION">RENEWAL_EXTENSION</option>
            </optgroup>
            <optgroup label="Purchase Events">
              <option value="ONE_TIME_CHARGE">ONE_TIME_CHARGE</option>
              <option value="REVOKE">REVOKE</option>
            </optgroup>
            <optgroup label="External Purchase">
              <option value="EXTERNAL_PURCHASE_TOKEN">EXTERNAL_PURCHASE_TOKEN</option>
            </optgroup>
            <optgroup label="Advanced Commerce API">
              <option value="METADATA_UPDATE">METADATA_UPDATE</option>
              <option value="MIGRATION">MIGRATION</option>
              <option value="PRICE_CHANGE">PRICE_CHANGE</option>
            </optgroup>
            <optgroup label="Testing">
              <option value="TEST">TEST</option>
            </optgroup>
          </select>
          {params.transactionId && params.notificationType && (
            <p className="text-xs text-red-600 mt-1">
              Cannot use both Transaction ID and Notification Type together
            </p>
          )}
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