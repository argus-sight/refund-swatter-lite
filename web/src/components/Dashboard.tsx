'use client'

import { useState, useEffect } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import NotificationList from './NotificationList'
import ConsumptionMetrics from './ConsumptionMetrics'
import DataInitialization from './DataInitialization'
import TestNotification from './TestNotification'
import NotificationHistory from './tools/NotificationHistory'
import RefundHistory from './tools/RefundHistory'
import TransactionHistory from './tools/TransactionHistory'
import { 
  Cog6ToothIcon, 
  DocumentTextIcon, 
  BeakerIcon,
  ArrowPathIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

export default function Dashboard() {
  const [environment, setEnvironment] = useState<AppleEnvironment>(AppleEnvironment.SANDBOX)
  const [activeTab, setActiveTab] = useState('overview')
  const [config, setConfig] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [savingRefundPreference, setSavingRefundPreference] = useState(false)

  useEffect(() => {
    loadConfig()
    loadStats()
  }, [])

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config')
      if (response.ok) {
        const data = await response.json()
        if (data) {
          setConfig(data)
        }
      } else {
        console.error('Failed to load config')
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
    setLoading(false)
  }

  const loadStats = async () => {
    try {
      const response = await fetch('/api/consumption-metrics')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      } else {
        console.error('Failed to load stats')
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const handleEnvironmentChange = (newEnv: AppleEnvironment) => {
    setEnvironment(newEnv)
    // Environment is now just a view-level filter
    // No need to save to database
  }

  const handleRefundPreferenceChange = async (value: number) => {
    setSavingRefundPreference(true)
    try {
      console.log('Updating refund preference to:', value)
      
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refund_preference: value,
          updated_at: new Date().toISOString()
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update config')
      }
      
      const data = await response.json()
      console.log('Update successful, returned data:', data)
      
      // Update local config
      setConfig({ ...config, refund_preference: value })
      
      // Show success message
      console.log('Refund preference updated successfully to:', value)
    } catch (error: any) {
      console.error('Failed to update refund preference - Full error:', error)
      const errorMessage = error?.message || 'Failed to update refund preference'
      alert(`Error: ${errorMessage}\n\nPlease check the browser console for details.`)
    } finally {
      setSavingRefundPreference(false)
    }
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: ChartBarIcon },
    { id: 'notifications', name: 'Notifications', icon: DocumentTextIcon },
    { id: 'test', name: 'Test & Initialize', icon: BeakerIcon },
    { id: 'notification-history', name: 'Notification History', icon: ClockIcon },
    { id: 'refund-history', name: 'Refund History', icon: ArrowPathIcon },
    { id: 'transaction-history', name: 'Transaction History', icon: CurrencyDollarIcon },
    { id: 'settings', name: 'Settings', icon: Cog6ToothIcon },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Refund Swatter Lite
            </h1>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Environment:</span>
              <select
                value={environment}
                onChange={(e) => handleEnvironmentChange(e.target.value as AppleEnvironment)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={AppleEnvironment.SANDBOX}>Sandbox</option>
                <option value={AppleEnvironment.PRODUCTION}>Production</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2
                  ${activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="h-5 w-5" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <ConsumptionMetrics stats={stats} />
            
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Configuration Status</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Bundle ID:</span>
                  <span className="text-sm font-mono">{config?.bundle_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Issuer ID:</span>
                  <span className="text-sm font-mono">{config?.apple_issuer_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Key ID:</span>
                  <span className="text-sm font-mono">{config?.apple_key_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Private Key:</span>
                  <span className="text-sm text-green-600">
                    {config?.apple_private_key ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <NotificationList environment={environment} />
        )}

        {activeTab === 'test' && (
          <div className="space-y-6">
            <TestNotification environment={environment} />
            <DataInitialization environment={environment} onComplete={loadStats} />
          </div>
        )}

        {activeTab === 'notification-history' && (
          <NotificationHistory environment={environment} />
        )}

        {activeTab === 'refund-history' && (
          <RefundHistory environment={environment} />
        )}

        {activeTab === 'transaction-history' && (
          <TransactionHistory environment={environment} />
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>
            <div className="space-y-6">
              {/* Refund Preference Setting */}
              <div className="border-b pb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Refund Preference</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Configure your default preference for refund requests. This helps Apple's refund decision process.
                </p>
                <select
                  value={config?.refund_preference || 0}
                  onChange={(e) => handleRefundPreferenceChange(parseInt(e.target.value))}
                  disabled={savingRefundPreference}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value={0}>Undeclared (Don't provide preference)</option>
                  <option value={1}>Prefer Grant Refund</option>
                  <option value={2}>Prefer Decline Refund</option>
                  <option value={3}>No Preference</option>
                </select>
                {savingRefundPreference && (
                  <span className="ml-2 text-xs text-gray-500">Saving...</span>
                )}
                <div className="mt-2 p-3 bg-blue-50 rounded-md">
                  <p className="text-xs text-blue-700">
                    <strong>Note:</strong> This is just a preference and one of many factors Apple considers. 
                    The actual refund decision is made by Apple based on multiple criteria.
                  </p>
                </div>
              </div>

              {/* Delivery Status Note */}
              <div className="border-b pb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Delivery Status</h3>
                <div className="p-3 bg-green-50 rounded-md">
                  <p className="text-xs text-green-700">
                    <strong>Default:</strong> All consumption requests report delivery status as "Successfully delivered and working properly" (status: 0).
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    You are responsible for ensuring successful delivery of purchased items before the consumption data is sent to Apple.
                  </p>
                </div>
              </div>

              {/* Consumption Status Note */}
              <div className="border-b pb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Consumption Status</h3>
                <div className="p-3 bg-yellow-50 rounded-md">
                  <p className="text-xs text-yellow-700">
                    <strong>Default:</strong> Returns "Undeclared" (status: 0) when consumption data cannot be determined.
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    <strong>Current Logic:</strong> Simplified implementation - returns 0 (undeclared), 1 (not consumed for active subscriptions), or 2 (partially consumed if content accessed).
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    <strong>Note:</strong> Apple does not provide consumption tracking via notifications. To accurately track consumption, you need to implement usage tracking in your app and store it in the usage_metrics table.
                  </p>
                </div>
              </div>

              {/* User Status Note */}
              <div className="border-b pb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">User Status</h3>
                <div className="p-3 bg-yellow-50 rounded-md">
                  <p className="text-xs text-yellow-700">
                    <strong>Default:</strong> Returns "Undeclared" (status: 0) for users without purchases, or "Active" (status: 1) for users with purchases.
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    <strong>Apple Values:</strong> 0=Undeclared, 1=Active, 2=Suspended, 3=Terminated, 4=Limited Access
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    <strong>Note:</strong> To properly track user account status (suspended/terminated/limited), you need to implement an account management system in your app.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Webhook URL</h3>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/webhook`}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-gray-50"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/webhook`)
                    }}
                    className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Configure this URL in App Store Connect for Server-to-Server Notifications
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Cron Job</h3>
                <p className="text-sm text-gray-600">
                  Set up a cron job to process consumption requests every 5 minutes:
                </p>
                <pre className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono">
                  {`*/5 * * * * curl -X POST \\
  ${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-jobs \\
  -H "x-cron-secret: YOUR_CRON_SECRET"`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}