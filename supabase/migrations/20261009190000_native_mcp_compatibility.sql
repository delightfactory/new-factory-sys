-- Local review only. Apply after the four MCP migrations, before the new UI.
-- Historical native operations retain the original functions and recorded cost;
-- missing cost snapshots are never reconstructed from today's valuation.
-- Historical order cancellation retains the original current-recipe semantics.
CREATE FUNCTION factory_private.native_role(p_action text) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF p_action ~ '^(create|update|edit)_(raw_material|packaging_material|semi_finished_product|finished_product|bundle)$'
   OR p_action='adjust_inventory' OR p_action ~ '^(create|start|record|reconcile|cancel)_stocktake$' THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','inventory_officer']);
 ELSIF p_action ~ '^(create|start|complete|cancel)_(production|packaging|bundle_assembly)_order$'
   OR p_action IN ('fulfill_packaging_order','complete_packaging_order_allow_shortage') THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
 ELSIF p_action ~ '^(create|post|void)_(sales|purchase)_(invoice|return)$'
   OR p_action ~ '^(create|update)_(party|treasury|financial_category)$'
   OR p_action IN ('record_financial_transaction','transfer_treasury','delete_financial_transaction') THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
 ELSIF p_action='rename_user' THEN PERFORM factory_private.require_role(ARRAY['admin']);
 ELSE RAISE EXCEPTION 'MCP_TOOL_UNKNOWN'; END IF;
END $$;

CREATE FUNCTION factory_private.native_identity() RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
  OR auth.jwt()->>'aud' IS DISTINCT FROM 'authenticated'
  OR auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'MCP_NATIVE_SESSION_REQUIRED'; END IF;
END $$;

