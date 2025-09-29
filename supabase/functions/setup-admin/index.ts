import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuth, handleCors, getCorsHeaders } from '../_shared/auth.ts'

const corsHeaders = getCorsHeaders()

function generateSecurePassword(length = 24) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+'
  const randomBytes = new Uint8Array(length)
  crypto.getRandomValues(randomBytes)
  return Array.from(randomBytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) {
    return corsResponse
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // First check if any admin exists
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .limit(1)

    if (checkError) {
      console.error('Error checking for existing admins:', checkError)
      throw checkError
    }

    // If admin exists, require authentication
    const adminExists = !!(existingAdmins && existingAdmins.length > 0)

    const auth = await verifyAuth(req, {
      allowServiceRole: true,
      requireAdmin: adminExists,
      allowAnonymous: false
    })

    if (!auth.isValid) {
      return auth.errorResponse!
    }

    if (!adminExists && !auth.isServiceRole) {
      return new Response(
        JSON.stringify({ error: 'Service role key required to bootstrap admin user' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403
        }
      )
    }

    // Default admin credentials
    const defaultEmail = 'admin@refundswatter.com'

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ 
          message: 'Admin user already exists. No action taken.',
          exists: true 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Create the default admin user in Supabase Auth
    const initialPassword = generateSecurePassword()
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: defaultEmail,
      password: initialPassword,
      email_confirm: true // Auto-confirm email
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      throw authError
    }

    // Add the user to admin_users table
    const { error: insertError } = await supabaseAdmin
      .from('admin_users')
      .insert({
        id: authData.user.id,
        email: defaultEmail,
        must_change_password: true
      })

    if (insertError) {
      console.error('Error inserting admin user record:', insertError)
      // If we fail to insert, try to delete the auth user to maintain consistency
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw insertError
    }

    console.log('Default admin user created successfully')

    return new Response(
      JSON.stringify({ 
        message: 'Default admin user created successfully',
        email: defaultEmail,
        initial_password: initialPassword,
        note: 'Password generated server-side. You must change it on first login.'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in setup-admin:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
