-- Create a function to initialize default admin user
-- This function will be called during deployment to ensure a default admin exists
CREATE OR REPLACE FUNCTION public.create_default_admin()
RETURNS void AS $$
DECLARE
    admin_id UUID;
    admin_exists BOOLEAN;
BEGIN
    -- Check if any admin user already exists
    SELECT EXISTS(SELECT 1 FROM public.admin_users LIMIT 1) INTO admin_exists;
    
    IF NOT admin_exists THEN
        -- Note: The actual user creation needs to be done via Supabase Auth API
        -- This function just prepares the admin_users table entry
        -- The actual user will be created by the Edge Function or setup script
        RAISE NOTICE 'No admin users found. Default admin needs to be created via setup script.';
    ELSE
        RAISE NOTICE 'Admin user already exists. Skipping default admin creation.';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Call the function to check/create default admin
SELECT public.create_default_admin();