CREATE FUNCTION factory_private.native_historical_reversal(p_action text,p_id bigint,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE tab text; legacy text; header jsonb; expected text; response jsonb;
BEGIN
 SELECT v.t,v.f,v.s INTO tab,legacy,expected FROM (VALUES
  ('void_sales_invoice','sales_invoices','legacy_void_sales_invoice','posted'),
  ('void_purchase_invoice','purchase_invoices','legacy_void_purchase_invoice','posted'),
  ('void_sales_return','sales_returns','legacy_void_sales_return','posted'),
  ('void_purchase_return','purchase_returns','legacy_void_purchase_return','posted'),
  ('cancel_production_order','production_orders','legacy_cancel_production_order_atomic','completed'),
  ('cancel_packaging_order','packaging_orders','legacy_cancel_packaging_order_atomic','completed')
 )v(a,t,f,s) WHERE v.a=p_action;
 IF tab IS NULL THEN RETURN NULL; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',tab) INTO header USING p_id;
 IF header IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 IF header->>'status'<>expected OR EXISTS(SELECT 1 FROM factory_private.execution_effects
  WHERE kind=CASE WHEN tab='production_orders' THEN 'production' WHEN tab='packaging_orders' THEN 'packaging' ELSE tab END
   AND record_id=p_id AND reversed_at IS NULL) THEN RETURN NULL; END IF;
 IF tab IN ('sales_invoices','purchase_invoices') THEN
  PERFORM factory_private.native_reverse_settlements(CASE tab WHEN 'sales_invoices' THEN 'sales' ELSE 'purchase' END,p_id,p_key);
 END IF;
 -- Call only the fixed original entry points. Their legacy valuation semantics
 -- stay intact; no execution_effects row or retrospective unit cost is invented.
 EXECUTE format('SELECT factory_private.%I($1)',legacy) USING p_id;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO response USING p_id;
 IF response->>'status' IS DISTINCT FROM (CASE WHEN expected='posted' THEN 'void' ELSE 'cancelled' END) THEN
  RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
 RETURN response||jsonb_build_object('kind',tab,'number',coalesce(response->>'invoice_number',response->>'return_number',response->>'code'),'legacy_valuation',true);
END $$;

CREATE FUNCTION factory_private.native_complete_order(p_kind text,p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE header jsonb; beforestock jsonb; effects jsonb; negatives jsonb; tab text; planned record;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('production','packaging') THEN RAISE EXCEPTION 'MCP_ACTION_FORBIDDEN'; END IF;
 tab:=p_kind||'_orders';
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',tab) INTO header USING p_id;
 IF header IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 FOR planned IN SELECT * FROM factory_private.order_plan(p_kind,p_id) ORDER BY item_type,item_id LOOP
  EXECUTE format('SELECT id FROM public.%I WHERE id=$1 FOR UPDATE',factory_private.stock_table(planned.item_type)) USING planned.item_id;
 END LOOP;
 IF header->>'status'<>'completed' THEN
  IF header->>'status' NOT IN ('pending','inProgress') THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
  beforestock:=factory_private.snapshot_order_stock(p_kind,p_id);
  -- Both original native completion paths allow deficient inputs. Preserve
  -- their exact cost equations; OAuth/MCP completion keeps strict stock checks.
  IF p_kind='production' THEN PERFORM factory_private.legacy_complete_production_order_atomic(p_id);
  ELSE PERFORM factory_private.legacy_complete_packaging_order_atomic(p_id); END IF;
  SELECT jsonb_agg(e||jsonb_build_object('after_quantity',s.quantity,'after_unit_cost',s.unit_cost)) INTO effects
   FROM jsonb_array_elements(beforestock)e JOIN factory_private.stock_current s
    ON s.item_type=e->>'item_type' AND s.id=(e->>'item_id')::bigint;
  INSERT INTO factory_private.execution_effects(kind,record_id,effects) VALUES(p_kind,p_id,coalesce(effects,'[]'));
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO header USING p_id;
  IF header->>'status' IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_type',s.item_type,'item_id',s.id,'name',s.name,'unit',s.unit,'quantity',s.quantity) ORDER BY s.item_type,s.id),'[]')
  INTO negatives FROM factory_private.order_plan(p_kind,p_id) p JOIN factory_private.stock_current s
   ON s.item_type=p.item_type AND s.id=p.item_id WHERE s.quantity<0;
 RETURN header||jsonb_build_object('kind',p_kind,'number',header->>'code','shortage_accepted',true,'negative_stock',negatives);
END $$;

CREATE FUNCTION public.factory_native_write(p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE receipt factory_private.write_receipts; response jsonb; record jsonb; tab text; requested_cost numeric;
BEGIN
 PERFORM factory_private.native_identity();
 PERFORM factory_private.native_role(p_action);
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 PERFORM factory_private.lock_stock();
 INSERT INTO factory_private.write_receipts(user_id,request_id,client_id,action,payload)
  VALUES(auth.uid(),p_request_id,NULL,p_action,p_payload) ON CONFLICT DO NOTHING;
 SELECT * INTO receipt FROM factory_private.write_receipts WHERE user_id=auth.uid() AND request_id=p_request_id FOR UPDATE;
 IF receipt.action IS DISTINCT FROM p_action OR receipt.payload IS DISTINCT FROM p_payload OR receipt.client_id IS NOT NULL
  THEN RAISE EXCEPTION 'MCP_REQUEST_CONFLICT'; END IF;
 IF receipt.result IS NOT NULL THEN RETURN receipt.result; END IF;
 IF p_action ~ '^(void_(sales|purchase)_(invoice|return)|cancel_(production|packaging)_order)$' THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id']);
  record:=factory_private.native_historical_reversal(p_action,(p_payload->>'id')::bigint,p_request_id);
 END IF;
 IF p_action IN ('complete_production_order','complete_packaging_order_allow_shortage') THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id']);
  record:=factory_private.native_complete_order(CASE p_action WHEN 'complete_production_order' THEN 'production' ELSE 'packaging' END,(p_payload->>'id')::bigint);
 END IF;
 IF p_action='post_purchase_return' THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id']);
  record:=factory_private.native_transition_commercial(p_action,(p_payload->>'id')::bigint,p_request_id);
 END IF;
 IF p_action='delete_financial_transaction' THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id','pair_id']);
  record:=factory_private.native_delete_finance(p_payload);
 END IF;
 IF record IS NULL THEN
  response:=public.factory_write(p_action,p_payload,p_request_id);
  IF p_action IN ('edit_semi_finished_product','edit_finished_product') AND p_payload ? 'unit_cost' THEN
   IF jsonb_typeof(p_payload->'unit_cost') IS DISTINCT FROM 'number' OR (p_payload->>'unit_cost')::numeric NOT BETWEEN 0 AND 1e12
    THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   requested_cost:=(p_payload->>'unit_cost')::numeric;
   tab:=CASE p_action WHEN 'edit_semi_finished_product' THEN 'semi_finished_products' ELSE 'finished_products' END;
   -- Explicit native valuation edits are a real existing form capability.
   -- Apply the submitted value in the same transaction as the recipe/quantity.
   EXECUTE format('UPDATE public.%I SET unit_cost=$1,updated_at=now() WHERE id=$2 RETURNING to_jsonb(%I.*)',tab,tab)
    INTO record USING requested_cost,(p_payload->>'id')::bigint;
   response:=jsonb_set(response,'{record,record}',record);
  END IF;
 ELSE response:=jsonb_build_object('request_id',p_request_id,'record',record);
 END IF;
 UPDATE factory_private.write_receipts SET result=response WHERE user_id=auth.uid() AND request_id=p_request_id;
 RETURN response;
END $$;

REVOKE ALL ON FUNCTION factory_private.native_role(text),factory_private.native_identity(),factory_private.native_historical_reversal(text,bigint,uuid),factory_private.native_complete_order(text,bigint) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
REVOKE ALL ON FUNCTION public.factory_native_write(text,jsonb,uuid) FROM PUBLIC,anon,factory_mcp_gateway;
GRANT EXECUTE ON FUNCTION public.factory_native_write(text,jsonb,uuid) TO authenticated;

CREATE FUNCTION factory_private.native_transfer_pair(p_original financial_transactions,p_other financial_transactions) RETURNS boolean
LANGUAGE sql SET search_path=public,pg_temp AS $$
 SELECT p_original.id<>p_other.id AND p_original.amount=p_other.amount AND p_original.treasury_id<>p_other.treasury_id
  AND p_original.party_id IS NULL AND p_other.party_id IS NULL AND p_original.invoice_id IS NULL AND p_other.invoice_id IS NULL
  AND ((p_original.category='transfer_out' AND p_other.category='transfer_in') OR (p_original.category='transfer_in' AND p_other.category='transfer_out'))
  AND ((p_original.reference_type='MCP' AND p_other.reference_type='MCP' AND p_original.reference_id=p_other.reference_id)
   OR (p_original.reference_type IS NULL AND p_other.reference_type IS NULL
    AND substring(p_original.description FROM 'Treasury #([0-9]+):')=p_other.treasury_id::text
    AND substring(p_other.description FROM 'Treasury #([0-9]+):')=p_original.treasury_id::text
    AND substring(p_original.description FROM ': (.*)$') IS NOT NULL
    AND substring(p_original.description FROM ': (.*)$')=substring(p_other.description FROM ': (.*)$')))
$$;

CREATE FUNCTION factory_private.native_undo_finance(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE original financial_transactions; invoice_kind text; invoice_id bigint; invoice jsonb; delta numeric;
BEGIN
 SELECT * INTO original FROM financial_transactions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 IF original.reference_type='MCP_REVERSAL' OR original.category IN ('sales_void_refund','purchase_void_refund')
  OR EXISTS(SELECT 1 FROM financial_transactions WHERE reference_type='MCP_REVERSAL' AND reference_id=p_id::text)
  THEN RAISE EXCEPTION 'MCP_FINANCIAL_ALREADY_REVERSED'; END IF;
 IF original.amount<=0 OR original.transaction_type NOT IN ('income','expense','transfer') THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 invoice_kind:=original.invoice_type; invoice_id:=original.invoice_id;
 IF invoice_id IS NULL AND original.reference_type IN ('sales_invoice','purchase_invoice')
  AND original.category IN ('sales_payment','purchase_payment') THEN
  invoice_kind:=CASE original.reference_type WHEN 'sales_invoice' THEN 'sales' ELSE 'purchase' END;
  invoice_id:=original.reference_id::bigint;
 END IF;
 IF invoice_id IS NOT NULL THEN
  IF invoice_kind IS NULL OR invoice_kind NOT IN ('sales','purchase') THEN RAISE EXCEPTION 'MCP_INVOICE_LINK_INVALID'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',invoice_kind||'_invoices') INTO invoice USING invoice_id;
  IF invoice IS NULL OR invoice->>'status'<>'posted' THEN RAISE EXCEPTION 'MCP_INVOICE_LINK_INVALID'; END IF;
  IF original.party_id IS NOT NULL AND original.party_id::text IS DISTINCT FROM invoice->>(CASE invoice_kind WHEN 'sales' THEN 'customer_id' ELSE 'supplier_id' END)
   THEN RAISE EXCEPTION 'MCP_INVOICE_LINK_INVALID'; END IF;
  delta:=CASE WHEN (invoice_kind='sales' AND original.transaction_type='income') OR (invoice_kind='purchase' AND original.transaction_type='expense') THEN -original.amount ELSE original.amount END;
  IF (invoice->>'paid_amount')::numeric+delta NOT BETWEEN 0 AND (invoice->>'total_amount')::numeric
   THEN RAISE EXCEPTION 'MCP_SETTLEMENT_AMOUNT_INVALID'; END IF;
  EXECUTE format('UPDATE public.%I SET paid_amount=paid_amount+$1 WHERE id=$2',invoice_kind||'_invoices') USING delta,invoice_id;
 END IF;
 PERFORM 1 FROM treasuries WHERE id=original.treasury_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MCP_TREASURY_INVALID'; END IF;
 delta:=CASE WHEN original.transaction_type='expense' OR original.category='transfer_out' THEN original.amount ELSE -original.amount END;
 IF (SELECT balance FROM treasuries WHERE id=original.treasury_id)+delta<0 THEN RAISE EXCEPTION 'MCP_TREASURY_INSUFFICIENT'; END IF;
 UPDATE treasuries SET balance=balance+delta,updated_at=now() WHERE id=original.treasury_id;
 IF original.party_id IS NOT NULL THEN
  UPDATE parties SET balance=balance+CASE WHEN original.transaction_type='expense' THEN -original.amount ELSE original.amount END WHERE id=original.party_id;
 END IF;
 RETURN to_jsonb(original);
END $$;

CREATE FUNCTION factory_private.native_reverse_settlements(p_kind text,p_id bigint,p_key uuid) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE settlement financial_transactions;
BEGIN
 PERFORM 1 FROM treasuries ORDER BY id FOR UPDATE;
 FOR settlement IN SELECT * FROM financial_transactions WHERE invoice_id=p_id AND invoice_type=p_kind
  AND coalesce(reference_type,'')<>'MCP_REVERSAL' ORDER BY id DESC FOR UPDATE LOOP
  IF NOT EXISTS(SELECT 1 FROM financial_transactions WHERE reference_type='MCP_REVERSAL' AND reference_id=settlement.id::text) THEN
   PERFORM factory_private.native_undo_finance(settlement.id);
   INSERT INTO financial_transactions(treasury_id,party_id,amount,transaction_type,category,description,transaction_date,invoice_id,invoice_type,reference_type,reference_id)
    VALUES(settlement.treasury_id,settlement.party_id,settlement.amount,CASE settlement.transaction_type WHEN 'income' THEN 'expense' ELSE 'income' END,
     'reversal_'||settlement.category,'Invoice cancellation settlement reversal',current_date,p_id,p_kind,'MCP_REVERSAL',settlement.id::text);
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION factory_private.native_delete_finance(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE original financial_transactions; counterpart financial_transactions; evidence jsonb; other_evidence jsonb;
BEGIN
 PERFORM 1 FROM treasuries ORDER BY id FOR UPDATE;
 PERFORM 1 FROM financial_transactions WHERE id IN ((p_payload->>'id')::bigint,(p_payload->>'pair_id')::bigint) ORDER BY id FOR UPDATE;
 SELECT * INTO original FROM financial_transactions WHERE id=(p_payload->>'id')::bigint;
 IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 IF original.category IN ('transfer_out','transfer_in') OR original.transaction_type='transfer' THEN
  SELECT * INTO counterpart FROM financial_transactions WHERE id=(p_payload->>'pair_id')::bigint;
  IF NOT FOUND OR NOT coalesce(factory_private.native_transfer_pair(original,counterpart),false) THEN RAISE EXCEPTION 'MCP_TRANSFER_PAIR_REQUIRED'; END IF;
  other_evidence:=factory_private.native_undo_finance(counterpart.id);
 ELSIF p_payload ? 'pair_id' THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 evidence:=factory_private.native_undo_finance(original.id);
 DELETE FROM financial_transactions WHERE id IN (original.id,counterpart.id);
 -- Receipt + the existing audit trigger preserve original rows; adding a second
 -- reversing ledger row after deletion would double-count the ledger correction.
 RETURN jsonb_build_object('kind','financial_transaction','id',original.id,'status','deleted','original',evidence,'counterpart',other_evidence);
END $$;

CREATE FUNCTION public.factory_native_financial_reversal_plan(p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE original financial_transactions; candidates jsonb;
BEGIN
 PERFORM factory_private.native_identity();
 PERFORM factory_private.native_role('delete_financial_transaction');
 SELECT * INTO original FROM financial_transactions WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'treasury_name',r.name,'amount',t.amount,'description',t.description,'date',t.transaction_date) ORDER BY t.id),'[]') INTO candidates
  FROM financial_transactions t JOIN treasuries r ON r.id=t.treasury_id WHERE factory_private.native_transfer_pair(original,t);
 RETURN jsonb_build_object('id',original.id,'amount',original.amount,'requires_pair',original.category IN ('transfer_out','transfer_in') OR original.transaction_type='transfer','candidates',candidates);
END $$;
REVOKE ALL ON FUNCTION factory_private.native_transfer_pair(financial_transactions,financial_transactions),factory_private.native_undo_finance(bigint),factory_private.native_reverse_settlements(text,bigint,uuid),factory_private.native_delete_finance(jsonb) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
REVOKE ALL ON FUNCTION public.factory_native_financial_reversal_plan(bigint) FROM PUBLIC,anon,factory_mcp_gateway;
GRANT EXECUTE ON FUNCTION public.factory_native_financial_reversal_plan(bigint) TO authenticated;

-- Cached native clients keep their exact RPC names/parameters/return types.
-- Only the internal engines bypass these wrappers, preventing recursion.
CREATE TABLE factory_private.native_rpc_originals (
 identity text PRIMARY KEY, definition text NOT NULL, owner_name text NOT NULL, privileges jsonb NOT NULL
);
ALTER TABLE factory_private.native_rpc_originals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON factory_private.native_rpc_originals FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
DO $wrap$
DECLARE operation record; original_oid oid; original_type text; definition text; engine record;
BEGIN
 FOR operation IN SELECT * FROM (VALUES
  ('complete_production_order_atomic','p_order_id','complete_production_order'),
  ('complete_packaging_order_atomic','p_order_id','complete_packaging_order_allow_shortage'),
  ('cancel_production_order_atomic','p_order_id','cancel_production_order'),
  ('cancel_packaging_order_atomic','p_order_id','cancel_packaging_order'),
  ('process_sales_invoice','p_invoice_id','post_sales_invoice'),
  ('process_purchase_invoice','p_invoice_id','post_purchase_invoice'),
  ('process_sales_return','p_return_id','post_sales_return'),
  ('process_purchase_return','p_return_id','post_purchase_return'),
  ('void_sales_invoice','p_invoice_id','void_sales_invoice'),
  ('void_purchase_invoice','p_invoice_id','void_purchase_invoice'),
  ('void_sales_return','p_return_id','void_sales_return'),
  ('void_purchase_return','p_return_id','void_purchase_return')
 )v(name,argument,action) LOOP
  original_oid:=to_regprocedure(format('public.%I(bigint)',operation.name));
  IF original_oid IS NULL THEN RAISE EXCEPTION 'MCP_NATIVE_RPC_MISSING: %',operation.name; END IF;
  SELECT pg_get_function_result(original_oid) INTO original_type;
  IF original_type NOT IN ('void','jsonb') THEN RAISE EXCEPTION 'MCP_NATIVE_RPC_TYPE_CHANGED: %',operation.name; END IF;
  INSERT INTO factory_private.native_rpc_originals
   SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),
    coalesce((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable))
     FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]') FROM pg_proc p WHERE p.oid=original_oid;
  EXECUTE format('ALTER FUNCTION public.%I(bigint) SET SCHEMA factory_private',operation.name);
  EXECUTE format('ALTER FUNCTION factory_private.%I(bigint) RENAME TO %I',operation.name,'legacy_'||operation.name);
  EXECUTE format('REVOKE ALL ON FUNCTION factory_private.%I(bigint) FROM PUBLIC,anon,authenticated,factory_mcp_gateway','legacy_'||operation.name);
  EXECUTE format('CREATE FUNCTION public.%I(%I bigint) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $native$ DECLARE response jsonb; BEGIN response:=public.factory_native_write(%L,jsonb_build_object(''id'',%I),gen_random_uuid()); %s END $native$',
   operation.name,operation.argument,original_type,operation.action,operation.argument,
   CASE WHEN original_type='void' THEN 'RETURN;' ELSE 'RETURN jsonb_build_object(''success'',true,''record'',response->''record'');' END);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(bigint) FROM PUBLIC,anon,factory_mcp_gateway',operation.name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(bigint) TO authenticated',operation.name);
 END LOOP;
 FOR engine IN SELECT oid FROM pg_proc WHERE oid IN (
  'factory_private.foundation_write(text,jsonb,uuid)'::regprocedure,
  'factory_private.transition_commercial(text,bigint,uuid)'::regprocedure,
  'factory_private.transition_order(text,bigint)'::regprocedure) LOOP
  definition:=pg_get_functiondef(engine.oid);
  FOR operation IN SELECT name FROM (VALUES ('complete_production_order_atomic'),('complete_packaging_order_atomic'),
   ('process_sales_invoice'),('process_purchase_invoice'),('process_sales_return'),('process_purchase_return'),
   ('void_sales_invoice'),('void_purchase_invoice'),('void_sales_return'),('void_purchase_return'))v(name) LOOP
   definition:=replace(definition,'public.'||operation.name||'(','factory_private.legacy_'||operation.name||'(');
   definition:=regexp_replace(definition,'(^|[^[:alnum:]_.])'||operation.name||'\(', '\1factory_private.legacy_'||operation.name||'(', 'g');
  END LOOP;
  EXECUTE definition;
 END LOOP;
