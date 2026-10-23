-- Guarded release rollback: restores prior function bodies and retains document-edit audit history.
-- Requires the exact qualified candidate; does not undo edited business data or remove request receipts.
BEGIN;
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.create_commercial(text,jsonb,uuid)'::regprocedure AND md5(pg_get_functiondef(p.oid))='59067fddc35414533a3f7cd5742a319e' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres}' AND p.prosecdef=false AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.document_commercial_totals(jsonb,boolean,boolean)'::regprocedure AND md5(pg_get_functiondef(p.oid))='ff466aedbb1bf874c3f8dd3196051a68' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres}' AND p.prosecdef=false AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.document_edit_content(text,jsonb,jsonb)'::regprocedure AND md5(pg_get_functiondef(p.oid))='95c80780255e236aaad0a902a4a37bf2' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres}' AND p.prosecdef=false AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.document_order_unit_cost(text,bigint)'::regprocedure AND md5(pg_get_functiondef(p.oid))='422c92d7ab9edb1d80cb3a6644e2f0ae' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres}' AND p.prosecdef=false AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.document_snapshot(text,bigint)'::regprocedure AND md5(pg_get_functiondef(p.oid))='edb03257d636cdb5ba877fd45ea01227' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres}' AND p.prosecdef=false AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.edit_document(text,jsonb,uuid)'::regprocedure AND md5(pg_get_functiondef(p.oid))='53f0d291b30966d0802e4f24d33a0727' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres}' AND p.prosecdef=false AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.foundation_write(text,jsonb,uuid)'::regprocedure AND md5(pg_get_functiondef(p.oid))='63a16ce82a2efc1859bc3cca14f8c35d' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' AND p.prosecdef=true AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.native_role(text)'::regprocedure AND md5(pg_get_functiondef(p.oid))='5a1606f0eb968f4486fa49f83e007e2c' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}' AND p.prosecdef=false AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.factory_native_document(text,bigint)'::regprocedure AND md5(pg_get_functiondef(p.oid))='9560b517764964b8e93af9714f002926' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}' AND p.prosecdef=true AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.factory_native_write(text,jsonb,uuid)'::regprocedure AND md5(pg_get_functiondef(p.oid))='08fb9025f3672858c7a31147b65ed972' AND p.proowner::regrole::text='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND p.prosecdef=true AND to_jsonb(p.proconfig) IS NOT DISTINCT FROM '["search_path=public, pg_temp"]'::jsonb) THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_DRIFT'; END IF;
 IF to_regclass('factory_private.document_edits') IS NULL OR to_regclass('factory_private.document_edits_release_archive_20261023') IS NOT NULL THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_AUDIT_CONFLICT'; END IF;
 IF (SELECT md5(jsonb_build_object('owner',c.relowner::regrole::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid))order by a.attnum)from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(jsonb_build_object('definition',pg_get_constraintdef(t.oid,true),'validated',t.convalidated)order by t.contype,t.conname)from pg_constraint t where t.conrelid=c.oid))::text)FROM pg_class c WHERE c.oid='factory_private.document_edits'::regclass) IS DISTINCT FROM '60bfa5fdae66b151a847f5e3cbea4a22' THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLLBACK_AUDIT_DRIFT'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.factory_native_write(p_action text, p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION factory_private.create_commercial(p_action text, p_payload jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE sale boolean:=p_action LIKE '%sales%'; isreturn boolean:=p_action LIKE '%return'; tab text;
 partykey text; party uuid; header jsonb; item jsonb; line jsonb; rec jsonb; total numeric:=0; paid numeric;
 subtotal numeric; q numeric; price numeric; invoice jsonb; already numeric; original numeric;
