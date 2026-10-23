-- Release candidate only: production application requires separate owner approval.
BEGIN;
-- LOCAL DEVELOPMENT CANDIDATE. Not a production migration or release approval.
-- Run in an enclosing transaction after verifying the pinned native baseline.
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('factory_private.native_role(text)'::regprocedure)) <> '30adc9bad406d7bdf18e34f7eb617e24'
 OR md5(pg_get_functiondef('public.factory_native_write(text,jsonb,uuid)'::regprocedure)) <> 'fbb0e84d77fc3cafe1060ed986cdc360'
 OR md5(pg_get_functiondef('factory_private.foundation_write(text,jsonb,uuid)'::regprocedure)) <> '0e723a3dc411c4e8b5f3ea6111e13bcf'
 OR md5(pg_get_functiondef('factory_private.create_commercial(text,jsonb,uuid)'::regprocedure)) <> 'c1bc8f10d69ac74528ac7f8ad9ebf152'
 OR to_regprocedure('factory_private.document_order_unit_cost(text,bigint)') IS NOT NULL
 OR to_regprocedure('factory_private.document_commercial_totals(jsonb,boolean,boolean)') IS NOT NULL
 OR to_regprocedure('factory_private.document_edit_content(text,jsonb,jsonb)') IS NOT NULL
 OR to_regclass('factory_private.document_edits') IS NOT NULL
 OR to_regprocedure('factory_private.document_snapshot(text,bigint)') IS NOT NULL
 OR to_regprocedure('factory_private.edit_document(text,jsonb,uuid)') IS NOT NULL
 OR to_regprocedure('public.factory_native_document(text,bigint)') IS NOT NULL
 THEN RAISE EXCEPTION 'DOCUMENT_EDIT_BASELINE_CHANGED'; END IF;
END $guard$;

-- Shared by the existing create path and the new edit path. Preserve the
-- original unit-cost equations and rounding at their existing call sites.
CREATE FUNCTION factory_private.document_order_unit_cost(p_kind text,p_id bigint)RETURNS numeric
LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
DECLARE amount numeric;batch numeric;
BEGIN
 IF p_kind='production_order' THEN
  SELECT recipe_batch_size INTO batch FROM semi_finished_products WHERE id=p_id;
  SELECT coalesce(sum(si.quantity*rm.unit_cost),0)/coalesce(nullif(batch,0),100)INTO amount
  FROM semi_finished_ingredients si JOIN raw_materials rm ON rm.id=si.raw_material_id WHERE si.semi_finished_id=p_id;
 ELSIF p_kind='packaging_order' THEN
  SELECT coalesce(fp.semi_finished_quantity*sf.unit_cost,0)+coalesce((SELECT sum(fpp.quantity*pm.unit_cost)FROM finished_product_packaging fpp JOIN packaging_materials pm ON pm.id=fpp.packaging_material_id WHERE fpp.finished_product_id=fp.id),0)
  INTO amount FROM finished_products fp LEFT JOIN semi_finished_products sf ON sf.id=fp.semi_finished_id WHERE fp.id=p_id;
 ELSE RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 RETURN amount;
END $function$;

CREATE FUNCTION factory_private.document_commercial_totals(p_payload jsonb,p_sale boolean,p_return boolean)RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
DECLARE partykey text:=CASE WHEN p_sale THEN 'customer_id' ELSE 'supplier_id' END;party uuid;
 item jsonb;q numeric;price numeric;total numeric:=0;subtotal numeric;paid numeric;
