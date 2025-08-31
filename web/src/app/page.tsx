'use client'

import { useState, useEffect } from 'react'
import Setup from '@/components/Setup'
import Dashboard from '@/components/Dashboard'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { createBrowserClient } from '@supabase/ssr'
import { useAuth } from '@/contexts/AuthContext'

export default function Home() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const { signOut, session, loading: authLoading } = useAuth()

  // Create authenticated supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    // Only check configuration after auth is loaded and we have a session
    if (!authLoading && session) {
      checkConfiguration()
    } else if (!authLoading && !session) {
      // No session and auth is loaded means user is not authenticated
      setIsConfigured(false)
      setConfigLoading(false)
    }
  }, [session, authLoading])

  const checkConfiguration = async () => {
    try {
      const { data: config, error } = await supabase
        .from('config')
        .select('apple_issuer_id, apple_key_id, apple_private_key_id')
        .single()

      if (error) {
        console.error('Error checking configuration:', error)
        setIsConfigured(false)
      } else {
        // Check if all required fields are configured
        const configured = !!(
          config?.apple_issuer_id && 
          config?.apple_key_id && 
          config?.apple_private_key_id
        )
        setIsConfigured(configured)
      }
    } catch (error) {
      console.error('Error:', error)
      setIsConfigured(false)
    } finally {
      setConfigLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <h1 className="text-xl font-semibold">Refund Swatter Admin</h1>
              <button
                onClick={signOut}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
        
        {configLoading ? (
          <div className="flex items-center justify-center mt-20">
            <div className="text-lg">Loading configuration...</div>
          </div>
        ) : !isConfigured ? (
          <Setup onSetupComplete={() => setIsConfigured(true)} />
        ) : (
          <Dashboard />
        )}
      </div>
    </ProtectedRoute>
  )
}