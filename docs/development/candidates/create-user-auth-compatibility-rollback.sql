-- Exact function-only undo retaining the active-admin guard.
CREATE OR REPLACE FUNCTION public.create_user_by_admin(new_email text, new_password text, new_name text, new_role app_role)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    new_id UUID;
    encrypted_pw TEXT;
    _executing_role app_role; -- Renamed to avoid collision with system function 'current_role'
BEGIN
    -- Check if executing user is admin
    -- We explicitly select the role from the profiles table
    SELECT role INTO _executing_role FROM public.profiles WHERE id = auth.uid() AND is_active;
    
    -- Debugging / Security Check
    IF _executing_role IS NULL OR _executing_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: You are not an admin. Your ID: %, Your Role: %', auth.uid(), COALESCE(_executing_role::text, 'NULL');
    END IF;

    -- Hash the password
    encrypted_pw := crypt(new_password, gen_salt('bf'));
    new_id := gen_random_uuid();

    -- Insert into auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        role,
        aud,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at
    ) VALUES (
        new_id,
        '00000000-0000-0000-0000-000000000000', -- Default instance_id
        'authenticated',
        'authenticated',
        new_email,
        encrypted_pw,
        now(), -- Auto-confirm email
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object('full_name', new_name),
        FALSE,
        now(),
        now()
    );

    -- The trigger handle_new_user() will automatically create the profile with 'viewer' role.
    -- We need to update the role to the selected one.
    UPDATE public.profiles
    SET role = new_role
    WHERE id = new_id;

    RETURN new_id;
END;
$function$;
