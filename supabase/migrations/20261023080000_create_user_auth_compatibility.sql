-- Release candidate only: production application requires separate owner approval.
BEGIN;
-- LOCAL CANDIDATE ONLY; depends on the active-admin guard.
-- Initialize only new account fields. No existing users, defaults or ACL changes.
DO $compatibility_guard$
BEGIN
 IF md5(pg_get_functiondef('public.create_user_by_admin(text,text,text,public.app_role)'::regprocedure)) <> '167bd216cdbf5d11e248388da5bdec52' THEN
  RAISE EXCEPTION 'CREATE_USER_AUTH_COMPATIBILITY_BASELINE_CHANGED';
 END IF;
END;
$compatibility_guard$;
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
        updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
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
        now(),
        '', '', '', ''
    );

    -- The trigger handle_new_user() will automatically create the profile with 'viewer' role.
    -- We need to update the role to the selected one.
    UPDATE public.profiles
    SET role = new_role
    WHERE id = new_id;

    RETURN new_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
