'use client'

import { useState, useEffect } from 'react'
import Setup from '@/components/Setup'
import Dashboard from '@/components/Dashboard'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkConfiguration()
  }, [])

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
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!isConfigured) {
    return <Setup onSetupComplete={() => setIsConfigured(true)} />
  }

  return <Dashboard />
}