-- LOCAL exact-definition undo; preserve original privileges and owner.
BEGIN;
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
    SELECT role INTO _executing_role FROM public.profiles WHERE id = auth.uid();
    
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
$function$
;
CREATE OR REPLACE FUNCTION public.delete_user_by_admin(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    _executing_role app_role;
BEGIN
    -- Check permissions
    SELECT role INTO _executing_role FROM public.profiles WHERE id = auth.uid();

    IF _executing_role IS NULL OR _executing_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Only admins can delete users.';
    END IF;

    -- Prevent self-deletion
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.';
    END IF;

    -- Delete from auth.users (Cascade should handle profiles)
    DELETE FROM auth.users WHERE id = target_user_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reset_user_password_by_admin(target_user_id uuid, new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    _executing_role app_role;
    encrypted_pw TEXT;
BEGIN
    SELECT role INTO _executing_role FROM public.profiles WHERE id = auth.uid();
    
    IF _executing_role IS NULL OR _executing_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Admins only';
    END IF;

    -- Hash new password
    encrypted_pw := crypt(new_password, gen_salt('bf'));

    UPDATE auth.users
    SET encrypted_password = encrypted_pw, updated_at = NOW()
    WHERE id = target_user_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_user_details_by_admin(target_user_id uuid, new_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    _executing_role app_role;
BEGIN
    SELECT role INTO _executing_role FROM public.profiles WHERE id = auth.uid();
    
    IF _executing_role IS NULL OR _executing_role != 'admin' THEN
        RAISE EXCEPTION 'Access Denied: Admins only';
    END IF;

    UPDATE public.profiles
    SET full_name = new_name, updated_at = NOW()
    WHERE id = target_user_id;

    -- Also update auth.users metadata if we want to keep them in sync
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
        COALESCE(raw_user_meta_data, '{}'::jsonb),
        '{full_name}',
        to_jsonb(new_name)
    )
    WHERE id = target_user_id;
END;
$function$
;
COMMIT;
