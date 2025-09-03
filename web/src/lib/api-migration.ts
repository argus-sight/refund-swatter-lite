import { supabase } from './supabase'

/**
 * Migration helper to call Edge Functions instead of API routes
 * Maps old API routes to new Edge Functions
 */
export async function callMigratedAPI(
  oldRoute: string,
  options: {
    method?: string
    body?: any
    params?: Record<string, string>
  } = {}
): Promise<Response> {
  const { method = 'POST', body, params } = options
  
  // Map old API routes to new Edge Functions
  const routeMap: Record<string, string> = {
    '/api/consumption-metrics': 'consumption-metrics',
    '/api/retry-notification': 'retry-notification',
    '/api/resend-consumption': 'resend-consumption',
    '/api/apple-refund-history': 'apple-refund-history',
    '/api/apple-transaction-history': 'apple-transaction-history',
    '/api/apple-notification-history': 'apple-notification-history',
    '/api/consumption-requests': 'consumption-requests',
  }
  
  // Extract function name from route
  let functionName = routeMap[oldRoute]
  let pathParam = ''
  
  // Handle dynamic routes like /api/consumption-requests/[id]
  if (!functionName) {
    for (const [route, func] of Object.entries(routeMap)) {
      if (oldRoute.startsWith(route)) {
        functionName = func
        pathParam = oldRoute.replace(route, '')
        break
      }
    }
  }
  
  if (!functionName) {
    throw new Error(`No Edge Function mapping for route: ${oldRoute}`)
  }
  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('No session available')
  }
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  let url = `${supabaseUrl}/functions/v1/${functionName}${pathParam}`
  
  // Add query parameters
  if (params) {
    const searchParams = new URLSearchParams(params)
    url += `?${searchParams.toString()}`
  }
  
  return fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined
  })
}