BEGIN
 tab:=(CASE WHEN sale THEN 'sales' ELSE 'purchase' END)||(CASE WHEN isreturn THEN '_returns' ELSE '_invoices' END);
 partykey:=CASE WHEN sale THEN 'customer_id' ELSE 'supplier_id' END;
 PERFORM factory_private.assert_keys(p_payload,ARRAY['date','notes',partykey,'items','treasury_id','paid_amount','tax_amount','discount_amount','shipping_cost','invoice_number','original_invoice_id']);
 party:=(p_payload->>partykey)::uuid;
 IF NOT EXISTS(SELECT 1 FROM parties WHERE id=party AND type=CASE WHEN sale THEN 'customer' ELSE 'supplier' END) THEN RAISE EXCEPTION 'MCP_PARTY_INVALID'; END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  PERFORM factory_private.assert_keys(item,ARRAY['item_type','item_id','quantity','unit_price']);
  IF factory_private.stock_table(item->>'item_type') IS NULL OR (NOT sale AND item->>'item_type'='bundle') THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  q:=(item->>'quantity')::numeric; price:=(item->>'unit_price')::numeric;
  IF q IS NULL OR price IS NULL OR q<=0 OR q>1e9 OR price<0 OR price>1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM factory_private.stock_current WHERE item_type=item->>'item_type' AND id=(item->>'item_id')::bigint) THEN RAISE EXCEPTION 'MCP_ITEM_INVALID'; END IF;
  total:=total+q*price;
 END LOOP;
 subtotal:=total;
 IF NOT isreturn THEN total:=total+coalesce((p_payload->>'tax_amount')::numeric,0)+coalesce((p_payload->>'shipping_cost')::numeric,0)-coalesce((p_payload->>'discount_amount')::numeric,0); END IF;
 paid:=coalesce((p_payload->>'paid_amount')::numeric,0);
 IF coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR total<0 OR total>1e12 OR paid<0 OR paid>total OR (paid>0 AND (p_payload->>'treasury_id' IS NULL OR NOT EXISTS(SELECT 1 FROM treasuries WHERE id=(p_payload->>'treasury_id')::bigint))) THEN RAISE EXCEPTION 'MCP_TOTAL_INVALID'; END IF;
 IF coalesce((p_payload->>'tax_amount')::numeric,0) NOT BETWEEN 0 AND 1e12 OR coalesce((p_payload->>'shipping_cost')::numeric,0) NOT BETWEEN 0 AND 1e12 OR coalesce((p_payload->>'discount_amount')::numeric,0) NOT BETWEEN 0 AND 1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF isreturn AND p_payload ? 'original_invoice_id' THEN
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',CASE WHEN sale THEN 'sales_invoices' ELSE 'purchase_invoices' END)
   INTO invoice USING (p_payload->>'original_invoice_id')::bigint;
  IF invoice IS NULL OR invoice->>'status'<>'posted' OR invoice->>partykey<>party::text THEN RAISE EXCEPTION 'MCP_ORIGINAL_INVOICE_INVALID'; END IF;
 END IF;
 header:=jsonb_build_object(partykey,party,'status','draft','total_amount',total,'notes',p_payload->>'notes');
 IF isreturn THEN header:=header||jsonb_build_object('return_date',(p_payload->>'date')::date,'return_number',upper(substr(tab,1,1))||'R-MCP-'||p_key,'original_invoice_id',p_payload->'original_invoice_id');
 ELSE header:=header||jsonb_build_object('transaction_date',(p_payload->>'date')::date,'invoice_number',coalesce(p_payload->>'invoice_number',CASE WHEN sale THEN 'SI' ELSE 'PI' END||'-MCP-'||p_key),
  'paid_amount',paid,'treasury_id',p_payload->'treasury_id','tax_amount',coalesce((p_payload->>'tax_amount')::numeric,0),'discount_amount',coalesce((p_payload->>'discount_amount')::numeric,0),'shipping_cost',coalesce((p_payload->>'shipping_cost')::numeric,0)); END IF;
 EXECUTE format('INSERT INTO public.%I SELECT r.* FROM jsonb_populate_record(NULL::public.%I,$1) r RETURNING to_jsonb(%I.*)',tab,tab,tab) INTO rec USING header||jsonb_build_object('id',nextval(pg_get_serial_sequence(tab,'id')),'created_at',now(),'updated_at',now());
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  line:=jsonb_build_object(CASE WHEN isreturn THEN 'return_id' ELSE 'invoice_id' END,rec->'id','item_type',item->'item_type',
   factory_private.stock_link(item->>'item_type'),item->'item_id','quantity',item->'quantity','unit_price',item->'unit_price','total_price',(item->>'quantity')::numeric*(item->>'unit_price')::numeric);
  EXECUTE format('INSERT INTO public.%I (%I,item_type,%I,quantity,unit_price,total_price) VALUES($1,$2,$3,$4,$5,$6)',
   CASE WHEN isreturn THEN replace(tab,'_returns','_return_items') ELSE replace(tab,'_invoices','_invoice_items') END,
   CASE WHEN isreturn THEN 'return_id' ELSE 'invoice_id' END,factory_private.stock_link(item->>'item_type'))
   USING (rec->>'id')::bigint,item->>'item_type',(item->>'item_id')::bigint,(item->>'quantity')::numeric,(item->>'unit_price')::numeric,(item->>'quantity')::numeric*(item->>'unit_price')::numeric;
 END LOOP;
 RETURN rec||jsonb_build_object('kind',tab,'id',rec->'id','number',coalesce(rec->>'invoice_number',rec->>'return_number'),'status','draft','total_amount',total,'paid_amount',paid,'remaining_amount',total-paid);
