-- Fix variable shadowing in is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  _curr_role app_role;
BEGIN
  SELECT role INTO _curr_role FROM public.profiles WHERE id = auth.uid();
  RETURN _curr_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix variable shadowing in has_role()
CREATE OR REPLACE FUNCTION public.has_role(required_role app_role)
RETURNS BOOLEAN AS $$
DECLARE
  _curr_role app_role;
BEGIN
  SELECT role INTO _curr_role FROM public.profiles WHERE id = auth.uid();
  
  -- Hierarchical Logic
  IF _curr_role = 'admin' THEN RETURN TRUE; END IF;
  IF _curr_role = 'manager' AND required_role != 'admin' THEN RETURN TRUE; END IF;
  
  RETURN _curr_role = required_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix variable shadowing in update_user_role
-- Note: internal logic used is_admin(), so just fixing is_admin might be enough, 
-- but if this function also used 'current_role' variable it needs fix.
-- Checking the previous file... it didn't use a variable, just called is_admin().
-- But to be safe and consistent, we re-declare it to ensure it uses the new is_admin version immediately.

CREATE OR REPLACE FUNCTION update_user_role(target_user_id UUID, new_role app_role)
RETURNS VOID AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access Denied: Admins only';
  END IF;

  UPDATE public.profiles
  SET role = new_role, updated_at = NOW()
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix variable shadowing in toggle_user_active
CREATE OR REPLACE FUNCTION toggle_user_active(target_user_id UUID, status BOOLEAN)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access Denied: Admins only';
  END IF;

  UPDATE public.profiles
  SET is_active = status, updated_at = NOW()
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
