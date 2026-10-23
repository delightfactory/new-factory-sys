-- LOCAL CANDIDATE ONLY. Deny missing/inactive actors without NULL booleans.
-- Keep the active-user role hierarchy, signatures, owner and grants unchanged.
DO $candidate$
DECLARE function_name text; signature text; expected_md5 text; definition text; updated_definition text;
BEGIN
    FOREACH function_name IN ARRAY ARRAY['is_admin','has_role'] LOOP
        signature:=CASE function_name WHEN 'is_admin'THEN'public.is_admin()'ELSE'public.has_role(public.app_role)'END;
        expected_md5:=CASE function_name WHEN'is_admin'THEN'7fd523cf26ecef8786ce546952233e00'ELSE'36163c079afac50d67d74f0f4f4d54a9'END;
        IF to_regprocedure(signature)IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>expected_md5 THEN
            RAISE EXCEPTION 'BOOLEAN_ROLE_GUARD_BASELINE_CHANGED';
        END IF;
    END LOOP;
    FOREACH function_name IN ARRAY ARRAY['is_admin','has_role'] LOOP
        signature:=CASE function_name WHEN'is_admin'THEN'public.is_admin()'ELSE'public.has_role(public.app_role)'END;
        definition:=pg_get_functiondef(to_regprocedure(signature));
        updated_definition:=replace(definition,'WHERE id = auth.uid();','WHERE id = auth.uid() AND is_active;');
        updated_definition:=replace(updated_definition,
            CASE function_name WHEN'is_admin'THEN'RETURN _curr_role = ''admin'';'ELSE'RETURN _curr_role = required_role;'END,
            CASE function_name WHEN'is_admin'THEN'RETURN COALESCE(_curr_role = ''admin'', false);'ELSE'RETURN COALESCE(_curr_role = required_role, false);'END);
        IF updated_definition=definition THEN RAISE EXCEPTION 'BOOLEAN_ROLE_GUARD_REPLACEMENT_MISSING';END IF;
        EXECUTE updated_definition;
    END LOOP;
END;
$candidate$;
