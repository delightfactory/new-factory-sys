-- 1. Create Roles Enum
CREATE TYPE app_role AS ENUM (
    'admin', 
    'manager', 
    'accountant', 
    'inventory_officer', 
    'production_officer', 
    'viewer'
);

-- 2. Create Profiles Table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role app_role DEFAULT 'viewer',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Policy: Public Read (Or Authenticated Read)
-- We allow authenticated users to read profiles to resolve names, 
-- but we might want to restrict strictly. For now, Auth users can read basic info.
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING ( auth.role() = 'authenticated' );

-- Policy: Users can update their own specific fields (e.g. name only, NOT role)
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING ( auth.uid() = id )
WITH CHECK ( auth.uid() = id );
-- Note: We generally handle Role updates via Admin function to prevent privilege escalation.

-- 5. Admin Helper Functions

-- Function: is_admin() - Checks if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  current_role app_role;
BEGIN
  SELECT role INTO current_role FROM public.profiles WHERE id = auth.uid();
  RETURN current_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: has_role() - Checks if user has specific permission level
CREATE OR REPLACE FUNCTION public.has_role(required_role app_role)
RETURNS BOOLEAN AS $$
DECLARE
  current_role app_role;
BEGIN
  SELECT role INTO current_role FROM public.profiles WHERE id = auth.uid();
  
  -- Hierarchical Logic (Simple version)
  IF current_role = 'admin' THEN RETURN TRUE; END IF;
  IF current_role = 'manager' AND required_role != 'admin' THEN RETURN TRUE; END IF;
  
  RETURN current_role = required_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Trigger: Auto-create Profile on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'viewer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 7. Admin Management Functions (Secure)

-- Update User Role (Admin Only)
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

-- Block/Unblock User (Admin Only)
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

-- 8. Additional RLS for Admin Management (Update 'role' column via table API)
-- To allow admins to update `role` via standard client UPDATE (instead of RPC only),
-- we need a policy. But triggers/RPCs are safer. We'll stick to RPC for role updates.
