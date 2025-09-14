'use client'

import { useState, useEffect } from 'react'
import Welcome from '@/components/Welcome'
import Dashboard from '@/components/Dashboard'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { createBrowserClient } from '@supabase/ssr'
import { useAuth } from '@/contexts/AuthContext'

export default function Home() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)
  const [showWelcome, setShowWelcome] = useState(true)
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
      // Use Edge Function instead of REST API
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setIsConfigured(false)
        setConfigLoading(false)
        return
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/config`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        console.error('Error checking configuration:', response.status)
        setIsConfigured(false)
      } else {
        const config = await response.json()
        
        // Check if all required fields are configured
        const configured = !!(
          config?.apple_issuer_id && 
          config?.apple_key_id && 
          config?.apple_private_key_id
        )
        setIsConfigured(configured)
        // If already configured, skip welcome page
        if (configured) {
          setShowWelcome(false)
        }
      }
    } catch (error) {
      console.error('Error:', error)
      setIsConfigured(false)
    } finally {
      setConfigLoading(false)
    }
  }

  const handleGetStarted = () => {
    // Navigate to Dashboard, which will show the Setup tab
    setShowWelcome(false)
    setIsConfigured(true) // This will show Dashboard, and user can access Setup tab there
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {!showWelcome && (
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
        )}
        
        {configLoading ? (
          <div className="flex items-center justify-center mt-20">
            <div className="text-lg">Loading configuration...</div>
          </div>
        ) : showWelcome && !isConfigured ? (
          <Welcome onGetStarted={handleGetStarted} />
        ) : (
          <Dashboard />
        )}
      </div>
    </ProtectedRoute>
  )
}