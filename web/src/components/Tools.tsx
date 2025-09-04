'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import NotificationHistory from './tools/NotificationHistory'
import RefundHistory from './tools/RefundHistory'
import ManualReprocess from './tools/ManualReprocess'
import TransactionHistory from './tools/TransactionHistory'
import {
  ClockIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline'

interface ToolsProps {
  environment: AppleEnvironment
}

export default function Tools({ environment }: ToolsProps) {
  const [activeTool, setActiveTool] = useState('notification-history')

  const tools = [
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
              p-4 rounded-lg border-2 transition-all text-left
              ${activeTool === tool.id
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            <div className="flex items-start space-x-3">
              <tool.icon className={`h-6 w-6 mt-0.5 ${
                activeTool === tool.id ? 'text-indigo-600' : 'text-gray-400'
              }`} />
              <div className="flex-1">
                <h3 className={`font-medium ${
                  activeTool === tool.id ? 'text-indigo-900' : 'text-gray-900'
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