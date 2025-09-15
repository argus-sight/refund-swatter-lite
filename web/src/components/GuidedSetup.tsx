'use client'

import { useState, useEffect } from 'react'
import { AppleEnvironment } from '@/lib/apple'
import { getFromEdgeFunction, updateInEdgeFunction, callEdgeFunction } from '@/lib/edge-functions'
import { supabase } from '@/lib/supabase'
import { 
  CheckCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  DocumentDuplicateIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid'

interface GuidedSetupProps {
  onSetupComplete?: () => void
}

interface StepProps {
  title: string
  description: string
  completed: boolean
  optional?: boolean
}

const STEPS: StepProps[] = [
  {
    title: 'Apple Configuration',
    description: 'Configure your Apple App Store credentials',
    completed: false
  },
  {
    title: 'Upload P8 Key',
    description: 'Upload your In-App Purchase Key file',
    completed: false
  },
  {
    title: 'Webhook Configuration',
    description: 'Set up Server-to-Server Notification V2 webhook',
    completed: false
  },
  {
    title: 'Test Notifications',
    description: 'Send and verify test notifications',
    completed: false
  },
  {
    title: 'Refund Preference',
    description: 'Configure your refund preference settings',
    completed: false
  },
  {
    title: 'Important Information',
    description: 'Review consumption info defaults and best practices',
    completed: false
  },
  {
    title: 'Import History',
    description: 'Import historical transaction data (Optional)',
    completed: false,
    optional: true
  }
]

export default function GuidedSetup({ onSetupComplete }: GuidedSetupProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [steps, setSteps] = useState(STEPS)
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Apple Configuration
  const [bundleId, setBundleId] = useState('')
  const [issuerId, setIssuerId] = useState('')
  const [keyId, setKeyId] = useState('')
  
  // Step 2: P8 Key
  const [privateKey, setPrivateKey] = useState('')
  const [privateKeyUploaded, setPrivateKeyUploaded] = useState(false)
  
  // Step 3: Webhook
  const [webhookUrl, setWebhookUrl] = useState(() => {
    // Use a function to ensure consistent initial value
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    return supabaseUrl ? `${supabaseUrl}/functions/v1/webhook` : ''
  })
  const [webhookCopied, setWebhookCopied] = useState(false)
  
  // Step 4: Test Notification
  const [testEnvironment, setTestEnvironment] = useState<AppleEnvironment>(AppleEnvironment.SANDBOX)
  const [testResult, setTestResult] = useState<any>(null)
  const [testLoading, setTestLoading] = useState(false)
  
  // Data initialization states
  const [importLoading, setImportLoading] = useState(false)
  const [importProgress, setImportProgress] = useState<{
    sandbox: 'pending' | 'loading' | 'completed' | 'error'
    production: 'pending' | 'loading' | 'completed' | 'error'
  }>({ sandbox: 'pending', production: 'pending' })
  const [importResults, setImportResults] = useState<{
    sandbox?: any
    production?: any
  }>({})
  
  // Step 5: Refund Preference
  const [refundPreference, setRefundPreference] = useState(0)
  
  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const { data, error } = await getFromEdgeFunction('config')
      if (error) {
        console.error('Failed to load config:', error)
      } else if (data) {
        setConfig(data)
        // Pre-fill fields if config exists, ensuring no undefined values
        setBundleId(data.bundle_id ?? '')
        setIssuerId(data.apple_issuer_id ?? '')
        setKeyId(data.apple_key_id ?? '')
        if (data.apple_private_key) setPrivateKeyUploaded(true)
        setRefundPreference(data.refund_preference !== null && data.refund_preference !== undefined ? data.refund_preference : 0)
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
  }

  const handleAppleConfigSave = async () => {
    setLoading(true)
    setError('')
    
    // Validate required fields
    if (!bundleId?.trim()) {
      setError('Bundle ID is required')
      setLoading(false)
      return
    }
    
    if (!issuerId?.trim()) {
      setError('Issuer ID is required')
      setLoading(false)
      return
    }
    
    if (!keyId?.trim()) {
      setError('Key ID is required')
      setLoading(false)
      return
    }
    
    try {
      const { error: configError } = await updateInEdgeFunction('config', {
        bundle_id: bundleId.trim(),
        apple_issuer_id: issuerId.trim(),
        apple_key_id: keyId.trim(),
        updated_at: new Date().toISOString()
      })

      if (configError) {
        throw new Error(configError.message || 'Failed to update config')
      }

      // Mark step as completed
      const newSteps = [...steps]
      newSteps[0].completed = true
      setSteps(newSteps)
      
      // Move to next step
      setError('')
      setCurrentStep(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  const handlePrivateKeyUpload = async () => {
    if (!privateKey) {
      setError('Please select a P8 key file')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error: setupError } = await callEdgeFunction('store-apple-key', {
        privateKey
      })

      if (setupError) {
        throw new Error(setupError.message || 'Failed to store private key')
      }

      setPrivateKeyUploaded(true)
      
      // Mark step as completed
      const newSteps = [...steps]
      newSteps[1].completed = true
      setSteps(newSteps)
      
      // Move to next step
      setCurrentStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload private key')
    } finally {
      setLoading(false)
    }
  }

  const handleWebhookConfigure = () => {
    // Mark step as completed after copying
    if (webhookCopied) {
      const newSteps = [...steps]
      newSteps[2].completed = true
      setSteps(newSteps)
      setCurrentStep(3)
    } else {
      setError('Please copy the webhook URL and configure it in App Store Connect first')
    }
  }

  const handleTestNotification = async () => {
    setTestLoading(true)
    setError('')
    setTestResult(null)

    try {
      // Step 1: Send test notification
      const { data: sendData, error: sendError } = await callEdgeFunction('test-webhook', { 
        environment: testEnvironment 
      })
      
      if (sendError) {
        throw new Error(sendError.message)
      }

      if (!sendData.testNotificationToken) {
        throw new Error('No test token received')
      }

      // Step 2: Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Step 3: Check status
      const { data: statusData, error: statusError } = await callEdgeFunction('test-webhook-status', { 
        testNotificationToken: sendData.testNotificationToken,
        environment: testEnvironment
      })
      
      if (statusError) {
        throw new Error(statusError.message)
      }

      setTestResult(statusData)
      
      // Mark step as completed if successful
      if (statusData?.firstSendAttemptResult === 'SUCCESS') {
        const newSteps = [...steps]
        newSteps[3].completed = true
        setSteps(newSteps)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test notification')
    } finally {
      setTestLoading(false)
    }
  }

  const handleRefundPreferenceSave = async () => {
    setLoading(true)
    setError('')

    try {
      // Include all required fields when updating
      const updateData: any = {
        refund_preference: refundPreference,
        updated_at: new Date().toISOString()
      }
      
      // Include required fields if they are set
      if (bundleId) updateData.bundle_id = bundleId.trim()
      if (issuerId) updateData.apple_issuer_id = issuerId.trim()
      if (keyId) updateData.apple_key_id = keyId.trim()
      
      const { data, error } = await updateInEdgeFunction('config', updateData)
      
      if (error) {
        throw new Error(error.message || 'Failed to update refund preference')
      }
      
      // Mark step as completed
      const newSteps = [...steps]
      newSteps[4].completed = true
      setSteps(newSteps)
      
      // Move to next step
      setCurrentStep(5)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save refund preference')
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteSetup = () => {
    // Mark final step as completed
    const newSteps = [...steps]
    newSteps[5].completed = true
    setSteps(newSteps)
    
    // Call completion callback
    if (onSetupComplete) {
      onSetupComplete()
    }
  }

  const handleImportHistoricalData = async () => {
    setImportLoading(true)
    setImportProgress({ sandbox: 'pending', production: 'pending' })
    setImportResults({})
    
    // Helper function to get date range
    const getDateRange = (days: number) => {
      const endDate = new Date()
      endDate.setUTCHours(23, 59, 59, 999)
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000 - 1))
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      }
    }
    
    // Check if we have config for production (it might not be set up yet)
    const hasProductionConfig = config && config.apple_issuer_id && config.apple_key_id
    
    // Import Sandbox (30 days max)
    const importSandbox = async () => {
      setImportProgress(prev => ({ ...prev, sandbox: 'loading' }))
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No session')
        
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const response = await fetch(`${supabaseUrl}/functions/v1/data-initialization`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            environment: AppleEnvironment.SANDBOX,
            ...getDateRange(30)
          })
        })
        
        const data = await response.json()
        if (!response.ok) {
          // Provide more specific error messages
          let errorMessage = data.error || 'Sandbox import failed'
          if (response.status === 404) {
            errorMessage = 'Sandbox environment not configured or no data available'
          } else if (response.status === 401) {
            errorMessage = 'Authentication failed for Sandbox environment'
          } else if (data.details) {
            errorMessage = `${errorMessage}: ${JSON.stringify(data.details)}`
          }
          throw new Error(errorMessage)
        }
        
        setImportResults(prev => ({ ...prev, sandbox: data }))
        setImportProgress(prev => ({ ...prev, sandbox: 'completed' }))
      } catch (error: any) {
        console.error('Sandbox import error:', error)
        setImportProgress(prev => ({ ...prev, sandbox: 'error' }))
        setImportResults(prev => ({ ...prev, sandbox: { error: error.message || 'Unknown error' } }))
      }
    }
    
    // Import Production (180 days max)
    const importProduction = async () => {
      setImportProgress(prev => ({ ...prev, production: 'loading' }))
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No session')
        
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const response = await fetch(`${supabaseUrl}/functions/v1/data-initialization`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            environment: AppleEnvironment.PRODUCTION,
            ...getDateRange(180)
          })
        })
        
        const data = await response.json()
        if (!response.ok) {
          // Provide more specific error messages
          let errorMessage = data.error || 'Production import failed'
          if (response.status === 404) {
            errorMessage = 'Production environment not configured or no data available'
          } else if (response.status === 401) {
            errorMessage = 'Authentication failed for Production environment'
          } else if (data.details) {
            errorMessage = `${errorMessage}: ${JSON.stringify(data.details)}`
          }
          throw new Error(errorMessage)
        }
        
        setImportResults(prev => ({ ...prev, production: data }))
        setImportProgress(prev => ({ ...prev, production: 'completed' }))
      } catch (error: any) {
        console.error('Production import error:', error)
        setImportProgress(prev => ({ ...prev, production: 'error' }))
        setImportResults(prev => ({ ...prev, production: { error: error.message || 'Unknown error' } }))
      }
    }
    
    // Run both imports in parallel
    await Promise.all([importSandbox(), importProduction()])
    setImportLoading(false)
  }

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    setWebhookCopied(true)
    setTimeout(() => setWebhookCopied(false), 2000)
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Apple Configuration
        return (
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="bundleId" className="block text-sm font-medium text-gray-700">
                Bundle ID
              </label>
              <input
                type="text"
                id="bundleId"
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                placeholder="com.example.app"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <div className="mt-2 bg-blue-50 p-3 rounded-md">
                <p className="text-xs text-blue-800 font-medium">How to get Bundle ID:</p>
                <ol className="mt-1 text-xs text-blue-700 space-y-1">
                  <li>1. Go to App Store Connect → Apps</li>
                  <li>2. Select your app</li>
                  <li>3. Go to App Information (under General)</li>
                  <li>4. Find "Bundle ID" field</li>
                </ol>
                <p className="mt-2 text-xs text-blue-600">Example: com.yourcompany.app</p>
              </div>
            </div>

            <div>
              <label htmlFor="issuerId" className="block text-sm font-medium text-gray-700">
                Issuer ID
              </label>
              <input
                type="text"
                id="issuerId"
                value={issuerId}
                onChange={(e) => setIssuerId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <div className="mt-2 bg-blue-50 p-3 rounded-md">
                <p className="text-xs text-blue-800 font-medium">How to get Issuer ID:</p>
                <ol className="mt-1 text-xs text-blue-700 space-y-1">
                  <li>1. Go to App Store Connect</li>
                  <li>2. Click "Users and Access" in the top menu</li>
                  <li>3. Select "Integrations" tab</li>
                  <li>4. Under "In-App Purchase" section, find "Issuer ID" field (red box in the image)</li>
                </ol>
                <p className="mt-2 text-xs text-blue-600">Example: 12345678-1234-1234-1234-123456789abc</p>
              </div>
            </div>

            <div>
              <label htmlFor="keyId" className="block text-sm font-medium text-gray-700">
                Key ID
              </label>
              <input
                type="text"
                id="keyId"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="XXXXXXXXXX"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <div className="mt-2 bg-blue-50 p-3 rounded-md">
                <p className="text-xs text-blue-800 font-medium">How to get Key ID:</p>
                <ol className="mt-1 text-xs text-blue-700 space-y-1">
                  <li>1. Go to App Store Connect → Users and Access → Integrations</li>
                  <li>2. In "In-App Purchase" section, look at the "Active" keys table</li>
                  <li>3. Find your key in the list</li>
                  <li>4. Copy the value from "KEY ID" column (red box in the image)</li>
                </ol>
                <p className="mt-2 text-xs text-blue-600">Example: ABCD12EF34</p>
              </div>
            </div>

            <button
              onClick={handleAppleConfigSave}
              disabled={loading || !bundleId || !issuerId || !keyId}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save and Continue'}
            </button>
          </div>
        )

      case 1: // Upload P8 Key
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900">About the In-App Purchase Key</h3>
              <p className="mt-1 text-sm text-blue-700">
                The P8 In-App Purchase Key is used to authenticate API requests to Apple's servers.
              </p>
              <div className="mt-3">
                <p className="text-xs text-blue-800 font-medium">How to create and download the P8 key:</p>
                <ol className="mt-1 text-xs text-blue-700 space-y-1">
                  <li>1. Go to App Store Connect → Users and Access → Integrations</li>
                  <li>2. In the "In-App Purchase" section, click "Generate In-App Purchase Key" or "+" button</li>
                  <li>3. Enter a name for your key (e.g., "in_app_purchase_key")</li>
                  <li>4. Click "Generate"</li>
                  <li>5. Download the .p8 file immediately (you can only download it once!)</li>
                  <li>6. Save the file securely - you'll need to upload it below</li>
                </ol>
                <p className="mt-2 text-xs text-amber-600 font-medium">⚠️ Important: You can only download the key once. Save it securely!</p>
              </div>
            </div>

            <div>
              <label htmlFor="privateKeyFile" className="block text-sm font-medium text-gray-700">
                In-App Purchase Key (.p8 file)
              </label>
              <div className="mt-1">
                <input
                  type="file"
                  id="privateKeyFile"
                  accept=".p8"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const content = await file.text()
                      setPrivateKey(content)
                    }
                  }}
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-md cursor-pointer focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {privateKey && (
                  <p className="mt-2 text-sm text-green-600 flex items-center">
                    <CheckCircleIconSolid className="h-4 w-4 mr-1" />
                    Private key loaded
                  </p>
                )}
                {privateKeyUploaded && !privateKey && (
                  <p className="mt-2 text-sm text-green-600 flex items-center">
                    <CheckCircleIconSolid className="h-4 w-4 mr-1" />
                    Private key already uploaded
                  </p>
                )}
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setError('')
                  setCurrentStep(0)
                }}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                Back
              </button>
              <button
                onClick={handlePrivateKeyUpload}
                disabled={loading || (!privateKey && !privateKeyUploaded)}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Uploading...' : privateKeyUploaded && !privateKey ? 'Continue' : 'Upload and Continue'}
              </button>
            </div>
          </div>
        )

      case 2: // Webhook Configuration
        return (
          <div className="space-y-4">
            <div className="bg-yellow-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-yellow-900">Configure in App Store Connect</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Copy this webhook URL and configure it in App Store Connect for Server-to-Server Notification V2.
              </p>
              <ol className="mt-2 text-sm text-yellow-700 list-decimal list-inside space-y-1">
                <li>Go to App Store Connect</li>
                <li>Select your app</li>
                <li>Navigate to App Information → Server Notifications</li>
                <li>Enable Version 2 Notifications</li>
                <li>Paste the webhook URL below</li>
              </ol>
            </div>

            <div>
              <label htmlFor="webhook" className="block text-sm font-medium text-gray-700">
                Webhook URL
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  id="webhook"
                  value={webhookUrl}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md text-sm font-mono bg-gray-50"
                />
                <button
                  onClick={copyWebhookUrl}
                  className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {webhookCopied ? (
                    <>
                      <CheckCircleIconSolid className="h-4 w-4 mr-1 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="webhookConfigured"
                checked={webhookCopied}
                onChange={(e) => setWebhookCopied(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="webhookConfigured" className="ml-2 text-sm text-gray-700">
                I have configured this webhook URL in App Store Connect
              </label>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setError('')
                  setCurrentStep(1)
                }}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                Back
              </button>
              <button
                onClick={handleWebhookConfigure}
                disabled={!webhookCopied}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Continue
                <ArrowRightIcon className="h-4 w-4 inline ml-1" />
              </button>
            </div>
          </div>
        )

      case 3: // Test Notification
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900">Test Your Configuration</h3>
              <p className="mt-1 text-sm text-blue-700">
                Send a test notification to verify your setup is working correctly.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
              <div className="flex">
                <svg className="h-5 w-5 text-amber-400 mr-2 flex-shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-amber-800">Important: Wait for Apple deployment</h4>
                  <p className="mt-1 text-sm text-amber-700">
                    After configuring your webhook URL, please wait approximately 10 minutes for Apple's servers to deploy and activate your webhook endpoint before running the test notification.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="testEnv" className="block text-sm font-medium text-gray-700">
                Environment
              </label>
              <select
                id="testEnv"
                value={testEnvironment}
                onChange={(e) => setTestEnvironment(e.target.value as AppleEnvironment)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value={AppleEnvironment.SANDBOX}>Sandbox</option>
                <option value={AppleEnvironment.PRODUCTION}>Production</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                A test notification will be sent to your configured webhook URL to verify the connection.
              </p>
            </div>

            {testResult && (
              <div className={`p-4 rounded-lg ${
                testResult.firstSendAttemptResult === 'SUCCESS'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <h4 className={`text-sm font-medium ${
                  testResult.firstSendAttemptResult === 'SUCCESS'
                    ? 'text-green-900'
                    : 'text-yellow-900'
                }`}>
                  Test Result
                </h4>
                <div className="mt-2 text-xs">
                  {testResult.firstSendAttemptResult === 'SUCCESS' ? (
                    <div className="text-green-700">
                      <p className="font-semibold">✓ Webhook verified successfully!</p>
                      <p className="mt-1">Your webhook is configured correctly and ready to receive notifications.</p>
                      {testResult.sendAttempts && testResult.sendAttempts.length > 0 && (
                        <p className="mt-1">Result: <span className="font-mono">{testResult.sendAttempts[0].sendAttemptResult || 'N/A'}</span></p>
                      )}
                    </div>
                  ) : (
                    <div className="text-yellow-700">
                      <p>⚠️ Webhook status: {testResult.firstSendAttemptResult || 'Pending'}</p>
                      <p className="mt-1">The test notification was sent but may still be in transit.</p>
                      {testResult.sendAttempts && testResult.sendAttempts.length > 0 && (
                        <p className="mt-1">Attempts: {testResult.sendAttempts.length}</p>
                      )}
                    </div>
                  )}
                  
                  {/* Detailed Information */}
                  {testResult.sendAttempts && testResult.sendAttempts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="font-semibold text-gray-700">Delivery Attempts:</p>
                      {testResult.sendAttempts.map((attempt: any, index: number) => (
                        <div key={index} className="mt-2 p-2 bg-white rounded">
                          <p className="text-gray-600">
                            Attempt #{index + 1} - {new Date(attempt.attemptDate).toLocaleString()}
                          </p>
                          <p className="text-gray-600">
                            Result: <span className="font-mono">{attempt.sendAttemptResult || 'N/A'}</span>
                          </p>
                          {attempt.responseStatusCode && (
                            <p className="text-gray-600">
                              Response Code: <span className="font-mono">{attempt.responseStatusCode}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Parsed JWS Data */}
                  {testResult.signedPayload && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <details className="cursor-pointer">
                        <summary className="font-semibold text-gray-700 hover:text-gray-900">
                          View Notification Details (JWS)
                        </summary>
                        <div className="mt-2 space-y-3">
                          {(() => {
                            try {
                              // Parse JWS to extract header and payload
                              const parts = testResult.signedPayload.split('.')
                              if (parts.length === 3) {
                                const header = JSON.parse(atob(parts[0]))
                                const payload = JSON.parse(atob(parts[1]))
                                
                                return (
                                  <>
                                    {/* JWS Header */}
                                    <div className="p-2 bg-white rounded">
                                      <p className="text-gray-600 font-semibold mb-1">JWS Header:</p>
                                      <div className="p-2 bg-gray-50 rounded">
                                        <pre className="text-xxs font-mono text-gray-600">
                                          {JSON.stringify(header, null, 2)}
                                        </pre>
                                      </div>
                                    </div>
                                    
                                    {/* Notification Summary */}
                                    <div className="p-2 bg-white rounded">
                                      <p className="text-gray-600 font-semibold mb-2">Notification Summary:</p>
                                      <div className="space-y-1 text-xs">
                                        <p className="text-gray-600">
                                          <span className="font-medium">Type:</span> {payload.notificationType || 'N/A'}
                                        </p>
                                        {payload.subtype && (
                                          <p className="text-gray-600">
                                            <span className="font-medium">Subtype:</span> {payload.subtype}
                                          </p>
                                        )}
                                        <p className="text-gray-600">
                                          <span className="font-medium">Version:</span> {payload.version || 'N/A'}
                                        </p>
                                        <p className="text-gray-600">
                                          <span className="font-medium">Notification UUID:</span> <span className="font-mono">{payload.notificationUUID || 'N/A'}</span>
                                        </p>
                                        {payload.signedDate && (
                                          <p className="text-gray-600">
                                            <span className="font-medium">Signed Date:</span> {new Date(payload.signedDate).toLocaleString()}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Transaction Info if available */}
                                    {payload.data?.signedTransactionInfo && (
                                      <div className="p-2 bg-white rounded">
                                        <p className="text-gray-600 font-semibold mb-1">Transaction Info:</p>
                                        <div className="text-xs text-gray-600">
                                          <p>Contains signed transaction data (JWS format)</p>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Renewal Info if available */}
                                    {payload.data?.signedRenewalInfo && (
                                      <div className="p-2 bg-white rounded">
                                        <p className="text-gray-600 font-semibold mb-1">Renewal Info:</p>
                                        <div className="text-xs text-gray-600">
                                          <p>Contains signed renewal data (JWS format)</p>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Full Decoded Payload */}
                                    <details className="p-2 bg-white rounded cursor-pointer">
                                      <summary className="text-gray-600 font-semibold hover:text-gray-900">
                                        View Full Decoded Payload
                                      </summary>
                                      <div className="mt-2 p-2 bg-gray-50 rounded">
                                        <pre className="text-xxs font-mono text-gray-600 overflow-x-auto">
                                          {JSON.stringify(payload, null, 2)}
                                        </pre>
                                      </div>
                                    </details>
                                    
                                    {/* Raw JWS */}
                                    <details className="p-2 bg-white rounded cursor-pointer">
                                      <summary className="text-gray-600 font-semibold hover:text-gray-900">
                                        View Raw Signed Payload
                                      </summary>
                                      <div className="mt-2 p-2 bg-gray-50 rounded overflow-x-auto">
                                        <pre className="text-xxs font-mono text-gray-600 whitespace-pre-wrap break-all">
                                          {testResult.signedPayload}
                                        </pre>
                                      </div>
                                    </details>
                                  </>
                                )
                              }
                            } catch (e) {
                              console.error('Failed to parse JWS:', e)
                              return (
                                <div className="p-2 bg-white rounded">
                                  <p className="text-red-600 text-xs">Failed to parse JWS data</p>
                                  <details className="mt-2 cursor-pointer">
                                    <summary className="text-gray-600 text-xs hover:text-gray-900">View Raw Data</summary>
                                    <div className="mt-2 p-2 bg-gray-50 rounded overflow-x-auto">
                                      <pre className="text-xxs font-mono text-gray-600 whitespace-pre-wrap break-all">
                                        {testResult.signedPayload}
                                      </pre>
                                    </div>
                                  </details>
                                </div>
                              )
                            }
                            return null
                          })()}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setError('')
                  setCurrentStep(2)
                }}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                Back
              </button>
              <button
                onClick={handleTestNotification}
                disabled={testLoading}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {testLoading ? 'Sending...' : 'Send Test'}
              </button>
              <button
                onClick={() => {
                  setError('')
                  setCurrentStep(4)
                }}
                disabled={testResult?.firstSendAttemptResult !== 'SUCCESS'}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Continue
                <ArrowRightIcon className="h-4 w-4 inline ml-1" />
              </button>
            </div>
          </div>
        )

      case 4: // Refund Preference
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900">Refund Preference</h3>
              <p className="mt-1 text-sm text-blue-700">
                Configure your default preference for refund requests. This helps Apple's refund decision process
                but is just one of many factors considered.
              </p>
            </div>

            <div>
              <label htmlFor="refundPref" className="block text-sm font-medium text-gray-700">
                Select your preference
              </label>
              <select
                id="refundPref"
                value={refundPreference}
                onChange={(e) => setRefundPreference(parseInt(e.target.value))}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value={0}>Undeclared (Don't provide preference)</option>
                <option value={1}>Prefer Grant Refund</option>
                <option value={2}>Prefer Decline Refund</option>
                <option value={3}>No Preference</option>
              </select>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-xs font-semibold text-gray-700">About Refund Preferences:</h4>
              <ul className="mt-2 text-xs text-gray-600 space-y-1">
                <li>• <strong>Undeclared:</strong> You don't send any preference to Apple</li>
                <li>• <strong>Prefer Grant:</strong> You prefer the refund to be granted</li>
                <li>• <strong>Prefer Decline:</strong> You prefer the refund to be declined</li>
                <li>• <strong>No Preference:</strong> You explicitly have no preference</li>
              </ul>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setError('')
                  setCurrentStep(3)
                }}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                Back
              </button>
              <button
                onClick={handleRefundPreferenceSave}
                disabled={loading}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save and Continue'}
              </button>
            </div>
          </div>
        )

      case 5: // Important Information
        return (
          <div className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-green-900 flex items-center">
                <InformationCircleIcon className="h-5 w-5 mr-1" />
                Important Information
              </h3>
              <p className="mt-1 text-sm text-green-700">
                Review the following default behaviors and best practices for consumption information.
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700">Delivery Status</h4>
                <p className="mt-1 text-xs text-gray-600">
                  <strong>Default:</strong> All consumption requests report delivery status as
                  "Successfully delivered and working properly" (status: 0).
                </p>
                <p className="mt-1 text-xs text-orange-600">
                  ⚠️ Ensure successful delivery of purchased items before consumption data is sent to Apple.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700">Consumption Status</h4>
                <p className="mt-1 text-xs text-gray-600">
                  <strong>Default:</strong> Returns "Undeclared" (0) when consumption data cannot be determined.
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  <strong>Logic:</strong> Simplified implementation - returns 0 (undeclared), 1 (not consumed 
                  for active subscriptions), or 2 (partially consumed if content accessed).
                </p>
                <p className="mt-1 text-xs text-orange-600">
                  ⚠️ To track consumption accurately, implement usage tracking in your app and store in the 
                  usage_metrics table.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700">User Status</h4>
                <p className="mt-1 text-xs text-gray-600">
                  <strong>Default:</strong> Returns 0 (Undeclared).
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  <strong>Apple Values:</strong>
                </p>
                <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                  <li>0 = Undeclared</li>
                  <li>1 = Active</li>
                  <li>2 = Suspended</li>
                  <li>3 = Terminated</li>
                  <li>4 = Limited Access</li>
                </ul>
                <p className="mt-1 text-xs text-orange-600">
                  ⚠️ Implement an account management system in your app to track suspended/terminated/limited 
                  accounts.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700">Customer Consent</h4>
                <p className="mt-1 text-xs text-gray-600">
                  <strong>Default:</strong> customerConsented is set to <strong>true</strong> for all consumption requests.
                </p>
                <p className="mt-1 text-xs text-orange-600">
                  ⚠️ Important: You must obtain explicit consent from your users before sending their consumption data 
                  to Apple. This is your responsibility as the developer to ensure compliance with privacy regulations.
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  Consider implementing:
                </p>
                <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                  <li>A consent dialog in your app</li>
                  <li>Clear privacy policy explaining data usage</li>
                  <li>User preference settings for data sharing</li>
                </ul>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setError('')
                  setCurrentStep(4)
                }}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                Back
              </button>
              <button
                onClick={() => setCurrentStep(6)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Import History
                <ArrowRightIcon className="h-4 w-4 inline ml-1" />
              </button>
              <button
                onClick={handleCompleteSetup}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Complete Setup
                <CheckCircleIcon className="h-4 w-4 inline ml-1" />
              </button>
            </div>
          </div>
        )
        
      case 6: // Data Initialization (Optional)
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900">Import Historical Data (Optional)</h3>
              <p className="mt-1 text-sm text-blue-700">
                This one-time import will retrieve historical transaction data from both Sandbox (last 30 days) 
                and Production (last 180 days) environments. Future data will sync automatically via webhooks.
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Why import historical data?</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Access past refund and purchase patterns
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Build complete transaction history for analytics
                </li>
                <li className="flex items-start">
                  <svg className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Identify historical trends and customer behavior
                </li>
              </ul>
            </div>

            {!importLoading && importProgress.sandbox === 'pending' && importProgress.production === 'pending' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex">
                  <svg className="h-5 w-5 text-amber-400 mr-2 flex-shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-amber-700">
                    <strong>Note:</strong> This import may take 2-5 minutes per environment.
                    You can skip this step and import data later from the Tools section.
                  </div>
                </div>
              </div>
            )}

            {/* Import Progress */}
            {(importLoading || importProgress.sandbox !== 'pending' || importProgress.production !== 'pending') && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Import Progress</h4>
                <div className="space-y-3">
                  {/* Sandbox Environment */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-700">Sandbox (30 days):</span>
                      {importProgress.sandbox === 'loading' && (
                        <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm ${
                      importProgress.sandbox === 'completed' ? 'text-green-600' :
                      importProgress.sandbox === 'error' ? 'text-red-600' :
                      importProgress.sandbox === 'loading' ? 'text-indigo-600' :
                      'text-gray-400'
                    }`}>
                      {importProgress.sandbox === 'completed' ? '✓ Completed' :
                       importProgress.sandbox === 'error' ? '✗ Failed' :
                       importProgress.sandbox === 'loading' ? 'Importing...' :
                       'Pending'}
                    </span>
                  </div>
                  
                  {/* Production Environment */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-700">Production (180 days):</span>
                      {importProgress.production === 'loading' && (
                        <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm ${
                      importProgress.production === 'completed' ? 'text-green-600' :
                      importProgress.production === 'error' ? 'text-red-600' :
                      importProgress.production === 'loading' ? 'text-indigo-600' :
                      'text-gray-400'
                    }`}>
                      {importProgress.production === 'completed' ? '✓ Completed' :
                       importProgress.production === 'error' ? '✗ Failed' :
                       importProgress.production === 'loading' ? 'Importing...' :
                       'Pending'}
                    </span>
                  </div>
                </div>
                
                {/* Show results summary or errors */}
                {(importResults.sandbox || importResults.production) && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    {importResults.sandbox?.summary && (
                      <p className="text-xs text-gray-600">
                        Sandbox: {importResults.sandbox.summary.totalFetched || 0} fetched, {importResults.sandbox.summary.inserted || 0} new imported
                      </p>
                    )}
                    {importResults.sandbox?.error && (
                      <p className="text-xs text-red-600">
                        Sandbox Error: {importResults.sandbox.error}
                      </p>
                    )}
                    {importResults.production?.summary && (
                      <p className="text-xs text-gray-600 mt-1">
                        Production: {importResults.production.summary.totalFetched || 0} fetched, {importResults.production.summary.inserted || 0} new imported
                      </p>
                    )}
                    {importResults.production?.error && (
                      <p className="text-xs text-red-600 mt-1">
                        Production Error: {importResults.production.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => setCurrentStep(5)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                Back
              </button>
              {(importProgress.sandbox === 'completed' || importProgress.production === 'completed') ? (
                <button
                  onClick={handleCompleteSetup}
                  className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Import Complete - Continue
                  <CheckCircleIcon className="h-4 w-4 inline ml-1" />
                </button>
              ) : (
                <button
                  onClick={handleImportHistoricalData}
                  disabled={importLoading}
                  className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importLoading ? 'Importing...' : 'Import Now'}
                  {!importLoading && (
                    <ArrowRightIcon className="h-4 w-4 inline ml-1" />
                  )}
                </button>
              )}
              <button
                onClick={handleCompleteSetup}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Skip for Now
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow">
        {/* Progress Steps */}
        <div className="px-8 pt-8">
          <nav aria-label="Progress">
            <ol className="flex items-center">
              {steps.map((step, index) => (
                <li key={index} className={`relative ${index !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''} flex-1`}>
                  <div className="flex items-center">
                    <div className={`
                      relative flex h-8 w-8 items-center justify-center rounded-full
                      ${index < currentStep || step.completed
                        ? 'bg-indigo-600'
                        : index === currentStep
                        ? 'border-2 border-indigo-600 bg-white'
                        : 'border-2 border-gray-300 bg-white'
                      }
                    `}>
                      {step.completed ? (
                        <CheckCircleIconSolid className="h-5 w-5 text-white" />
                      ) : (
                        <span className={`text-xs ${index === currentStep ? 'text-indigo-600' : 'text-gray-500'}`}>
                          {index + 1}
                        </span>
                      )}
                    </div>
                    {index !== steps.length - 1 && (
                      <div className={`
                        absolute top-4 left-8 -ml-px w-full h-0.5
                        ${index < currentStep ? 'bg-indigo-600' : 'bg-gray-300'}
                      `} />
                    )}
                  </div>
                  <div className="mt-2">
                    <span className={`text-xs font-medium ${
                      index <= currentStep ? 'text-indigo-600' : 'text-gray-500'
                    }`}>
                      {step.title}
                      {step.optional && <span className="text-gray-400 ml-1">(Optional)</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Step Content */}
        <div className="px-8 py-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">{steps[currentStep]?.title}</h2>
            <p className="mt-1 text-sm text-gray-600">{steps[currentStep]?.description}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {renderStepContent()}
        </div>
      </div>
    </div>
  )
}