'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import NotificationHistory from './tools/NotificationHistory'
import RefundHistory from './tools/RefundHistory'
import ManualReprocess from './tools/ManualReprocess'
import TransactionHistory from './tools/TransactionHistory'
import DataInitialization from './DataInitialization'
import {
  ClockIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CreditCardIcon,
  CircleStackIcon
} from '@heroicons/react/24/outline'

interface ToolsProps {
  environment: AppleEnvironment
}

interface Tool {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  isOneTime?: boolean
}

export default function Tools({ environment }: ToolsProps) {
  const [activeTool, setActiveTool] = useState('notification-history')

  const tools: Tool[] = [
    { 
      id: 'notification-history', 
      name: 'Notification History', 
      icon: ClockIcon,
      description: 'View all received notifications from Apple'
    },
    { 
      id: 'refund-history', 
      name: 'Refund History', 
      icon: ArrowPathIcon,
      description: 'Track refund requests and their statuses'
    },
    { 
      id: 'manual-reprocess', 
      name: 'Manual Reprocess', 
      icon: ArrowUturnLeftIcon,
      description: 'Manually reprocess notifications'
    },
    { 
      id: 'transaction-history', 
      name: 'Transaction History', 
      icon: CreditCardIcon,
      description: 'View all transaction records'
    },
    { 
      id: 'data-initialization', 
      name: 'Data Initialization', 
      icon: CircleStackIcon,
      description: 'Import historical data from Apple (One-time setup)',
      isOneTime: true
    }
  ]

  const renderToolContent = () => {
    switch (activeTool) {
      case 'notification-history':
        return <NotificationHistory environment={environment} />
      case 'refund-history':
        return <RefundHistory environment={environment} />
      case 'manual-reprocess':
        return <ManualReprocess environment={environment} />
      case 'transaction-history':
        return <TransactionHistory environment={environment} />
      case 'data-initialization':
        return <DataInitialization environment={environment} onComplete={() => {
          // Optionally refresh the page or show a success message
          console.log('Data initialization completed')
        }} />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Tool Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`
              p-4 rounded-lg border-2 transition-all text-left relative
              ${activeTool === tool.id
                ? 'border-indigo-500 bg-indigo-50'
                : tool.isOneTime 
                  ? 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            {tool.isOneTime && (
              <span className="absolute top-2 right-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                One-time
              </span>
            )}
            <div className="flex items-start space-x-3">
              <tool.icon className={`h-6 w-6 mt-0.5 ${
                activeTool === tool.id ? 'text-indigo-600' : tool.isOneTime ? 'text-gray-400' : 'text-gray-400'
              }`} />
              <div className="flex-1">
                <h3 className={`font-medium ${
                  activeTool === tool.id ? 'text-indigo-900' : tool.isOneTime ? 'text-gray-700' : 'text-gray-900'
                }`}>
                  {tool.name}
                </h3>
                <p className={`text-sm mt-1 ${
                  activeTool === tool.id ? 'text-indigo-700' : 'text-gray-500'
                }`}>
                  {tool.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Active Tool Content */}
      <div className="bg-white rounded-lg shadow">
        {renderToolContent()}
      </div>
    </div>
  )
}