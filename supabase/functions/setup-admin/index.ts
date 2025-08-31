import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

    // Default admin credentials
    const defaultEmail = 'admin@refundswatter.com'
    const defaultPassword = 'ChangeMe123!'

    // Check if any admin user exists
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .limit(1)

    if (checkError) {
      console.error('Error checking for existing admins:', checkError)
      throw checkError
    }

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
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: defaultEmail,
      password: defaultPassword,
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
        note: 'Please change the password on first login'
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