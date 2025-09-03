import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AuthOptions {
  allowServiceRole?: boolean  // 允许service role访问
  requireAdmin?: boolean      // 要求管理员权限
  allowAnonymous?: boolean    // 允许匿名访问（默认false）
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
  const {
    allowServiceRole = false,
    requireAdmin = true,
    allowAnonymous = false
  } = options

  // Get the authorization header
  const authHeader = req.headers.get('Authorization')
  
  // Get environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Check if anonymous access is allowed
  if (allowAnonymous && !authHeader) {
    return { isValid: true }
  }

  // No auth header and anonymous not allowed
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

  // Check if this is a service role token
  if (allowServiceRole && token === supabaseServiceKey) {
    return {
      isValid: true,
      isServiceRole: true
    }
  }

  // Verify user JWT token
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

    // If admin is required, check admin status
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