BEGIN
 party:=(p_payload->>partykey)::uuid;
 IF NOT EXISTS(SELECT 1 FROM parties WHERE id=party AND type=CASE WHEN p_sale THEN 'customer' ELSE 'supplier' END)THEN RAISE EXCEPTION 'MCP_PARTY_INVALID'; END IF;
 IF jsonb_typeof(p_payload->'items')IS DISTINCT FROM'array' OR jsonb_array_length(p_payload->'items')NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items')LOOP
  PERFORM factory_private.assert_keys(item,ARRAY['item_type','item_id','quantity','unit_price']);
  IF factory_private.stock_table(item->>'item_type')IS NULL OR(NOT p_sale AND item->>'item_type'='bundle')THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  q:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;
  IF q IS NULL OR price IS NULL OR q<=0 OR q>1e9 OR price<0 OR price>1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM factory_private.stock_current WHERE item_type=item->>'item_type' AND id=(item->>'item_id')::bigint)THEN RAISE EXCEPTION 'MCP_ITEM_INVALID'; END IF;
  total:=total+q*price;
 END LOOP;
 subtotal:=total;
 IF NOT p_return THEN total:=total+coalesce((p_payload->>'tax_amount')::numeric,0)+coalesce((p_payload->>'shipping_cost')::numeric,0)-coalesce((p_payload->>'discount_amount')::numeric,0);END IF;
 paid:=coalesce((p_payload->>'paid_amount')::numeric,0);
 IF coalesce(p_payload->>'date','')!~'^\d{4}-\d{2}-\d{2}$' OR total<0 OR total>1e12 OR paid<0 OR paid>total OR(paid>0 AND(p_payload->>'treasury_id'IS NULL OR NOT EXISTS(SELECT 1 FROM treasuries WHERE id=(p_payload->>'treasury_id')::bigint)))THEN RAISE EXCEPTION 'MCP_TOTAL_INVALID';END IF;
 IF coalesce((p_payload->>'tax_amount')::numeric,0)NOT BETWEEN 0 AND 1e12 OR coalesce((p_payload->>'shipping_cost')::numeric,0)NOT BETWEEN 0 AND 1e12 OR coalesce((p_payload->>'discount_amount')::numeric,0)NOT BETWEEN 0 AND 1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID';END IF;
 RETURN jsonb_build_object('party',party,'total',total,'subtotal',subtotal,'paid',paid);
END $function$;

CREATE FUNCTION factory_private.document_edit_content(p_kind text,p_header jsonb,p_items jsonb)RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
DECLARE body jsonb;lines jsonb;isorder boolean:=p_kind IN('production_order','packaging_order');productkey text;
BEGIN
 IF isorder THEN
  productkey:=CASE p_kind WHEN 'production_order' THEN 'semi_finished_id' ELSE 'finished_product_id' END;
  SELECT jsonb_agg(jsonb_build_object(productkey,(item->>productkey)::bigint,'quantity',(item->>'quantity')::numeric)ORDER BY ord)
  INTO lines FROM jsonb_array_elements(p_items)WITH ORDINALITY x(item,ord);
 ELSE
  SELECT jsonb_agg(jsonb_build_object('item_type',item->'item_type','item_id',coalesce((item->>'item_id')::bigint,(item->>factory_private.stock_link(item->>'item_type'))::bigint),'quantity',(item->>'quantity')::numeric,'unit_price',(item->>'unit_price')::numeric)ORDER BY ord)
  INTO lines FROM jsonb_array_elements(p_items)WITH ORDINALITY x(item,ord);
 END IF;
 body:=jsonb_build_object('date',coalesce(p_header->>'date',p_header->>'transaction_date'),'notes',coalesce(p_header->>'notes',''),'items',lines);
 IF NOT isorder THEN
  productkey:=CASE p_kind WHEN 'sales_invoice' THEN 'customer_id' ELSE 'supplier_id' END;
  body:=body||jsonb_build_object(productkey,(p_header->>productkey)::uuid,'treasury_id',(p_header->>'treasury_id')::bigint,
   'paid_amount',coalesce((p_header->>'paid_amount')::numeric,0),'tax_amount',coalesce((p_header->>'tax_amount')::numeric,0),
   'shipping_cost',coalesce((p_header->>'shipping_cost')::numeric,0),'discount_amount',coalesce((p_header->>'discount_amount')::numeric,0));
 END IF;
 RETURN body;
END $function$;

CREATE TABLE factory_private.document_edits (
 user_id uuid NOT NULL, request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('production_order','packaging_order','sales_invoice','purchase_invoice')),
 record_id bigint NOT NULL, reason text,
 before_document jsonb NOT NULL, after_document jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(user_id,request_id) REFERENCES factory_private.write_receipts(user_id,request_id)
);
ALTER TABLE factory_private.document_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON factory_private.document_edits FROM PUBLIC,anon,authenticated,factory_mcp_gateway,factory_mcp_resource;

