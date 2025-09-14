'use client'

import { useState, useEffect } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import { supabase } from '@/lib/supabase'

interface NotificationHistoryProps {
  environment: AppleEnvironment
}

export default function NotificationHistory({ environment }: NotificationHistoryProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  
  // Helper function to get default date range following Apple API specifications
  const getDefaultDateRange = () => {
    // Default: last 30 days (including today)
    const endDate = new Date()
    // Set to end of today UTC
    endDate.setUTCHours(23, 59, 59, 999)
    
    // Start date: 30 days before end date (30 days - 1ms to ensure exactly 30 days)
    const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000 - 1))
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    }
  }
  
  const [params, setParams] = useState({
    ...getDefaultDateRange(),
    notificationType: '',
    transactionId: ''
  })

  // Update date when environment changes
  useEffect(() => {
    setParams(prev => ({
      ...prev,
      ...getDefaultDateRange()
    }))
  }, [environment])
  
  // Validate and normalize date range
  const validateDateRange = (start: string, end: string): { startDate: string, endDate: string } => {
    let startMs = new Date(start + 'T00:00:00.000Z').getTime()
    let endMs = new Date(end + 'T23:59:59.999Z').getTime()
    
    // Swap if end < start
    if (endMs < startMs) {
      const temp = startMs
      startMs = endMs
      endMs = temp
    }
    
    // Clamp end date to today if it's in the future
    const todayEnd = new Date()
    todayEnd.setUTCHours(23, 59, 59, 999)
    const todayEndMs = todayEnd.getTime()
    
    if (endMs > todayEndMs) {
      endMs = todayEndMs
    }
    
    // Ensure range doesn't exceed 180 days
    const maxRangeMs = 180 * 24 * 60 * 60 * 1000 - 1 // 180 days minus 1ms
    if (endMs - startMs > maxRangeMs) {
      startMs = endMs - maxRangeMs
    }
    
    return {
      startDate: new Date(startMs).toISOString().split('T')[0],
      endDate: new Date(endMs).toISOString().split('T')[0]
    }
  }
  
  // Handle date changes with validation
  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    const newDates = field === 'startDate' 
      ? validateDateRange(value, params.endDate)
      : validateDateRange(params.startDate, value)
    
    setParams(prev => ({
      ...prev,
      ...newDates
    }))
  }

  const handleFetch = async () => {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No session available')
      }
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/apple-notification-history`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
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

  // Check if Sandbox environment (max 30 days)
  const isSandbox = environment === AppleEnvironment.SANDBOX
  const maxDays = isSandbox ? 30 : 180

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Apple Notification History</h2>
      <p className="text-sm text-gray-600 mb-4">
        Query notification history directly from Apple (Default: Last 30 days, Maximum: {maxDays} days)
      </p>

      <div className="space-y-4">
        {/* Quick date range presets */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              const endDate = new Date()
              endDate.setUTCHours(23, 59, 59, 999)
              const startDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000 - 1))
              setParams(prev => ({
                ...prev,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
              }))
            }}
            className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => {
              const range = getDefaultDateRange()
              setParams(prev => ({ ...prev, ...range }))
            }}
            className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Last 30 Days
          </button>
          {!isSandbox && (
            <>
              <button
                onClick={() => {
                  const endDate = new Date()
                  endDate.setUTCHours(23, 59, 59, 999)
                  const startDate = new Date(endDate.getTime() - (90 * 24 * 60 * 60 * 1000 - 1))
                  setParams(prev => ({
                    ...prev,
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0]
                  }))
                }}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Last 90 Days
              </button>
              <button
                onClick={() => {
                  const endDate = new Date()
                  endDate.setUTCHours(23, 59, 59, 999)
                  const startDate = new Date(endDate.getTime() - (180 * 24 * 60 * 60 * 1000 - 1))
                  setParams(prev => ({
                    ...prev,
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0]
                  }))
                }}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Max (180 Days)
              </button>
            </>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={params.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              max={new Date().toISOString().split('T')[0]}
            />
            <p className="text-xs text-gray-500 mt-1">
              Date range is automatically adjusted to stay within 180-day limit
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={params.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
        </div>
        
        {/* Display calculated date range */}
        {params.startDate && params.endDate && (
          <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
            <span className="font-medium">Query Range: </span>
            {(() => {
              const start = new Date(params.startDate + 'T00:00:00.000Z')
              const end = new Date(params.endDate + 'T23:59:59.999Z')
              const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
              return `${days} days (${start.toLocaleDateString()} to ${end.toLocaleDateString()})`
            })()}
          </div>
        )}

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