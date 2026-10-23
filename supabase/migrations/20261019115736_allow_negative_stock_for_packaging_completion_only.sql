-- Historical production migration recovered through read-only catalog metadata.
-- Already applied remotely. Used to characterize the current isolated baseline;
-- this file does not authorize migration push or reapplication to production.
DO $patch$
DECLARE
  v_fn oid := 'factory_private.transition_order(text,bigint)'::regprocedure::oid;
  v_source text;
  v_before text := 'IF oldqty+planned.delta<0 THEN RAISE EXCEPTION ''MCP_STOCK_INSUFFICIENT''; END IF;';
  v_after  text := 'IF v_kind <> ''packaging'' AND oldqty+planned.delta<0 THEN RAISE EXCEPTION ''MCP_STOCK_INSUFFICIENT''; END IF;';
  v_pos integer;
BEGIN
  SELECT pg_get_functiondef(v_fn) INTO v_source;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'factory_private.transition_order missing';
  END IF;
  v_pos := strpos(v_source, v_before);
  IF v_pos=0 OR strpos(substr(v_source,v_pos+length(v_before)),v_before)<>0 THEN
    RAISE EXCEPTION 'Guard assertion failed: stock check changed or ambiguous';
  END IF;
  IF strpos(v_source,'IF v_kind=''production'' THEN PERFORM factory_private.legacy_complete_production_order_atomic(p_id)')=0
     OR strpos(v_source,'ELSIF v_kind=''packaging'' THEN PERFORM factory_private.legacy_complete_packaging_order_atomic(p_id)')=0 THEN
    RAISE EXCEPTION 'Completion implementation changed; abort safe patch';
  END IF;
  EXECUTE replace(v_source,v_before,v_after);
  IF strpos(pg_get_functiondef(v_fn),v_after)=0 THEN
    RAISE EXCEPTION 'Patch verification failed';
  END IF;
END $patch$;
