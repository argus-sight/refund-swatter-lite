'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'

interface TestNotificationProps {
  environment: AppleEnvironment
}

export default function TestNotification({ environment }: TestNotificationProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [statusToken, setStatusToken] = useState('')
  const [statusResult, setStatusResult] = useState<any>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    
    try {
      const response = await fetch('/api/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ environment })
      })

      const data = await response.json()
      setTestResult(data)
      
      if (data.testNotificationToken) {
        setStatusToken(data.testNotificationToken)
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Test failed' 
      })
    } finally {
      setTesting(false)
    }
  }

  const checkStatus = async () => {
    if (!statusToken) return
    
    setCheckingStatus(true)
    setStatusResult(null)
    
    try {
      const response = await fetch('/api/test-webhook/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          testNotificationToken: statusToken,
          environment 
        })
      })

      const data = await response.json()
      setStatusResult(data)
    } catch (error) {
      setStatusResult({ 
        error: error instanceof Error ? error.message : 'Status check failed' 
      })
    } finally {
      setCheckingStatus(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Test Webhook</h2>
      <p className="text-sm text-gray-600 mb-4">
        Send a test notification to verify webhook configuration
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">
            Environment: <span className="font-semibold">{environment}</span>
          </span>
        </div>

        <button
          onClick={handleTest}
          disabled={testing}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {testing ? 'Sending Test...' : 'Send Test Notification'}
        </button>

        {testResult && (
          <div className={`p-3 rounded-md ${testResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
              {testResult.success ? 'Test notification sent successfully!' : 'Test failed'}
            </p>
            {testResult.error && (
              <p className="text-xs text-red-600 mt-1">{testResult.error}</p>
            )}
            {testResult.testNotificationToken && (
              <div className="mt-2">
                <p className="text-xs text-gray-600">Test token:</p>
                <p className="text-xs font-mono bg-white px-2 py-1 rounded mt-1">
                  {testResult.testNotificationToken}
                </p>
              </div>
            )}
          </div>
        )}

        {statusToken && (
          <>
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Check Test Status</h3>
              <input
                type="text"
                value={statusToken}
                onChange={(e) => setStatusToken(e.target.value)}
                placeholder="Test notification token"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
              />
              <button
                onClick={checkStatus}
                disabled={checkingStatus || !statusToken}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
              >
                {checkingStatus ? 'Checking...' : 'Check Status'}
              </button>
            </div>

            {statusResult && (
              <div className={`p-3 rounded-md ${statusResult.error ? 'bg-red-50' : statusResult.firstSendAttemptResult === 'SUCCESS' ? 'bg-green-50' : 'bg-blue-50'}`}>
                {statusResult.error ? (
                  <p className="text-sm text-red-800">{statusResult.error}</p>
                ) : (
                  <>
                    <p className={`text-sm ${statusResult.firstSendAttemptResult === 'SUCCESS' ? 'text-green-800' : 'text-blue-800'}`}>
                      Status: {statusResult.firstSendAttemptResult || 'Unknown'}
                    </p>
                    {statusResult.firstSendAttemptResult === 'SUCCESS' && (
                      <p className="text-xs text-gray-600 mt-1">
                        Notification received and processed successfully
                      </p>
                    )}
                    {statusResult.sendAttempts && statusResult.sendAttempts.length > 0 && (
                      <div className="mt-1">
                        <p className="text-xs text-gray-600">Send attempts: {statusResult.sendAttempts.length}</p>
                        <p className="text-xs text-gray-500">
                          Last attempt: {new Date(statusResult.sendAttempts[0].attemptDate).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}