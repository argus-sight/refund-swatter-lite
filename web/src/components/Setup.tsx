'use client'

import { useState } from 'react'
import { AppleEnvironment } from '@/lib/apple'

interface SetupProps {
  onSetupComplete: () => void
}

export default function Setup({ onSetupComplete }: SetupProps) {
  const [bundleId, setBundleId] = useState('')
  const [issuerId, setIssuerId] = useState('')
  const [keyId, setKeyId] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [environment, setEnvironment] = useState<AppleEnvironment>(AppleEnvironment.SANDBOX)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Update config via API
      const configResponse = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bundle_id: bundleId,
          apple_issuer_id: issuerId,
          apple_key_id: keyId,
          environment,
          refund_preference: 0, // Default to undeclared
          updated_at: new Date().toISOString()
        })
      })

      if (!configResponse.ok) {
        const errorData = await configResponse.json()
        throw new Error(errorData.error || 'Failed to update config')
      }

      // Store private key in vault
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ privateKey })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to store private key')
      }

      onSetupComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Setup Refund Swatter Lite
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Configure your Apple App Store credentials
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSetup}>
            <div>
              <label htmlFor="bundleId" className="block text-sm font-medium text-gray-700">
                Bundle ID
              </label>
              <input
                type="text"
                id="bundleId"
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                required
                placeholder="com.example.app"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
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
                required
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
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
                required
                placeholder="XXXXXXXXXX"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="privateKeyFile" className="block text-sm font-medium text-gray-700">
                Private Key (.p8 file)
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
                  required={!privateKey}
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-md cursor-pointer focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {privateKey && (
                  <p className="mt-2 text-sm text-green-600">
                    ✓ Private key loaded
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="environment" className="block text-sm font-medium text-gray-700">
                Environment
              </label>
              <select
                id="environment"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as AppleEnvironment)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value={AppleEnvironment.SANDBOX}>Sandbox</option>
                <option value={AppleEnvironment.PRODUCTION}>Production</option>
              </select>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Setting up...' : 'Complete Setup'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}