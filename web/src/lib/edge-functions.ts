import { supabase } from './supabase'

/**
 * Helper function to call Supabase Edge Functions
 */
export async function callEdgeFunction<T = any>(
  functionName: string,
  body?: any,
  options?: {
    headers?: Record<string, string>
  }
): Promise<{ data?: T; error?: Error }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Not authenticated')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not configured')
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          ...options?.headers
        },
        body: body ? JSON.stringify(body) : undefined
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Edge function ${functionName} failed`)
    }

    return { data }
  } catch (error) {
    console.error(`Error calling edge function ${functionName}:`, error)
    return { error: error as Error }
  }
}

/**
 * Helper function to call Edge Functions with GET method
 */
export async function getFromEdgeFunction<T = any>(
  functionName: string,
  options?: {
    headers?: Record<string, string>
  }
): Promise<{ data?: T; error?: Error }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Not authenticated')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not configured')
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/${functionName}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          ...options?.headers
        }
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Edge function ${functionName} failed`)
    }

    return { data }
  } catch (error) {
    console.error(`Error calling edge function ${functionName}:`, error)
    return { error: error as Error }
  }
}

/**
 * Helper function to call Edge Functions with PUT method
 */
export async function updateInEdgeFunction<T = any>(
  functionName: string,
  body?: any,
  options?: {
    headers?: Record<string, string>
  }
): Promise<{ data?: T; error?: Error }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Not authenticated')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not configured')
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/${functionName}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          ...options?.headers
        },
        body: body ? JSON.stringify(body) : undefined
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Edge function ${functionName} failed`)
    }

    return { data }
  } catch (error) {
    console.error(`Error calling edge function ${functionName}:`, error)
    return { error: error as Error }
  }
}