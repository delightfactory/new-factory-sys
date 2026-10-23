-- CANDIDATE DEVELOPMENT FIX. Not applied to production.
-- Admit the existing UI count command to its existing inventory-role branch.
-- Preserve the function owner, ACL, other action checks and all stock logic.
DO $patch$
DECLARE
  definition text := pg_get_functiondef('factory_private.native_role(text)'::regprocedure);
  original text := $old$OR p_action='adjust_inventory' OR p_action ~ '^(create|start|record|reconcile|cancel)_stocktake$'$old$;
  corrected text := $new$OR p_action IN ('adjust_inventory','record_stocktake_counts') OR p_action ~ '^(create|start|record|reconcile|cancel)_stocktake$'$new$;
BEGIN
  IF position(corrected IN definition)>0 THEN RETURN; END IF;
  IF md5(definition) <> 'dcbae725457cb77b2f4ec41781ccc90b'
     OR position(original IN definition)=0 THEN
    RAISE EXCEPTION 'FACTORY_NATIVE_ROLE_BASELINE_CHANGED';
  END IF;
  EXECUTE replace(definition, original, corrected);
END
$patch$;
