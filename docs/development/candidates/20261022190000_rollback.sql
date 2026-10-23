-- LOCAL exact function-definition undo; retains signatures/ACLs/owners.
BEGIN;
CREATE OR REPLACE FUNCTION public.has_role(required_role app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _curr_role app_role;
BEGIN
  SELECT role INTO _curr_role FROM public.profiles WHERE id = auth.uid();
  
  -- Hierarchical Logic
  IF _curr_role = 'admin' THEN RETURN TRUE; END IF;
  IF _curr_role = 'manager' AND required_role != 'admin' THEN RETURN TRUE; END IF;
  
  RETURN _curr_role = required_role;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _curr_role app_role;
BEGIN
  SELECT role INTO _curr_role FROM public.profiles WHERE id = auth.uid();
  RETURN _curr_role = 'admin';
END;
$function$
;
COMMIT;
