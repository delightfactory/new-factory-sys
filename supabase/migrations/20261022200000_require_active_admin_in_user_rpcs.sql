-- LOCAL CANDIDATE ONLY. Keep active-admin behavior; deny stopped profiles.
DO $candidate$
DECLARE signature text; original text;
BEGIN
    FOR signature,original IN SELECT *FROM(VALUES
        ('public.create_user_by_admin(text,text,text,public.app_role)','b467642941ea0a20c33d73dc5302bd1f'),
        ('public.delete_user_by_admin(uuid)','ed251c27b769a25836d2bacfeeccbc76'),
        ('public.reset_user_password_by_admin(uuid,text)','01bb13c92032c3d4891e7475aa99a38a'),
        ('public.update_user_details_by_admin(uuid,text)','62b763fddb38fd2287b228e99e19dddc')
    )expected(signature,hash)LOOP
        IF to_regprocedure(signature)IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>original THEN RAISE EXCEPTION 'ACTIVE_ADMIN_DIRECT_BASELINE_CHANGED';END IF;
    END LOOP;
    FOREACH signature IN ARRAY ARRAY[
        'public.create_user_by_admin(text,text,text,public.app_role)','public.delete_user_by_admin(uuid)',
        'public.reset_user_password_by_admin(uuid,text)','public.update_user_details_by_admin(uuid,text)'
    ]LOOP
        original:=pg_get_functiondef(to_regprocedure(signature));
        IF strpos(original,'WHERE id = auth.uid();')=0 THEN RAISE EXCEPTION 'ACTIVE_ADMIN_DIRECT_SELECTION_MISSING';END IF;
        EXECUTE replace(original,'WHERE id = auth.uid();','WHERE id = auth.uid() AND is_active;');
    END LOOP;
END;
$candidate$;