END $wrap$;

-- Historical purchase-return implementations differ in stock policy. Native
-- posting must retain the saved implementation's decision, including any
-- original sufficiency check, while MCP retains its explicit stricter guard.
-- Clone the shared engine only after its references point at saved originals;
-- all locks, validation, cost snapshots, finance and idempotency remain shared.
DO $native_return$
DECLARE definition text; guard text:='IF ret AND ((posting AND NOT sale) OR (NOT posting AND sale)) THEN';
BEGIN
 definition:=pg_get_functiondef('factory_private.transition_commercial(text,bigint,uuid)'::regprocedure);
 IF position(guard IN definition)=0 THEN RAISE EXCEPTION 'MCP_NATIVE_COMPATIBILITY_SOURCE_MISMATCH'; END IF;
 definition:=replace(definition,'factory_private.transition_commercial(', 'factory_private.native_transition_commercial(');
 definition:=replace(definition,guard,'IF ret AND NOT posting AND sale THEN');
 EXECUTE definition;
END $native_return$;
REVOKE ALL ON FUNCTION factory_private.native_transition_commercial(text,bigint,uuid) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

-- Old cached finance code deletes/inserts a row and adjusts cash in another
-- request. Reject that statement before any row/cash effect; a refresh restores
-- the complete native capability through factory_native_write. The existing
-- x-client-info header is already supported by Auth/Edge CORS.
CREATE FUNCTION factory_private.require_current_financial_client() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF current_user='authenticated' THEN
  PERFORM factory_private.native_identity();
  PERFORM factory_private.native_role('delete_financial_transaction');
  IF coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-client-info'
   IS DISTINCT FROM 'factory-native-compat/1' THEN
   RAISE EXCEPTION 'حدّث صفحة التطبيق قبل تعديل الحركات المالية. لم يتغير أي رصيد.';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER native_financial_client BEFORE INSERT OR DELETE OR UPDATE ON public.financial_transactions
 FOR EACH STATEMENT EXECUTE FUNCTION factory_private.require_current_financial_client();
-- The invoker trigger must retain the invoking database role. These two fixed
-- identity/role guards are read-only; neither accepts SQL or accesses business rows.
GRANT EXECUTE ON FUNCTION factory_private.native_identity(),factory_private.native_role(text) TO authenticated;
REVOKE ALL ON FUNCTION factory_private.require_current_financial_client() FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
NOTIFY pgrst, 'reload schema';
