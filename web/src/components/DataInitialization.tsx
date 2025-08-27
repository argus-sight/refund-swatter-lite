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
  const [error, setError] = useState('')
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })
  const [notificationTypes, setNotificationTypes] = useState<string[]>([])

  const handleInitialize = async () => {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/data-initialization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          notificationTypes: notificationTypes.length > 0 ? notificationTypes : undefined,
          processData: true
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Initialization failed')
      }

      setResult(data)
      if (onComplete) {
        onComplete()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
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
        Import historical notification data from Apple
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
            Notification Types (Optional)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {typeOptions.map(type => (
              <label key={type} className="flex items-center">
                <input
                  type="checkbox"
                  checked={notificationTypes.includes(type)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNotificationTypes([...notificationTypes, type])
                    } else {
                      setNotificationTypes(notificationTypes.filter(t => t !== type))
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

        {result && (
          <div className="bg-green-50 p-3 rounded-md">
            <p className="text-sm text-green-800">
              Successfully imported {result.total} notifications
            </p>
            <p className="text-xs text-green-600 mt-1">
              Processed: {result.processed}, Errors: {result.errors}
            </p>
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
          Maximum date range is 180 days.
        </div>
      </div>
    </div>
  )
}