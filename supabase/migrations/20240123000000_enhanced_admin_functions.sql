-- Function to Update User Profile Details (Name)
CREATE OR REPLACE FUNCTION public.update_user_details_by_admin(
    target_user_id UUID,
    new_name TEXT
)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to Reset User Password (Admin)
CREATE OR REPLACE FUNCTION public.reset_user_password_by_admin(
    target_user_id UUID,
    new_password TEXT
)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