CREATE FUNCTION factory_private.document_snapshot(p_kind text,p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
DECLARE tab text; child text; link text; body jsonb;
BEGIN
 SELECT v.t,v.c,v.k INTO tab,child,link FROM(VALUES
 ('production_order','production_orders','production_order_items','production_order_id'),
 ('packaging_order','packaging_orders','packaging_order_items','packaging_order_id'),
 ('sales_invoice','sales_invoices','sales_invoice_items','invoice_id'),
 ('purchase_invoice','purchase_invoices','purchase_invoice_items','invoice_id')
 )v(kind,t,c,k) WHERE v.kind=p_kind;
 IF tab IS NULL OR p_id IS NULL OR p_id<=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 -- One statement captures the header and ordered children in the same snapshot.
 EXECUTE format('SELECT jsonb_build_object(''header'',to_jsonb(h),''items'',coalesce((SELECT jsonb_agg(to_jsonb(i)ORDER BY i.id)FROM public.%I i WHERE i.%I=h.id),''[]''::jsonb))FROM public.%I h WHERE h.id=$1',child,link,tab)
 INTO body USING p_id;
 IF body IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 RETURN body||jsonb_build_object('revision',md5(body::text));
END $function$;

CREATE FUNCTION public.factory_native_document(p_kind text,p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
 PERFORM factory_private.native_identity();
 PERFORM factory_private.native_role('edit_'||p_kind);
 RETURN factory_private.document_snapshot(p_kind,p_id);
END $function$;

CREATE FUNCTION factory_private.edit_document(p_action text,p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
DECLARE kind text:=substr(p_action,6); tab text; child text; link text; productkey text; partykey text;
 isorder boolean; sale boolean; target bigint:=(p_payload->>'id')::bigint;
 previous jsonb; saved jsonb; item jsonb; header jsonb; total numeric:=0;
 quantity numeric; price numeric; unitcost numeric; batch numeric;
 tax numeric; shipping numeric; discount numeric; paid numeric; party uuid; treasury bigint;totals jsonb;
BEGIN
 IF p_action NOT IN('edit_production_order','edit_packaging_order','edit_sales_invoice','edit_purchase_invoice')
 THEN RAISE EXCEPTION 'MCP_TOOL_UNKNOWN'; END IF;
 isorder:=kind IN('production_order','packaging_order');sale:=kind='sales_invoice';
 tab:=CASE kind WHEN 'production_order' THEN 'production_orders' WHEN 'packaging_order' THEN 'packaging_orders' WHEN 'sales_invoice' THEN 'sales_invoices' ELSE 'purchase_invoices' END;
 child:=CASE kind WHEN 'production_order' THEN 'production_order_items' WHEN 'packaging_order' THEN 'packaging_order_items' WHEN 'sales_invoice' THEN 'sales_invoice_items' ELSE 'purchase_invoice_items' END;
 link:=CASE kind WHEN 'production_order' THEN 'production_order_id' WHEN 'packaging_order' THEN 'packaging_order_id' ELSE 'invoice_id' END;
 IF isorder THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id','expected_revision','reason','date','notes','items']);
 ELSE
  partykey:=CASE WHEN sale THEN 'customer_id' ELSE 'supplier_id' END;
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id','expected_revision','reason','date','notes','items',partykey,'treasury_id','paid_amount','tax_amount','discount_amount','shipping_cost']);
 END IF;
 IF target IS NULL OR target<=0 OR coalesce(p_payload->>'expected_revision','')!~'^[a-f0-9]{32}$'
 OR coalesce(p_payload->>'date','')!~'^\d{4}-\d{2}-\d{2}$'
 OR length(coalesce(p_payload->>'notes',''))>2000 OR length(coalesce(p_payload->>'reason',''))>2000
 OR jsonb_typeof(p_payload->'items')IS DISTINCT FROM'array'
 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF jsonb_array_length(p_payload->'items')NOT BETWEEN 1 AND (CASE WHEN isorder THEN 100 ELSE 500 END)
 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 -- native_write already owns the stock/receipt locks. Lock header before reading
 -- both its state and its expected content, including all child rows.
 EXECUTE format('SELECT to_jsonb(h)FROM public.%I h WHERE id=$1 FOR UPDATE',tab)INTO header USING target;
 IF header IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 EXECUTE format('SELECT id FROM public.%I WHERE %I=$1 ORDER BY id FOR UPDATE',child,link)USING target;
 IF header->>'status'IS DISTINCT FROM(CASE WHEN isorder THEN 'pending' ELSE 'draft' END)
 OR EXISTS(SELECT 1 FROM factory_private.execution_effects e WHERE e.record_id=target AND e.kind=CASE WHEN isorder THEN split_part(tab,'_',1) ELSE tab END)
 THEN RAISE EXCEPTION 'MCP_DOCUMENT_NOT_EDITABLE'; END IF;
 IF kind='production_order'AND EXISTS(SELECT 1 FROM production_order_consumed_materials WHERE production_order_id=target)
 OR kind='packaging_order'AND EXISTS(SELECT 1 FROM packaging_order_consumed_materials WHERE packaging_order_id=target)
 OR kind='production_order'AND EXISTS(SELECT 1 FROM factory_private.write_receipts WHERE action='fulfill_packaging_order'AND result#>>'{record,production,id}'=target::text)
 OR kind='packaging_order'AND EXISTS(SELECT 1 FROM factory_private.write_receipts WHERE action='fulfill_packaging_order'AND payload->>'id'=target::text AND result IS NOT NULL)
 OR NOT isorder AND EXISTS(SELECT 1 FROM financial_transactions WHERE invoice_id=target AND invoice_type=CASE WHEN sale THEN 'sales' ELSE 'purchase' END)
 OR NOT isorder AND EXISTS(SELECT 1 FROM financial_transactions WHERE reference_type=kind AND reference_id=target::text)
 OR sale AND EXISTS(SELECT 1 FROM sales_returns WHERE original_invoice_id=target)
 OR kind='purchase_invoice'AND EXISTS(SELECT 1 FROM purchase_returns WHERE original_invoice_id=target)
 THEN RAISE EXCEPTION 'MCP_DOCUMENT_LINKED';END IF;
 previous:=factory_private.document_snapshot(kind,target);
 IF previous->>'revision'IS DISTINCT FROM p_payload->>'expected_revision' THEN RAISE EXCEPTION 'MCP_DOCUMENT_STALE'; END IF;
 -- Validate supplied line keys and bounds even for a semantic no-op.
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items')LOOP
  IF isorder THEN
   productkey:=CASE kind WHEN 'production_order' THEN 'semi_finished_id' ELSE 'finished_product_id' END;
   PERFORM factory_private.assert_keys(item,ARRAY[productkey,'quantity']);
   IF (item->>productkey)::bigint IS NULL OR (item->>productkey)::bigint<=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID';END IF;
  ELSE PERFORM factory_private.assert_keys(item,ARRAY['item_type','item_id','quantity','unit_price']);
  END IF;
  IF (item->>'quantity')::numeric IS NULL OR (item->>'quantity')::numeric<=0 OR (item->>'quantity')::numeric>1e9 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID';END IF;
 END LOOP;
 IF NOT isorder THEN PERFORM factory_private.document_commercial_totals(p_payload,sale,false);END IF;
 -- State and full revision are checked before semantic no-op handling.
 IF factory_private.document_edit_content(kind,header,previous->'items')=factory_private.document_edit_content(kind,p_payload,p_payload->'items')THEN
  RETURN previous||jsonb_build_object('kind',kind,'id',target,'number',coalesce(header->>'code',header->>'invoice_number'),'status',header->>'status','changed',false);
 END IF;
 IF NOT isorder THEN
  totals:=factory_private.document_commercial_totals(p_payload,sale,false);
  total:=(totals->>'total')::numeric;
  party:=(p_payload->>partykey)::uuid;treasury:=(p_payload->>'treasury_id')::bigint;
  IF NOT EXISTS(SELECT 1 FROM parties WHERE id=party AND type=CASE WHEN sale THEN 'customer' ELSE 'supplier' END)THEN RAISE EXCEPTION 'MCP_PARTY_INVALID'; END IF;
  tax:=coalesce((p_payload->>'tax_amount')::numeric,0);shipping:=coalesce((p_payload->>'shipping_cost')::numeric,0);
  discount:=coalesce((p_payload->>'discount_amount')::numeric,0);paid:=coalesce((p_payload->>'paid_amount')::numeric,0);
  IF tax NOT BETWEEN 0 AND 1e12 OR shipping NOT BETWEEN 0 AND 1e12 OR discount NOT BETWEEN 0 AND 1e12 OR paid NOT BETWEEN 0 AND 1e12
  OR(paid>0 AND treasury IS NULL) OR(treasury IS NOT NULL AND NOT EXISTS(SELECT 1 FROM treasuries WHERE id=treasury))
  THEN RAISE EXCEPTION 'MCP_TOTAL_INVALID'; END IF;
 END IF;
 -- Replacing only unexecuted child rows is atomic; any validation failure below
 -- rolls back the old rows, header, audit and native receipt together.
 EXECUTE format('DELETE FROM public.%I WHERE %I=$1',child,link)USING target;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items')LOOP
  quantity:=(item->>'quantity')::numeric;
  IF quantity IS NULL OR quantity<=0 OR quantity>1e9 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  IF isorder THEN
   productkey:=CASE kind WHEN 'production_order' THEN 'semi_finished_id' ELSE 'finished_product_id' END;
   PERFORM factory_private.assert_keys(item,ARRAY[productkey,'quantity']);
   IF NOT EXISTS(SELECT 1 FROM factory_private.stock_current WHERE item_type=CASE kind WHEN 'production_order' THEN 'semi_finished' ELSE 'finished_product' END AND id=(item->>productkey)::bigint)
   THEN RAISE EXCEPTION 'MCP_PRODUCT_INVALID'; END IF;
   unitcost:=factory_private.document_order_unit_cost(kind,(item->>productkey)::bigint);
   EXECUTE format('INSERT INTO public.%I(%I,%I,quantity,unit_cost,total_cost)VALUES($1,$2,$3,$4,$5)',child,link,productkey)
   USING target,(item->>productkey)::bigint,quantity,round(unitcost,2),round(unitcost*quantity,2);
   total:=total+unitcost*quantity;
  ELSE
   PERFORM factory_private.assert_keys(item,ARRAY['item_type','item_id','quantity','unit_price']);
   IF factory_private.stock_table(item->>'item_type')IS NULL OR(NOT sale AND item->>'item_type'='bundle')THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   price:=(item->>'unit_price')::numeric;
   IF price IS NULL OR price NOT BETWEEN 0 AND 1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   IF NOT EXISTS(SELECT 1 FROM factory_private.stock_current WHERE item_type=item->>'item_type' AND id=(item->>'item_id')::bigint)THEN RAISE EXCEPTION 'MCP_ITEM_INVALID'; END IF;
   EXECUTE format('INSERT INTO public.%I(invoice_id,item_type,%I,quantity,unit_price,total_price)VALUES($1,$2,$3,$4,$5,$6)',child,factory_private.stock_link(item->>'item_type'))
   USING target,item->>'item_type',(item->>'item_id')::bigint,quantity,price,quantity*price;
  END IF;
 END LOOP;
 IF isorder THEN
  EXECUTE format('UPDATE public.%I SET date=$1,notes=$2,total_cost=$3,updated_at=now()WHERE id=$4',tab)
  USING(p_payload->>'date')::date,p_payload->>'notes',round(total,2),target;
 ELSE
  IF total NOT BETWEEN 0 AND 1e12 OR paid>total THEN RAISE EXCEPTION 'MCP_TOTAL_INVALID'; END IF;
  EXECUTE format('UPDATE public.%I SET %I=$1,transaction_date=$2,notes=$3,total_amount=$4,paid_amount=$5,treasury_id=$6,tax_amount=$7,shipping_cost=$8,discount_amount=$9,updated_at=now()WHERE id=$10',tab,partykey)
  USING party,(p_payload->>'date')::date,p_payload->>'notes',total,paid,treasury,tax,shipping,discount,target;
 END IF;
 saved:=factory_private.document_snapshot(kind,target);
 INSERT INTO factory_private.document_edits(user_id,request_id,kind,record_id,reason,before_document,after_document)
 VALUES(auth.uid(),p_key,kind,target,p_payload->>'reason',previous,saved);
 RETURN saved||jsonb_build_object('kind',kind,'id',target,'number',coalesce(saved->'header'->>'code',saved->'header'->>'invoice_number'),'status',saved->'header'->>'status','changed',true);
END $function$;

REVOKE ALL ON FUNCTION factory_private.document_snapshot(text,bigint),factory_private.edit_document(text,jsonb,uuid)FROM PUBLIC,anon,authenticated,service_role,factory_mcp_gateway,factory_mcp_resource;
REVOKE ALL ON FUNCTION factory_private.document_order_unit_cost(text,bigint),factory_private.document_commercial_totals(jsonb,boolean,boolean),factory_private.document_edit_content(text,jsonb,jsonb)FROM PUBLIC,anon,authenticated,service_role,factory_mcp_gateway,factory_mcp_resource;
REVOKE ALL ON FUNCTION public.factory_native_document(text,bigint)FROM PUBLIC,anon,service_role,factory_mcp_gateway,factory_mcp_resource;
GRANT EXECUTE ON FUNCTION public.factory_native_document(text,bigint)TO authenticated;

DO $patch$
DECLARE definition text; original text;
BEGIN
 definition:=pg_get_functiondef('factory_private.native_role(text)'::regprocedure);
 original:=$old$ ELSIF p_action='rename_user' THEN$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'DOCUMENT_EDIT_ROLE_HOOK_CHANGED'; END IF;
 EXECUTE replace(definition,original,$new$ ELSIF p_action IN('edit_production_order','edit_packaging_order')THEN PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
 ELSIF p_action IN('edit_sales_invoice','edit_purchase_invoice')THEN PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
 ELSIF p_action='rename_user' THEN$new$);
 definition:=pg_get_functiondef('public.factory_native_write(text,jsonb,uuid)'::regprocedure);
 original:=$old$ IF p_action ~ '^(void_$old$;
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'DOCUMENT_EDIT_WRITE_HOOK_CHANGED'; END IF;
 EXECUTE replace(definition,original,$new$ IF p_action IN('edit_production_order','edit_packaging_order','edit_sales_invoice','edit_purchase_invoice')THEN
  record:=factory_private.edit_document(p_action,p_payload,p_request_id);
 END IF;
 IF p_action ~ '^(void_$new$);
END $patch$;

-- Existing creation paths use the same equations and validation, preserving all other behavior.
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
        v_unit_cost:=factory_private.document_order_unit_cost('production_order',(v_item->>'semi_finished_id')::bigint);
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
          v_unit_cost:=factory_private.document_order_unit_cost('packaging_order',(v_item->>'finished_product_id')::bigint);
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
END $function$
;
CREATE OR REPLACE FUNCTION factory_private.create_commercial(p_action text, p_payload jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE totals jsonb;sale boolean:=p_action LIKE '%sales%'; isreturn boolean:=p_action LIKE '%return'; tab text;
 partykey text; party uuid; header jsonb; item jsonb; line jsonb; rec jsonb; total numeric:=0; paid numeric;
 subtotal numeric; q numeric; price numeric; invoice jsonb; already numeric; original numeric;
BEGIN
 tab:=(CASE WHEN sale THEN 'sales' ELSE 'purchase' END)||(CASE WHEN isreturn THEN '_returns' ELSE '_invoices' END);
 partykey:=CASE WHEN sale THEN 'customer_id' ELSE 'supplier_id' END;
 PERFORM factory_private.assert_keys(p_payload,ARRAY['date','notes',partykey,'items','treasury_id','paid_amount','tax_amount','discount_amount','shipping_cost','invoice_number','original_invoice_id']);
 totals:=factory_private.document_commercial_totals(p_payload,sale,isreturn);
 party:=(totals->>'party')::uuid;total:=(totals->>'total')::numeric;subtotal:=(totals->>'subtotal')::numeric;paid:=(totals->>'paid')::numeric;
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
END $function$
;


NOTIFY pgrst, 'reload schema';
COMMIT;
