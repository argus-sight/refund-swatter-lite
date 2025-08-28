'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
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

  useEffect(() => {
    loadConfig()
    loadStats()
  }, [])

  const loadConfig = async () => {
    const { data } = await supabase
      .from('config')
      .select('*')
      .single()
    
    if (data) {
      setConfig(data)
      // environment is no longer stored in config table
      // it's now a view-level filter for displaying data
    }
    setLoading(false)
  }

  const loadStats = async () => {
    const { data } = await supabase
      .rpc('get_consumption_metrics_summary')
    
    setStats(data)
  }

  const handleEnvironmentChange = (newEnv: AppleEnvironment) => {
    setEnvironment(newEnv)
    // Environment is now just a view-level filter
    // No need to save to database
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
            <div className="space-y-4">
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