END $function$;

CREATE OR REPLACE FUNCTION factory_private.foundation_write(p_action text, p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt factory_private.write_receipts;
  v_item jsonb; v_id bigint; v_code text; v_kind text; v_result jsonb;
  v_quantity numeric; v_price numeric; v_total numeric := 0;
  v_unit_cost numeric; v_batch_size numeric;
  v_tax numeric; v_discount numeric; v_shipping numeric;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  IF p_action IN ('create_sales_invoice','post_sales_invoice') THEN
    PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
    v_kind := 'sales_invoice';
  ELSIF p_action IN ('create_production_order','complete_production_order') THEN
    PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
    v_kind := 'production_order';
  ELSIF p_action IN ('create_packaging_order','complete_packaging_order') THEN
    PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
    v_kind := 'packaging_order';
  ELSE RAISE EXCEPTION 'MCP_TOOL_UNKNOWN'; END IF;
  -- OAuth callers must have resource-specific approved access even via Data API.
  IF auth.jwt()->>'client_id' IS NOT NULL AND
      NOT (factory_private.authorize_mcp()->>'can_write')::boolean THEN
    RAISE EXCEPTION 'MCP_WRITE_FORBIDDEN';
  END IF;
  INSERT INTO factory_private.write_receipts(user_id,request_id,client_id,action,payload)
    VALUES(auth.uid(),p_request_id,auth.jwt()->>'client_id',p_action,p_payload)
    ON CONFLICT DO NOTHING;
  SELECT * INTO v_receipt FROM factory_private.write_receipts
    WHERE user_id = auth.uid() AND request_id = p_request_id FOR UPDATE;
  IF v_receipt.action <> p_action OR v_receipt.payload <> p_payload OR
      v_receipt.client_id IS DISTINCT FROM auth.jwt()->>'client_id' THEN
    RAISE EXCEPTION 'MCP_REQUEST_CONFLICT';
  END IF;
  IF v_receipt.result IS NOT NULL THEN RETURN v_receipt.result; END IF;

  IF p_action LIKE 'create_%' THEN
    IF p_action = 'create_sales_invoice' THEN
      PERFORM factory_private.assert_keys(p_payload,ARRAY['customer_id','date','notes','items','tax_amount','discount_amount','shipping_cost']);
    ELSE
      PERFORM factory_private.assert_keys(p_payload,ARRAY['date','notes','items','code']);
      IF p_payload ? 'code' AND (auth.jwt()->>'client_id' IS NOT NULL OR length(btrim(coalesce(p_payload->>'code',''))) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
    END IF;
    IF coalesce(jsonb_typeof(p_payload->'items'),'') <> 'array' OR
        jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 OR
        coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR
        length(coalesce(p_payload->>'notes','')) > 2000 THEN
      RAISE EXCEPTION 'MCP_INPUT_INVALID';
    END IF;
    IF p_action = 'create_sales_invoice' THEN
      IF NOT EXISTS(SELECT 1 FROM public.parties WHERE id=(p_payload->>'customer_id')::uuid AND type='customer') THEN
        RAISE EXCEPTION 'MCP_CUSTOMER_INVALID';
      END IF;
      v_tax := coalesce((p_payload->>'tax_amount')::numeric,0);
      v_discount := coalesce((p_payload->>'discount_amount')::numeric,0);
      v_shipping := coalesce((p_payload->>'shipping_cost')::numeric,0);
      IF NOT (v_tax BETWEEN 0 AND 1e12 AND v_discount BETWEEN 0 AND 1e12 AND v_shipping BETWEEN 0 AND 1e12) THEN
        RAISE EXCEPTION 'MCP_INPUT_INVALID';
      END IF;
      v_code := 'SI-MCP-' || p_request_id::text;
      INSERT INTO public.sales_invoices(invoice_number,customer_id,transaction_date,notes,status,paid_amount,tax_amount,discount_amount,shipping_cost)
        VALUES(v_code,(p_payload->>'customer_id')::uuid,(p_payload->>'date')::date,p_payload->>'notes','draft',0,v_tax,v_discount,v_shipping)
        RETURNING id INTO v_id;
    ELSIF p_action = 'create_production_order' THEN
      v_code := coalesce(p_payload->>'code','PR-MCP-' || p_request_id::text);
      INSERT INTO public.production_orders(code,date,notes,status,total_cost)
        VALUES(v_code,(p_payload->>'date')::date,p_payload->>'notes','pending',0) RETURNING id INTO v_id;
    ELSE
      v_code := coalesce(p_payload->>'code','PK-MCP-' || p_request_id::text);
      INSERT INTO public.packaging_orders(code,date,notes,status,total_cost)
        VALUES(v_code,(p_payload->>'date')::date,p_payload->>'notes','pending',0) RETURNING id INTO v_id;
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
      v_quantity := (v_item->>'quantity')::numeric;
      IF v_quantity IS NULL OR NOT v_quantity > 0 OR NOT v_quantity <= 1e9 THEN
        RAISE EXCEPTION 'MCP_INPUT_INVALID';
      END IF;
      IF p_action = 'create_production_order' THEN
        PERFORM factory_private.assert_keys(v_item,ARRAY['semi_finished_id','quantity']);
        IF NOT EXISTS(SELECT 1 FROM public.semi_finished_products WHERE id=(v_item->>'semi_finished_id')::bigint) THEN
          RAISE EXCEPTION 'MCP_PRODUCT_INVALID';
        END IF;
        SELECT recipe_batch_size INTO v_batch_size FROM public.semi_finished_products
          WHERE id=(v_item->>'semi_finished_id')::bigint;
        SELECT coalesce(sum(si.quantity*rm.unit_cost),0) / coalesce(nullif(v_batch_size,0),100)
          INTO v_unit_cost FROM public.semi_finished_ingredients si
          JOIN public.raw_materials rm ON rm.id=si.raw_material_id
          WHERE si.semi_finished_id=(v_item->>'semi_finished_id')::bigint;
        INSERT INTO public.production_order_items(production_order_id,semi_finished_id,quantity,unit_cost,total_cost)
          VALUES(v_id,(v_item->>'semi_finished_id')::bigint,v_quantity,round(v_unit_cost,2),round(v_unit_cost*v_quantity,2));
        v_total := v_total + v_unit_cost*v_quantity;
      ELSE
        PERFORM factory_private.assert_keys(v_item,CASE WHEN p_action='create_sales_invoice'
          THEN ARRAY['finished_product_id','quantity','unit_price'] ELSE ARRAY['finished_product_id','quantity'] END);
        IF NOT EXISTS(SELECT 1 FROM public.finished_products WHERE id=(v_item->>'finished_product_id')::bigint) THEN
          RAISE EXCEPTION 'MCP_PRODUCT_INVALID';
        END IF;
        IF p_action = 'create_sales_invoice' THEN
          v_price := (v_item->>'unit_price')::numeric;
          IF v_price IS NULL OR NOT v_price BETWEEN 0 AND 1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
          INSERT INTO public.sales_invoice_items(invoice_id,item_type,finished_product_id,quantity,unit_price,total_price)
            VALUES(v_id,'finished_product',(v_item->>'finished_product_id')::bigint,v_quantity,v_price,v_quantity*v_price);
          v_total := v_total + v_quantity*v_price;
        ELSE
          SELECT coalesce(fp.semi_finished_quantity*sf.unit_cost,0) + coalesce((
            SELECT sum(fpp.quantity*pm.unit_cost) FROM public.finished_product_packaging fpp
            JOIN public.packaging_materials pm ON pm.id=fpp.packaging_material_id
            WHERE fpp.finished_product_id=fp.id
          ),0) INTO v_unit_cost FROM public.finished_products fp
            LEFT JOIN public.semi_finished_products sf ON sf.id=fp.semi_finished_id
            WHERE fp.id=(v_item->>'finished_product_id')::bigint;
          INSERT INTO public.packaging_order_items(packaging_order_id,finished_product_id,quantity,unit_cost,total_cost)
            VALUES(v_id,(v_item->>'finished_product_id')::bigint,v_quantity,round(v_unit_cost,2),round(v_unit_cost*v_quantity,2));
          v_total := v_total + v_unit_cost*v_quantity;
        END IF;
      END IF;
    END LOOP;
    IF p_action = 'create_sales_invoice' THEN
      v_total := v_total + v_tax + v_shipping - v_discount;
      IF NOT v_total BETWEEN 0 AND 1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
      UPDATE public.sales_invoices SET total_amount=v_total WHERE id=v_id;
    ELSIF p_action = 'create_production_order' THEN
      UPDATE public.production_orders SET total_cost=round(v_total,2) WHERE id=v_id;
    ELSE
      UPDATE public.packaging_orders SET total_cost=round(v_total,2) WHERE id=v_id;
    END IF;
  ELSE
    PERFORM factory_private.assert_keys(p_payload,ARRAY['id']);
    v_id := (p_payload->>'id')::bigint;
    IF v_id IS NULL OR v_id <= 0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
    CASE p_action
      WHEN 'post_sales_invoice' THEN PERFORM factory_private.legacy_process_sales_invoice(v_id);
      WHEN 'complete_production_order' THEN PERFORM factory_private.legacy_complete_production_order_atomic(v_id);
      WHEN 'complete_packaging_order' THEN PERFORM factory_private.legacy_complete_packaging_order_atomic(v_id);
    END CASE;
  END IF;
  v_result := jsonb_build_object('request_id',p_request_id,'record',factory_private.operation(v_kind,v_id));
  UPDATE factory_private.write_receipts SET result=v_result WHERE user_id=auth.uid() AND request_id=p_request_id;
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION factory_private.native_role(p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN
 IF p_action ~ '^(create|update|edit)_(raw_material|packaging_material|semi_finished_product|finished_product|bundle)$'
   OR p_action IN ('adjust_inventory','record_stocktake_counts') OR p_action ~ '^(create|start|record|reconcile|cancel)_stocktake$' THEN
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
END $function$;

DROP FUNCTION public.factory_native_document(text,bigint);
DROP FUNCTION factory_private.edit_document(text,jsonb,uuid);
DROP FUNCTION factory_private.document_snapshot(text,bigint);
DROP FUNCTION factory_private.document_edit_content(text,jsonb,jsonb);
DROP FUNCTION factory_private.document_commercial_totals(jsonb,boolean,boolean);
DROP FUNCTION factory_private.document_order_unit_cost(text,bigint);
ALTER TABLE factory_private.document_edits RENAME TO document_edits_release_archive_20261023;
NOTIFY pgrst, 'reload schema';
COMMIT;
