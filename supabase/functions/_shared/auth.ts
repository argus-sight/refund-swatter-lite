import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AuthOptions {
  allowServiceRole?: boolean  // Allow service role access
  requireAdmin?: boolean      // Require admin privileges
  allowAnonymous?: boolean    // Allow anonymous access (default false)
}

export interface AuthResult {
  isValid: boolean
  isServiceRole?: boolean
  user?: any
  errorResponse?: Response
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
}

/**
 * Verify authentication for Edge Functions
 * @param req - The incoming request
 * @param options - Authentication options
 * @returns AuthResult with validation status and user info
 */
export async function verifyAuth(
  req: Request,
  options: AuthOptions = {}
): Promise<AuthResult> {
  // Normalise the caller's requirements so every branch can rely on defaults
  /*
   * Option semantics:
   * - allowServiceRole:
   *     Enables short-circuiting when the caller presents the Supabase
   *     `service_role` key. Typical use cases are cron jobs or other backend
   *     workers that invoke internal functions such as
   *     `process-notifications` → `send-consumption`. Because the service role
   *     key grants unrestricted database access, only enable this when you
   *     explicitly expect service-role traffic; otherwise leaving it false
   *     keeps the surface smaller.
   * - requireAdmin:
   *     Defaults to true, meaning the caller must exist in the `admin_users`
   *     allowlist. Keep this enabled for any function that reads or mutates
   *     privileged data (configuration, Apple credentials, etc.). Switch it to
   *     false only for endpoints intentionally usable by any signed-in user and
   *     that have no sensitive side effects.
   * - allowAnonymous:
   *     Reserved for public endpoints that deliberately accept unauthenticated
   *     requests (default false). Examples include health checks or webhook
   *     challenge handlers. Once enabled, missing Authorization headers are
   *     treated as valid, so ensure the function does not expose confidential
   *     data or actions.
   */
  const {
    allowServiceRole = false,
    requireAdmin = true,
    allowAnonymous = false
  } = options

  // Extract the caller supplied bearer token (if any)
  const authHeader = req.headers.get('Authorization')
  
  // Pull connection details once so we can create clients on demand
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Optional unauthenticated access for endpoints that explicitly declare it
  if (allowAnonymous && !authHeader) {
    return { isValid: true }
  }

  // Reject immediately when the header is missing or malformed
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      isValid: false,
      errorResponse: new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { headers: corsHeaders, status: 401 }
      )
    }
  }

  const token = authHeader.replace('Bearer ', '')

  // Allow privileged service role calls to short‑circuit when explicitly permitted
  if (allowServiceRole && token === supabaseServiceKey) {
    return {
      isValid: true,
      isServiceRole: true
    }
  }

  // For end-user sessions: validate the short-lived JWT with Supabase Auth
  // supabase.auth.getUser(token) will call the Auth API, which verifies
  // signature, expiry, and revocation before returning user metadata.
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return {
        isValid: false,
        errorResponse: new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { headers: corsHeaders, status: 401 }
        )
      }
    }

    // Optionally confirm the caller is listed in admin_users when elevated
    // privileges are required.
    if (requireAdmin) {
      // Use service role client to check admin status (bypasses RLS)
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
      const { data: adminUser, error: adminError } = await supabaseAdmin
        .from('admin_users')
        .select('id')
        .eq('id', user.id)
        .single()
      
      if (adminError || !adminUser) {
        return {
          isValid: false,
          errorResponse: new Response(
            JSON.stringify({ error: 'Unauthorized: Admin access required' }),
            { headers: corsHeaders, status: 403 }
          )
        }
      }
    }

    return {
      isValid: true,
      user: user
    }
  } catch (error) {
    console.error('Auth verification error:', error)
    return {
      isValid: false,
      errorResponse: new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { headers: corsHeaders, status: 401 }
      )
    }
  }
}

/**
 * Standard CORS headers for responses
 */
export function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders() })
  }
  return null
}
