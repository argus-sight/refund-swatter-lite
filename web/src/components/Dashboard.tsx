'use client'

import { useState, useEffect } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import NotificationList from './NotificationList'
import ConsumptionMetrics from './ConsumptionMetrics'
import GuidedSetup from './GuidedSetup'
import Tools from './Tools'
import ConsumptionRequestHistory from './tools/ConsumptionRequestHistory'
import { getFromEdgeFunction } from '@/lib/edge-functions'
import { supabase } from '@/lib/supabase'
import { 
  Cog6ToothIcon, 
  DocumentTextIcon,
  ChartBarIcon,
  WrenchScrewdriverIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline'

export default function Dashboard() {
  const [environment, setEnvironment] = useState<AppleEnvironment>(AppleEnvironment.SANDBOX)
  const [activeTab, setActiveTab] = useState('overview')
  const [config, setConfig] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConfig()
    loadStats(environment)
  }, [])

  // Reload stats when environment changes
  useEffect(() => {
    loadStats(environment)
  }, [environment])

  const loadConfig = async () => {
    try {
      const { data, error } = await getFromEdgeFunction('config')
      if (error) {
        console.error('Failed to load config:', error)
      } else if (data) {
        setConfig(data)
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
    setLoading(false)
  }

  const loadStats = async (env: AppleEnvironment) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        console.error('No session available')
        return
      }
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/consumption-metrics?environment=${env}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
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
  }

  const handleSetupComplete = () => {
    // Reload config after setup is complete
    loadConfig()
    // Stay on setup tab or navigate to overview
    setActiveTab('overview')
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: ChartBarIcon },
    { id: 'setup', name: 'Setup', icon: Cog6ToothIcon },
    { id: 'notifications', name: 'Notifications', icon: DocumentTextIcon },
    { id: 'consumption-requests', name: 'Consumption Requests', icon: PaperAirplaneIcon },
    { id: 'tools', name: 'Tools', icon: WrenchScrewdriverIcon },
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
            <div className="flex-1">
              {/* Empty div to maintain layout */}
            </div>
            
            {activeTab !== 'setup' && (
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
            )}
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
            <ConsumptionMetrics stats={stats} environment={environment} />
            
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
                  <span className="text-sm text-gray-600">In-App Purchase Key:</span>
                  <span className="text-sm text-green-600">
                    {config?.apple_private_key ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'setup' && (
          <GuidedSetup onSetupComplete={handleSetupComplete} />
        )}

        {activeTab === 'notifications' && (
          <NotificationList environment={environment} />
        )}

        {activeTab === 'consumption-requests' && (
          <ConsumptionRequestHistory environment={environment} />
        )}

        {activeTab === 'tools' && (
          <Tools environment={environment} />
        )}
      </div>
    </div>
  )
}