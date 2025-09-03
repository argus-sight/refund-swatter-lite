'use client'

import { useState, useEffect } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import { callEdgeFunction } from '@/lib/edge-functions'

interface TestNotificationProps {
  environment: AppleEnvironment
}

export default function TestNotification({ environment }: TestNotificationProps) {
  const [testing, setTesting] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'sending' | 'waiting' | 'checking' | 'complete'>('idle')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [testToken, setTestToken] = useState<string | null>(null)

  const handleTest = async () => {
    // Reset state
    setResult(null)
    setError(null)
    setTestToken(null)
    setPhase('sending')
    setTesting(true)
    
    try {
      // Step 1: Send test notification
      const { data: sendData, error: sendError } = await callEdgeFunction('test-webhook', { environment })
      
      if (sendError) {
        setError(sendError.message)
        setPhase('complete')
        setTesting(false)
        return
      }

      if (!sendData.testNotificationToken) {
        setError('No test token received')
        setPhase('complete')
        setTesting(false)
        return
      }

      setTestToken(sendData.testNotificationToken)
      setPhase('waiting')

      // Step 2: Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Step 3: Check status
      setPhase('checking')
      const { data: statusData, error: statusError } = await callEdgeFunction('test-webhook-status', { 
        testNotificationToken: sendData.testNotificationToken,
        environment 
      })
      
      if (statusError) {
        setError(statusError.message)
      } else {
        setResult(statusData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setPhase('complete')
      setTesting(false)
    }
  }

  const getButtonText = () => {
    switch (phase) {
      case 'sending':
        return 'Sending test notification...'
      case 'waiting':
        return 'Waiting for delivery (2s)...'
      case 'checking':
        return 'Checking status...'
      default:
        return 'Send Test & Check Status'
    }
  }

  const getStatusIcon = () => {
    if (phase === 'sending') return '📤'
    if (phase === 'waiting') return '⏳'
    if (phase === 'checking') return '🔍'
    if (phase === 'complete' && result?.firstSendAttemptResult === 'SUCCESS') return '✅'
    if (phase === 'complete' && error) return '❌'
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Test Webhook</h2>
      <p className="text-sm text-gray-600 mb-4">
        Send a test notification and verify delivery status
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
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {getButtonText()}
        </button>

        {/* Progress indicator */}
        {testing && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-2xl animate-pulse">{getStatusIcon()}</span>
              <span className="text-sm text-gray-600">
                {phase === 'sending' && 'Sending test notification to Apple...'}
                {phase === 'waiting' && 'Waiting for webhook delivery...'}
                {phase === 'checking' && 'Checking delivery status (may retry up to 3 times)...'}
              </span>
            </div>
            {testToken && (
              <div className="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded">
                Token: {testToken}
              </div>
            )}
          </div>
        )}

        {/* Result display */}
        {phase === 'complete' && (error || result) && (
          <div className={`p-4 rounded-md ${error ? 'bg-red-50' : result?.firstSendAttemptResult === 'SUCCESS' ? 'bg-green-50' : 'bg-yellow-50'}`}>
            {error ? (
              <>
                <div className="flex items-center space-x-2">
                  <span className="text-xl">❌</span>
                  <p className="text-sm font-medium text-red-800">Test Failed</p>
                </div>
                <p className="text-xs text-red-600 mt-2">
                  {error}
                  {error.includes('retries exhausted') && (
                    <span className="block mt-1 text-gray-500">
                      The system attempted to check the status 3 times with 2-second intervals.
                    </span>
                  )}
                </p>
              </>
            ) : result && (
              <>
                <div className="flex items-center space-x-2">
                  {result.firstSendAttemptResult === 'SUCCESS' ? (
                    <>
                      <span className="text-xl">✅</span>
                      <p className="text-sm font-medium text-green-800">Webhook Verified Successfully</p>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">⚠️</span>
                      <p className="text-sm font-medium text-yellow-800">
                        Status: {result.firstSendAttemptResult || 'Pending'}
                      </p>
                    </>
                  )}
                </div>
                
                {result.sendAttempts && result.sendAttempts.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-600">
                      Delivery attempts: {result.sendAttempts.length}
                    </p>
                    {result.sendAttempts.map((attempt: any, index: number) => (
                      <div key={index} className="mt-1">
                        <p className="text-xs text-gray-500">
                          • {new Date(attempt.attemptDate).toLocaleString()} - {attempt.responseStatusCode || 'N/A'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                
                {testToken && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500">Test Token:</p>
                    <p className="text-xs font-mono text-gray-600 break-all">{testToken}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}