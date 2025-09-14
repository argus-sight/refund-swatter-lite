'use client'

import { ArrowRightIcon, CheckCircleIcon, ShieldCheckIcon, BellIcon, ChartBarIcon } from '@heroicons/react/24/outline'

interface WelcomeProps {
  onGetStarted: () => void
}

export default function Welcome({ onGetStarted }: WelcomeProps) {
  const features = [
    {
      icon: ShieldCheckIcon,
      title: 'Automatic Refund Protection',
      description: 'Protect your revenue by automatically responding to refund requests with consumption data'
    },
    {
      icon: BellIcon,
      title: 'Real-time Notifications',
      description: 'Receive and process App Store Server-to-Server Notification V2 webhooks instantly'
    },
    {
      icon: ChartBarIcon,
      title: 'Consumption Metrics',
      description: 'Track refund patterns and consumption data across your apps'
    }
  ]

  const steps = [
    'Configure Apple credentials',
    'Upload In-App Purchase Key',
    'Set up webhook URL',
    'Test the connection',
    'Configure refund preferences'
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to Refund Swatter Lite
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Protect your app revenue by automatically providing consumption information for refund requests
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {features.map((feature, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <feature.icon className="h-8 w-8 text-indigo-600 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Setup Steps */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Quick Setup Process</h2>
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={index} className="flex items-start">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-medium">
                    {index + 1}
                  </div>
                </div>
                <p className="ml-3 text-sm text-gray-700">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Time to complete:</strong> Approximately 5-10 minutes
            </p>
            <p className="text-sm text-blue-700 mt-1">
              You'll need your Apple App Store Connect credentials and In-App Purchase Key ready.
            </p>
          </div>
        </div>

        {/* Key Benefits */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-lg p-8 text-white mb-8">
          <h2 className="text-2xl font-semibold mb-4">Why Use Refund Swatter?</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm">
                  <strong>Reduce Invalid Refunds:</strong> Provide Apple with consumption data to help make informed refund decisions
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm">
                  <strong>Automated Processing:</strong> Handle refund requests automatically within Apple's 12-hour window
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm">
                  <strong>Compliance Ready:</strong> Follow Apple's best practices for consumption information reporting
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm">
                  <strong>Privacy Focused:</strong> Your data stays in your own Supabase instance
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <button
            onClick={onGetStarted}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Get Started with Setup
            <ArrowRightIcon className="ml-2 h-5 w-5" />
          </button>
          <p className="mt-3 text-sm text-gray-600">
            Click to begin the guided setup process
          </p>
        </div>
      </div>
    </div>
  )
}