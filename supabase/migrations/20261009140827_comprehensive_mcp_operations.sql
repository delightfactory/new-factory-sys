-- Fixed business commands; never a public SQL/table dispatcher. Reviewed locally only.
ALTER FUNCTION public.factory_write(text,jsonb,uuid) SET SCHEMA factory_private;
ALTER FUNCTION factory_private.factory_write(text,jsonb,uuid) RENAME TO foundation_write;
REVOKE ALL ON FUNCTION factory_private.foundation_write(text,jsonb,uuid) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

CREATE TABLE factory_private.execution_effects (
  kind text NOT NULL, record_id bigint NOT NULL, effects jsonb NOT NULL,
  reversed_at timestamptz, PRIMARY KEY(kind,record_id)
);
ALTER TABLE factory_private.execution_effects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON factory_private.execution_effects FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

CREATE FUNCTION factory_private.stock_table(p_kind text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE p_kind
  WHEN 'raw_material' THEN 'raw_materials' WHEN 'packaging_material' THEN 'packaging_materials'
  WHEN 'semi_finished' THEN 'semi_finished_products' WHEN 'finished_product' THEN 'finished_products'
  WHEN 'bundle' THEN 'product_bundles' ELSE NULL END $$;
CREATE FUNCTION factory_private.stock_link(p_kind text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE p_kind
  WHEN 'raw_material' THEN 'raw_material_id' WHEN 'packaging_material' THEN 'packaging_material_id'
  WHEN 'semi_finished' THEN 'semi_finished_product_id' WHEN 'finished_product' THEN 'finished_product_id'
  WHEN 'bundle' THEN 'bundle_id' ELSE NULL END $$;

CREATE VIEW factory_private.stock_current AS
 SELECT 'raw_material'::text item_type,id,code,name,unit,quantity,min_stock,unit_cost,sales_price,quantity*unit_cost value FROM public.raw_materials
 UNION ALL SELECT 'packaging_material',id,code,name,unit,quantity,min_stock,unit_cost,sales_price,quantity*unit_cost FROM public.packaging_materials
 UNION ALL SELECT 'semi_finished',id,code,name,unit,quantity,min_stock,unit_cost,sales_price,quantity*unit_cost FROM public.semi_finished_products
 UNION ALL SELECT 'finished_product',id,code,name,unit,quantity,min_stock,unit_cost,sales_price,quantity*unit_cost FROM public.finished_products
 UNION ALL SELECT 'bundle',id,code,name,'bundle',quantity,min_stock,unit_cost,bundle_price,quantity*unit_cost FROM public.product_bundles;

-- All stock-changing domain commands share the existing advisory lock. Row locks
-- also coordinate with legacy/native table writes before any cost is read.
CREATE FUNCTION factory_private.lock_stock() RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(78102026);
 PERFORM 1 FROM raw_materials ORDER BY id FOR UPDATE;
 PERFORM 1 FROM packaging_materials ORDER BY id FOR UPDATE;
 PERFORM 1 FROM semi_finished_products ORDER BY id FOR UPDATE;
 PERFORM 1 FROM finished_products ORDER BY id FOR UPDATE;
 PERFORM 1 FROM product_bundles ORDER BY id FOR UPDATE;
END $$;

CREATE FUNCTION factory_private.validate_return(p_sale boolean,p_return_id bigint) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE header jsonb; original_id bigint; original_party uuid; tab text:=CASE WHEN p_sale THEN 'sales' ELSE 'purchase' END; item jsonb; keycol text; available numeric; returned numeric; wanted numeric;
BEGIN
 EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1 FOR UPDATE',tab||'_returns') INTO header USING p_return_id;
 IF header IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 IF header->>'original_invoice_id' IS NULL THEN RETURN; END IF;
 EXECUTE format('SELECT id FROM %I WHERE id=$1 AND status=''posted'' FOR UPDATE',tab||'_invoices') INTO original_id USING (header->>'original_invoice_id')::bigint;
 IF original_id IS NULL THEN RAISE EXCEPTION 'MCP_ORIGINAL_INVOICE_INVALID'; END IF;
 EXECUTE format('SELECT %I FROM %I WHERE id=$1',CASE WHEN p_sale THEN 'customer_id' ELSE 'supplier_id' END,tab||'_invoices') INTO original_party USING original_id;
 IF original_party::text IS DISTINCT FROM header->>(CASE WHEN p_sale THEN 'customer_id' ELSE 'supplier_id' END) THEN RAISE EXCEPTION 'MCP_ORIGINAL_INVOICE_INVALID'; END IF;
 FOR item IN EXECUTE format('SELECT to_jsonb(i) FROM %I i WHERE return_id=$1 ORDER BY id',tab||'_return_items') USING p_return_id LOOP
  keycol:=factory_private.stock_link(item->>'item_type');
  IF keycol IS NULL THEN RAISE EXCEPTION 'MCP_ITEM_INVALID'; END IF;
  EXECUTE format('SELECT coalesce(sum(quantity),0) FROM %I WHERE invoice_id=$1 AND item_type=$2 AND %I=$3',tab||'_invoice_items',keycol)
   INTO available USING (header->>'original_invoice_id')::bigint,item->>'item_type',(item->>keycol)::bigint;
  EXECUTE format('SELECT coalesce(sum(i.quantity),0) FROM %I i JOIN %I r ON r.id=i.return_id WHERE r.original_invoice_id=$1 AND r.status=''posted'' AND r.id<>$2 AND i.item_type=$3 AND i.%I=$4',tab||'_return_items',tab||'_returns',keycol)
   INTO returned USING (header->>'original_invoice_id')::bigint,p_return_id,item->>'item_type',(item->>keycol)::bigint;
  EXECUTE format('SELECT coalesce(sum(quantity),0) FROM %I WHERE return_id=$1 AND item_type=$2 AND %I=$3',tab||'_return_items',keycol)
   INTO wanted USING p_return_id,item->>'item_type',(item->>keycol)::bigint;
  IF wanted>available-returned THEN RAISE EXCEPTION 'MCP_RETURN_QUANTITY_EXCEEDED'; END IF;
 END LOOP;
END $$;

CREATE FUNCTION factory_private.transition_commercial(p_action text,p_id bigint,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE sale boolean:=p_action LIKE '%sales%'; ret boolean:=p_action LIKE '%return'; posting boolean:=p_action LIKE 'post_%';
 tab text; prefix text:=CASE WHEN sale THEN 'sales' ELSE 'purchase' END; header jsonb; answer jsonb; settlement record; paidchange numeric; item record; currentqty numeric; beforestock jsonb; effects jsonb;
BEGIN
 tab:=prefix||CASE WHEN ret THEN '_returns' ELSE '_invoices' END;
 EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1 FOR UPDATE',tab) INTO header USING p_id;
 IF header IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 IF header->>'status'=(CASE WHEN posting THEN 'posted' ELSE 'void' END) THEN RETURN header||jsonb_build_object('number',coalesce(header->>'invoice_number',header->>'return_number'),'kind',tab); END IF;
 IF header->>'status'<>(CASE WHEN posting THEN 'draft' ELSE 'posted' END) THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
 PERFORM factory_private.lock_stock();
 IF posting THEN beforestock:=factory_private.snapshot_commercial_stock(prefix,ret,p_id);
 ELSE
  SELECT x.effects INTO effects FROM factory_private.execution_effects x WHERE x.kind=tab AND x.record_id=p_id AND x.reversed_at IS NULL FOR UPDATE;
  IF effects IS NULL THEN RAISE EXCEPTION 'MCP_LEGACY_REVERSAL_REVIEW_REQUIRED'; END IF;
 END IF;
 PERFORM 1 FROM treasuries ORDER BY id FOR UPDATE;
 PERFORM 1 FROM parties WHERE id=(header->>CASE WHEN sale THEN 'customer_id' ELSE 'supplier_id' END)::uuid FOR UPDATE;
 IF posting AND ret THEN PERFORM factory_private.validate_return(sale,p_id); END IF;
 IF ret AND ((posting AND NOT sale) OR (NOT posting AND sale)) THEN
  FOR item IN EXECUTE format('SELECT item_type,coalesce(raw_material_id,packaging_material_id,semi_finished_product_id,finished_product_id%s) item_id,sum(quantity) quantity FROM %I WHERE return_id=$1 GROUP BY item_type,coalesce(raw_material_id,packaging_material_id,semi_finished_product_id,finished_product_id%s)',CASE WHEN sale THEN ',bundle_id' ELSE '' END,prefix||'_return_items',CASE WHEN sale THEN ',bundle_id' ELSE '' END) USING p_id LOOP
   SELECT quantity INTO currentqty FROM factory_private.stock_current WHERE item_type=item.item_type AND id=item.item_id;
   IF currentqty IS NULL OR currentqty<item.quantity THEN RAISE EXCEPTION 'MCP_STOCK_INSUFFICIENT'; END IF;
  END LOOP;
 END IF;
 IF NOT posting AND NOT ret THEN
  EXECUTE format('SELECT jsonb_build_object(''count'',count(*)) FROM %I WHERE original_invoice_id=$1 AND status=''posted''',prefix||'_returns') INTO answer USING p_id;
  IF (answer->>'count')::integer>0 THEN RAISE EXCEPTION 'MCP_VOID_RETURNS_FIRST'; END IF;
  -- Reverse later settlements in their actual treasuries before the legacy
  -- void applies the original invoice's immediate payment and stock reversal.
  FOR settlement IN SELECT * FROM financial_transactions WHERE invoice_id=p_id AND invoice_type=prefix
    AND coalesce(reference_type,'')<>'MCP_REVERSAL' ORDER BY id DESC FOR UPDATE LOOP
   IF NOT EXISTS(SELECT 1 FROM financial_transactions WHERE reference_type='MCP_REVERSAL' AND reference_id=settlement.id::text) THEN
    answer:=factory_private.record_finance(jsonb_build_object('treasury_id',settlement.treasury_id,'amount',settlement.amount,
     'type',CASE WHEN settlement.transaction_type='income' THEN 'expense' ELSE 'income' END,'category','reversal_'||settlement.category,
     'description','Reversal for void '||tab||' #'||p_id,'party_id',settlement.party_id,'invoice_id',p_id,'invoice_type',prefix),p_key);
    UPDATE financial_transactions SET reference_type='MCP_REVERSAL',reference_id=settlement.id::text WHERE id=(answer->>'id')::bigint;
   END IF;
  END LOOP;
 END IF;
 IF posting AND NOT ret AND sale THEN PERFORM process_sales_invoice(p_id);
 ELSIF posting AND NOT ret THEN answer:=process_purchase_invoice(p_id); IF answer->>'success'='false' THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
 ELSIF posting AND ret AND sale THEN PERFORM process_sales_return(p_id);
 ELSIF posting AND ret THEN PERFORM process_purchase_return(p_id);
 ELSIF NOT ret AND sale THEN PERFORM void_sales_invoice(p_id);
 ELSIF NOT ret THEN PERFORM void_purchase_invoice(p_id);
 ELSIF sale THEN PERFORM void_sales_return(p_id);
 ELSE PERFORM void_purchase_return(p_id); END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1',tab) INTO header USING p_id;
 IF header->>'status' IS DISTINCT FROM (CASE WHEN posting THEN 'posted' ELSE 'void' END) THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
 IF posting THEN
  SELECT jsonb_agg(e||jsonb_build_object('after_quantity',s.quantity,'after_unit_cost',s.unit_cost)) INTO effects FROM jsonb_array_elements(beforestock)e JOIN factory_private.stock_current s ON s.item_type=e->>'item_type' AND s.id=(e->>'item_id')::bigint;
  INSERT INTO factory_private.execution_effects(kind,record_id,effects) VALUES(tab,p_id,coalesce(effects,'[]'));
 ELSE
  PERFORM factory_private.restore_commercial_cost(effects);
  UPDATE factory_private.execution_effects SET reversed_at=now() WHERE kind=tab AND record_id=p_id;
 END IF;
 RETURN header||jsonb_build_object('kind',tab,'number',coalesce(header->>'invoice_number',header->>'return_number'),
  'remaining_amount',coalesce((header->>'total_amount')::numeric,0)-coalesce((header->>'paid_amount')::numeric,0));
END $$;

CREATE FUNCTION factory_private.order_plan(p_kind text,p_id bigint)
RETURNS TABLE(item_type text,item_id bigint,delta numeric) LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 WITH changes AS (
 SELECT 'semi_finished'::text kind,i.semi_finished_id id,i.quantity change FROM production_order_items i WHERE p_kind='production' AND i.production_order_id=p_id
 UNION ALL SELECT 'raw_material',g.raw_material_id,-g.quantity*i.quantity/coalesce(nullif(s.recipe_batch_size,0),100)
  FROM production_order_items i JOIN semi_finished_products s ON s.id=i.semi_finished_id JOIN semi_finished_ingredients g ON g.semi_finished_id=s.id WHERE p_kind='production' AND i.production_order_id=p_id
 UNION ALL SELECT 'finished_product',i.finished_product_id,i.quantity FROM packaging_order_items i WHERE p_kind='packaging' AND i.packaging_order_id=p_id
 UNION ALL SELECT 'semi_finished',f.semi_finished_id,-i.quantity*f.semi_finished_quantity FROM packaging_order_items i JOIN finished_products f ON f.id=i.finished_product_id WHERE p_kind='packaging' AND i.packaging_order_id=p_id AND f.semi_finished_id IS NOT NULL
 UNION ALL SELECT 'packaging_material',g.packaging_material_id,-i.quantity*g.quantity FROM packaging_order_items i JOIN finished_product_packaging g ON g.finished_product_id=i.finished_product_id WHERE p_kind='packaging' AND i.packaging_order_id=p_id
 UNION ALL SELECT 'bundle',i.bundle_id,i.quantity FROM bundle_assembly_order_items i WHERE p_kind='bundle_assembly' AND i.assembly_order_id=p_id
 UNION ALL SELECT g.item_type,coalesce(g.raw_material_id,g.packaging_material_id,g.semi_finished_product_id,g.finished_product_id),-i.quantity*g.quantity
  FROM bundle_assembly_order_items i JOIN bundle_items g ON g.bundle_id=i.bundle_id WHERE p_kind='bundle_assembly' AND i.assembly_order_id=p_id
 ) SELECT kind,id,sum(change) FROM changes GROUP BY kind,id ORDER BY kind,id $$;

CREATE FUNCTION factory_private.snapshot_order_stock(p_kind text,p_id bigint) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('item_type',p.item_type,'item_id',p.item_id,'delta',p.delta,'quantity',s.quantity,'unit_cost',s.unit_cost) ORDER BY p.item_type,p.item_id),'[]')
 FROM factory_private.order_plan(p_kind,p_id) p JOIN factory_private.stock_current s ON s.item_type=p.item_type AND s.id=p.item_id $$;

CREATE FUNCTION factory_private.transition_order(p_action text,p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
#variable_conflict use_column
DECLARE v_kind text:=regexp_replace(p_action,'^(start|complete|cancel)_|_order$','','g'); tab text; rec jsonb; oldstock jsonb; effects jsonb;
 e jsonb; oldqty numeric; oldcost numeric; newqty numeric; newcost numeric; delta numeric; costvalue numeric; target text; planned record;
BEGIN
 IF v_kind NOT IN ('production','packaging','bundle_assembly') THEN RAISE EXCEPTION 'MCP_ACTION_FORBIDDEN'; END IF;
 tab:=v_kind||'_orders';
 EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1 FOR UPDATE',tab) INTO rec USING p_id;
 IF rec IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 PERFORM factory_private.lock_stock();
 IF p_action LIKE 'start_%' THEN
  IF rec->>'status'='inProgress' THEN RETURN rec||jsonb_build_object('number',rec->>'code','kind',v_kind); END IF;
  IF rec->>'status'<>'pending' THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
  EXECUTE format('UPDATE %I SET status=''inProgress'',updated_at=now() WHERE id=$1',tab) USING p_id;
 ELSIF p_action LIKE 'complete_%' THEN
  IF rec->>'status'='completed' THEN RETURN rec||jsonb_build_object('number',rec->>'code','kind',v_kind); END IF;
  IF rec->>'status' NOT IN ('pending','inProgress') THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
  oldstock:=factory_private.snapshot_order_stock(v_kind,p_id);
  FOR planned IN SELECT * FROM factory_private.order_plan(v_kind,p_id) LOOP
   SELECT quantity INTO oldqty FROM factory_private.stock_current WHERE item_type=planned.item_type AND id=planned.item_id;
   IF oldqty IS NULL THEN RAISE EXCEPTION 'MCP_ITEM_INVALID'; END IF;
   IF oldqty+planned.delta<0 THEN RAISE EXCEPTION 'MCP_STOCK_INSUFFICIENT'; END IF;
  END LOOP;
  IF v_kind='production' THEN PERFORM complete_production_order_atomic(p_id);
  ELSIF v_kind='packaging' THEN PERFORM complete_packaging_order_atomic(p_id);
  ELSE
   -- Cost calculation is read-only here: calculate_bundle_cost overwrites the
   -- previous WACO and therefore must not run before the assembly cost snapshot.
   FOR planned IN SELECT i.*,coalesce((SELECT sum(g.quantity*s.unit_cost) FROM bundle_items g JOIN factory_private.stock_current s ON s.item_type=g.item_type AND s.id=coalesce(g.raw_material_id,g.packaging_material_id,g.semi_finished_product_id,g.finished_product_id) WHERE g.bundle_id=i.bundle_id),0) recipe_cost
     FROM bundle_assembly_order_items i WHERE assembly_order_id=p_id ORDER BY id LOOP
    SELECT quantity,unit_cost INTO oldqty,oldcost FROM product_bundles WHERE id=planned.bundle_id;
    newqty:=oldqty+planned.quantity; newcost:=CASE WHEN newqty>0 THEN (oldqty*oldcost+planned.quantity*planned.recipe_cost)/newqty ELSE planned.recipe_cost END;
    UPDATE product_bundles SET quantity=newqty,unit_cost=newcost WHERE id=planned.bundle_id;
    UPDATE bundle_assembly_order_items SET unit_cost=planned.recipe_cost,total_cost=planned.quantity*planned.recipe_cost WHERE id=planned.id;
    PERFORM log_inventory_movement(planned.bundle_id,'product_bundles','in',planned.quantity,'Bundle assembly',rec->>'code');
   END LOOP;
   FOR planned IN SELECT * FROM factory_private.order_plan(v_kind,p_id) WHERE delta<0 LOOP
    EXECUTE format('UPDATE %I SET quantity=quantity+$1,updated_at=now() WHERE id=$2',factory_private.stock_table(planned.item_type)) USING planned.delta,planned.item_id;
    PERFORM log_inventory_movement(planned.item_id,factory_private.stock_table(planned.item_type),'out',-planned.delta,'Bundle assembly',rec->>'code');
   END LOOP;
   UPDATE bundle_assembly_orders SET status='completed',total_cost=(SELECT sum(total_cost) FROM bundle_assembly_order_items WHERE assembly_order_id=p_id),updated_at=now() WHERE id=p_id;
  END IF;
  SELECT jsonb_agg(e||jsonb_build_object('after_quantity',s.quantity,'after_unit_cost',s.unit_cost)) INTO effects
   FROM jsonb_array_elements(oldstock)e JOIN factory_private.stock_current s ON s.item_type=e->>'item_type' AND s.id=(e->>'item_id')::bigint;
  INSERT INTO factory_private.execution_effects(kind,record_id,effects) VALUES(v_kind,p_id,effects);
 ELSE
  IF rec->>'status'='cancelled' THEN RETURN rec||jsonb_build_object('number',rec->>'code','kind',v_kind); END IF;
  IF rec->>'status'='completed' THEN
   IF v_kind='bundle_assembly' THEN RAISE EXCEPTION 'MCP_BUNDLE_REVERSAL_NOT_SUPPORTED'; END IF;
   SELECT x.effects INTO effects FROM factory_private.execution_effects x WHERE x.kind=v_kind AND x.record_id=p_id AND reversed_at IS NULL FOR UPDATE;
   IF effects IS NULL THEN RAISE EXCEPTION 'MCP_LEGACY_REVERSAL_REVIEW_REQUIRED'; END IF;
   FOR e IN SELECT value FROM jsonb_array_elements(effects) ORDER BY value->>'item_type',value->>'item_id' LOOP
    target:=factory_private.stock_table(e->>'item_type'); delta:=(e->>'delta')::numeric;
    EXECUTE format('SELECT quantity,unit_cost FROM %I WHERE id=$1 FOR UPDATE',target) INTO oldqty,oldcost USING (e->>'item_id')::bigint;
    newqty:=oldqty-delta; IF newqty<0 THEN RAISE EXCEPTION 'MCP_STOCK_INSUFFICIENT'; END IF;
    costvalue:=(e->>'after_quantity')::numeric*(e->>'after_unit_cost')::numeric-(e->>'quantity')::numeric*(e->>'unit_cost')::numeric;
    IF newqty=0 AND abs(oldqty*oldcost-costvalue)>0.00000001 THEN RAISE EXCEPTION 'MCP_REVERSAL_COST_REVIEW_REQUIRED'; END IF;
    newcost:=CASE WHEN newqty>0 THEN (oldqty*oldcost-costvalue)/newqty ELSE 0 END;
    IF newcost<0 THEN RAISE EXCEPTION 'MCP_REVERSAL_COST_REVIEW_REQUIRED'; END IF;
    EXECUTE format('UPDATE %I SET quantity=$1,unit_cost=$2,updated_at=now() WHERE id=$3',target) USING newqty,newcost,(e->>'item_id')::bigint;
    PERFORM log_inventory_movement((e->>'item_id')::bigint,target,CASE WHEN delta>0 THEN 'out' ELSE 'in' END,abs(delta),'Reversal of recorded execution',rec->>'code');
   END LOOP;
   UPDATE factory_private.execution_effects SET reversed_at=now() WHERE execution_effects.kind=v_kind AND record_id=p_id;
  ELSIF rec->>'status' NOT IN ('pending','inProgress') THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
  EXECUTE format('UPDATE %I SET status=''cancelled'',updated_at=now() WHERE id=$1',tab) USING p_id;
 END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1',tab) INTO rec USING p_id;
 RETURN rec||jsonb_build_object('kind',v_kind,'number',rec->>'code','effects',coalesce(effects,'[]'::jsonb));
END $$;

CREATE FUNCTION factory_private.master_spec(p_kind text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE p_kind
 WHEN 'raw_material' THEN '{"table":"raw_materials","prefix":"RM","fields":["code","name","unit","quantity","min_stock","unit_cost","sales_price","importance"]}'::jsonb
 WHEN 'packaging_material' THEN '{"table":"packaging_materials","prefix":"PM","fields":["code","name","unit","quantity","min_stock","unit_cost","sales_price"]}'::jsonb
 WHEN 'semi_finished_product' THEN '{"table":"semi_finished_products","prefix":"SF","fields":["code","name","unit","quantity","min_stock","unit_cost","sales_price","recipe_batch_size","ingredients"]}'::jsonb
 WHEN 'finished_product' THEN '{"table":"finished_products","prefix":"FP","fields":["code","name","unit","quantity","min_stock","unit_cost","sales_price","semi_finished_id","semi_finished_quantity","packaging"]}'::jsonb
 WHEN 'bundle' THEN '{"table":"product_bundles","prefix":"BND","fields":["code","name","description","min_stock","bundle_price","is_active","items"]}'::jsonb
 WHEN 'party' THEN '{"table":"parties","fields":["name","type","phone","email","address","tax_number","commercial_record","credit_limit","opening_balance"]}'::jsonb
 WHEN 'treasury' THEN '{"table":"treasuries","fields":["name","type","currency","account_number","description","opening_balance"]}'::jsonb
 WHEN 'financial_category' THEN '{"table":"financial_categories","fields":["name","type"]}'::jsonb
 ELSE NULL END $$;

CREATE FUNCTION factory_private.save_master(p_kind text,p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE spec jsonb:=factory_private.master_spec(p_kind); tab text; fields text[]; data jsonb;
 cols text; vals text; assignments text; rec jsonb; entry jsonb; keytext text:=p_payload->>'id'; n numeric; cost numeric; historical_cost numeric;
BEGIN
 IF spec IS NULL THEN RAISE EXCEPTION 'MCP_ACTION_FORBIDDEN'; END IF;
 tab:=spec->>'table'; fields:=ARRAY(SELECT jsonb_array_elements_text(spec->'fields'));
 PERFORM factory_private.assert_keys(p_payload,fields||ARRAY['id']);
 IF keytext IS NOT NULL AND p_payload ?| ARRAY['quantity','unit_cost','opening_balance'] THEN RAISE EXCEPTION 'MCP_USE_ADJUSTMENT_COMMAND'; END IF;
 data:=p_payload-ARRAY['id','ingredients','packaging','items','opening_balance'];
 IF (data ? 'name' AND length(btrim(data->>'name'))=0) OR (data ? 'unit' AND length(btrim(data->>'unit'))=0) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 FOR entry IN SELECT value FROM jsonb_each(data) WHERE key IN ('quantity','min_stock','unit_cost','sales_price','bundle_price','recipe_batch_size','semi_finished_quantity','credit_limit') LOOP
   n:=entry::text::numeric; IF n<0 OR n>1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 END LOOP;
 IF coalesce((data->>'recipe_batch_size')::numeric,1)<=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF keytext IS NULL AND spec ? 'prefix' AND NOT data ? 'code' THEN data:=data||jsonb_build_object('code',(spec->>'prefix')||'-MCP-'||p_key); END IF;
 IF p_payload ? 'opening_balance' THEN
  IF jsonb_typeof(p_payload->'opening_balance') IS DISTINCT FROM 'number' OR (p_payload->>'opening_balance')::numeric NOT BETWEEN -1e12 AND 1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  IF p_kind NOT IN ('party','treasury') OR (p_kind='treasury' AND (p_payload->>'opening_balance')::numeric<0) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  data:=data||jsonb_build_object('balance',(p_payload->>'opening_balance')::numeric);
 END IF;
 SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('r.%I',key),',' ORDER BY key),
   string_agg(format('%I=r.%I',key,key),',' ORDER BY key) INTO cols,vals,assignments FROM jsonb_object_keys(data) key;
 IF cols IS NULL AND keytext IS NULL THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF keytext IS NULL THEN
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r RETURNING to_jsonb(%I.*)',tab,cols,vals,tab,tab) INTO rec USING data;
 ELSE
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text=$1 FOR UPDATE',tab) INTO rec USING keytext;
  IF rec IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  IF p_kind IN ('semi_finished_product','finished_product','bundle') AND (rec->>'quantity')::numeric>0 THEN historical_cost:=(rec->>'unit_cost')::numeric; END IF;
  IF cols IS NOT NULL THEN
   EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.id::text=$2 RETURNING to_jsonb(t)',tab,assignments,tab) INTO rec USING data,keytext;
  END IF;
 END IF;
 keytext:=rec->>'id';
 IF p_kind='semi_finished_product' AND p_payload ? 'ingredients' THEN
  IF jsonb_typeof(p_payload->'ingredients')<>'array' OR jsonb_array_length(p_payload->'ingredients')>500 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  DELETE FROM semi_finished_ingredients WHERE semi_finished_id=keytext::bigint;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'ingredients') LOOP
   PERFORM factory_private.assert_keys(entry,ARRAY['raw_material_id','quantity','percentage']);
   IF jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number' OR (entry->>'quantity')::numeric NOT BETWEEN 0.000000001 AND 1e9
    OR jsonb_typeof(entry->'raw_material_id') IS DISTINCT FROM 'number' OR coalesce((entry->>'raw_material_id')::bigint,0)<=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   INSERT INTO semi_finished_ingredients(semi_finished_id,raw_material_id,quantity,percentage)
    VALUES(keytext::bigint,(entry->>'raw_material_id')::bigint,(entry->>'quantity')::numeric,
      (entry->>'quantity')::numeric/coalesce((rec->>'recipe_batch_size')::numeric,100)*100);
  END LOOP;
 ELSIF p_kind='finished_product' AND p_payload ? 'packaging' THEN
  DELETE FROM finished_product_packaging WHERE finished_product_id=keytext::bigint;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'packaging') LOOP
   PERFORM factory_private.assert_keys(entry,ARRAY['packaging_material_id','quantity']);
   IF jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number' OR (entry->>'quantity')::numeric NOT BETWEEN 0.000000001 AND 1e9
    OR jsonb_typeof(entry->'packaging_material_id') IS DISTINCT FROM 'number' OR coalesce((entry->>'packaging_material_id')::bigint,0)<=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   INSERT INTO finished_product_packaging(finished_product_id,packaging_material_id,quantity)
    VALUES(keytext::bigint,(entry->>'packaging_material_id')::bigint,(entry->>'quantity')::numeric);
  END LOOP;
 ELSIF p_kind='bundle' AND p_payload ? 'items' THEN
  DELETE FROM bundle_items WHERE bundle_id=keytext::bigint;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
   PERFORM factory_private.assert_keys(entry,ARRAY['item_type','item_id','quantity']);
   IF factory_private.stock_table(entry->>'item_type') IS NULL OR entry->>'item_type'='bundle'
    OR jsonb_typeof(entry->'quantity') IS DISTINCT FROM 'number' OR (entry->>'quantity')::numeric NOT BETWEEN 0.000000001 AND 1e9
    OR jsonb_typeof(entry->'item_id') IS DISTINCT FROM 'number' OR coalesce((entry->>'item_id')::bigint,0)<=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   EXECUTE format('INSERT INTO bundle_items(bundle_id,item_type,%I,quantity)VALUES($1,$2,$3,$4)',factory_private.stock_link(entry->>'item_type'))
    USING keytext::bigint,entry->>'item_type',(entry->>'item_id')::bigint,(entry->>'quantity')::numeric;
  END LOOP;
  SELECT coalesce(sum(i.quantity*s.unit_cost),0) INTO cost FROM bundle_items i JOIN factory_private.stock_current s
   ON s.item_type=i.item_type AND s.id=coalesce(i.raw_material_id,i.packaging_material_id,i.semi_finished_product_id,i.finished_product_id) WHERE i.bundle_id=keytext::bigint;
  -- Recipe edits must not overwrite weighted average inventory cost of stocked bundles.
  UPDATE product_bundles SET unit_cost=CASE WHEN quantity=0 THEN cost ELSE unit_cost END WHERE id=keytext::bigint RETURNING to_jsonb(product_bundles.*) INTO rec;
 END IF;
 -- Native recipe/definition triggers still calculate future recipe cost. They
 -- must not rewrite the historical weighted cost of already stocked output.
 IF historical_cost IS NOT NULL THEN
  EXECUTE format('UPDATE public.%I SET unit_cost=$1 WHERE id=$2 RETURNING to_jsonb(%I.*)',tab,tab) INTO rec USING historical_cost,keytext::bigint;
 END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text=$1',tab) INTO rec USING keytext;
 RETURN jsonb_build_object('kind',p_kind,'id',rec->'id','number',coalesce(rec->>'code',rec->>'name'),'record',rec);
END $$;

CREATE FUNCTION factory_private.create_commercial(p_action text,p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
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
END $$;

CREATE FUNCTION factory_private.record_finance(p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE treas bigint:=(p_payload->>'treasury_id')::bigint; amount numeric:=(p_payload->>'amount')::numeric;
 typ text:=p_payload->>'type'; party uuid:=(p_payload->>'party_id')::uuid; invoiceid bigint:=(p_payload->>'invoice_id')::bigint;
 invoicetype text:=p_payload->>'invoice_type'; inv jsonb; delta numeric; newid bigint; balance numeric;
BEGIN
 PERFORM factory_private.assert_keys(p_payload,ARRAY['treasury_id','amount','type','category','description','date','party_id','invoice_id','invoice_type']);
 IF amount IS NULL OR amount<=0 OR amount>1e12 OR typ IS NULL OR typ NOT IN ('income','expense') OR length(btrim(coalesce(p_payload->>'category','')))=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 SELECT t.balance INTO balance FROM treasuries t WHERE id=treas FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MCP_TREASURY_INVALID'; END IF;
 IF typ='expense' AND balance<amount THEN RAISE EXCEPTION 'MCP_TREASURY_INSUFFICIENT'; END IF;
 IF invoiceid IS NOT NULL OR invoicetype IS NOT NULL THEN
  IF invoiceid IS NULL OR invoicetype NOT IN ('purchase','sales') OR party IS NULL THEN RAISE EXCEPTION 'MCP_INVOICE_LINK_INVALID'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',invoicetype||'_invoices') INTO inv USING invoiceid;
  IF inv IS NULL OR inv->>'status'<>'posted' OR inv->>(CASE WHEN invoicetype='sales' THEN 'customer_id' ELSE 'supplier_id' END)<>party::text THEN RAISE EXCEPTION 'MCP_INVOICE_LINK_INVALID'; END IF;
  delta:=CASE WHEN (invoicetype='sales' AND typ='income') OR (invoicetype='purchase' AND typ='expense') THEN amount ELSE -amount END;
  IF (inv->>'paid_amount')::numeric+delta NOT BETWEEN 0 AND (inv->>'total_amount')::numeric THEN RAISE EXCEPTION 'MCP_SETTLEMENT_AMOUNT_INVALID'; END IF;
  EXECUTE format('UPDATE public.%I SET paid_amount=paid_amount+$1 WHERE id=$2',invoicetype||'_invoices') USING delta,invoiceid;
 END IF;
 IF p_payload->>'category' IN ('payment','purchase','receipt','refund') AND party IS NULL THEN RAISE EXCEPTION 'MCP_PARTY_REQUIRED'; END IF;
 IF party IS NOT NULL THEN
  PERFORM 1 FROM parties WHERE id=party FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'MCP_PARTY_INVALID'; END IF;
  UPDATE parties SET balance=parties.balance+CASE WHEN typ='expense' THEN amount ELSE -amount END WHERE id=party;
 END IF;
 UPDATE treasuries SET balance=treasuries.balance+CASE WHEN typ='income' THEN amount ELSE -amount END,updated_at=now() WHERE id=treas RETURNING treasuries.balance INTO balance;
 INSERT INTO financial_transactions(treasury_id,party_id,amount,transaction_type,category,description,transaction_date,invoice_id,invoice_type,reference_type,reference_id)
  VALUES(treas,party,amount,typ,p_payload->>'category',p_payload->>'description',coalesce((p_payload->>'date')::date,current_date),invoiceid,invoicetype,'MCP',p_key::text) RETURNING id INTO newid;
 RETURN jsonb_build_object('kind','financial_transaction','id',newid,'number','FT-'||newid,'status','recorded','amount',amount,'treasury_balance',balance,'invoice_id',invoiceid,'recording_only',true);
END $$;

CREATE FUNCTION factory_private.transfer_treasury(p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE source bigint:=(p_payload->>'from_id')::bigint; dest bigint:=(p_payload->>'to_id')::bigint; amount numeric:=(p_payload->>'amount')::numeric; rec jsonb;
BEGIN
 PERFORM factory_private.assert_keys(p_payload,ARRAY['from_id','to_id','amount','description']);
 IF source IS NULL OR dest IS NULL OR source=dest OR amount IS NULL OR amount<=0 OR amount>1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 PERFORM 1 FROM treasuries WHERE id IN(source,dest) ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM treasuries WHERE id IN(source,dest))<>2 THEN RAISE EXCEPTION 'MCP_TREASURY_INVALID'; END IF;
 IF (SELECT currency FROM treasuries WHERE id=source) IS DISTINCT FROM (SELECT currency FROM treasuries WHERE id=dest) THEN RAISE EXCEPTION 'MCP_TREASURY_CURRENCY_MISMATCH'; END IF;
 IF (SELECT balance FROM treasuries WHERE id=source)<amount THEN RAISE EXCEPTION 'MCP_TREASURY_INSUFFICIENT'; END IF;
 PERFORM factory_private.record_finance(jsonb_build_object('treasury_id',source,'amount',amount,'type','expense','category','transfer_out','description',p_payload->>'description'),p_key);
 PERFORM factory_private.record_finance(jsonb_build_object('treasury_id',dest,'amount',amount,'type','income','category','transfer_in','description',p_payload->>'description'),p_key);
 RETURN jsonb_build_object('kind','treasury_transfer','number','TR-MCP-'||p_key,'status','recorded','amount',amount,'from_id',source,'to_id',dest,'recording_only',true);
END $$;


CREATE FUNCTION factory_private.snapshot_commercial_stock(p_prefix text,p_return boolean,p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE rows jsonb; tab text; sign numeric;
BEGIN
 IF p_prefix NOT IN ('sales','purchase') THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 tab:=p_prefix||CASE WHEN p_return THEN '_return_items' ELSE '_invoice_items' END;
 sign:=CASE WHEN (p_prefix='sales' AND p_return) OR (p_prefix='purchase' AND NOT p_return) THEN 1 ELSE -1 END;
 EXECUTE format('WITH lines AS(SELECT item_type,coalesce(raw_material_id,packaging_material_id,semi_finished_product_id,finished_product_id%s) item_id,sum(quantity)*$2 delta FROM %I WHERE %I=$1 GROUP BY item_type,coalesce(raw_material_id,packaging_material_id,semi_finished_product_id,finished_product_id%s)) SELECT coalesce(jsonb_agg(jsonb_build_object(''item_type'',l.item_type,''item_id'',l.item_id,''delta'',l.delta,''quantity'',s.quantity,''unit_cost'',s.unit_cost) ORDER BY l.item_type,l.item_id),''[]'') FROM lines l JOIN factory_private.stock_current s ON s.item_type=l.item_type AND s.id=l.item_id',CASE WHEN p_prefix='sales' THEN ',bundle_id' ELSE '' END,tab,CASE WHEN p_return THEN 'return_id' ELSE 'invoice_id' END,CASE WHEN p_prefix='sales' THEN ',bundle_id' ELSE '' END) INTO rows USING p_id,sign;
 RETURN rows;
END $$;
CREATE FUNCTION factory_private.restore_commercial_cost(p_effects jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE e jsonb; qty numeric; cost numeric; delta numeric; value_before_void numeric; restored_value numeric; target text;
BEGIN
 FOR e IN SELECT value FROM jsonb_array_elements(p_effects) ORDER BY value->>'item_type',value->>'item_id' LOOP
  target:=factory_private.stock_table(e->>'item_type'); delta:=(e->>'delta')::numeric;
  EXECUTE format('SELECT quantity,unit_cost FROM %I WHERE id=$1 FOR UPDATE',target) INTO qty,cost USING (e->>'item_id')::bigint;
  -- Legacy void has reversed quantity but left cost unchanged. Reconstruct its
  -- pre-void inventory value, then remove the original executed value change.
  value_before_void:=(qty+delta)*cost;
  restored_value:=value_before_void-((e->>'after_quantity')::numeric*(e->>'after_unit_cost')::numeric-(e->>'quantity')::numeric*(e->>'unit_cost')::numeric);
  IF qty<0 OR restored_value< -0.00000001 OR (qty=0 AND abs(restored_value)>0.00000001) THEN RAISE EXCEPTION 'MCP_REVERSAL_COST_REVIEW_REQUIRED'; END IF;
  cost:=CASE WHEN qty>0 THEN greatest(0,restored_value)/qty ELSE 0 END;
  EXECUTE format('UPDATE %I SET unit_cost=$1,updated_at=now() WHERE id=$2',target) USING cost,(e->>'item_id')::bigint;
 END LOOP;
END $$;


-- Integration draft only; not applied or tested. Depends on stock_table,
-- stock_current, lock_stock and require_role from the comprehensive foundation.
-- The outer fixed command dispatcher MUST own request receipts, approval,
-- payload/action conflict checks and the surrounding transaction.
-- No direct client grants: these invoker helpers stay in the private schema.
CREATE TABLE factory_private.stocktake_starts (
 session_id bigint PRIMARY KEY REFERENCES public.inventory_count_sessions(id),
 selection jsonb NOT NULL
);
ALTER TABLE factory_private.stocktake_starts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON factory_private.stocktake_starts FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

CREATE OR REPLACE FUNCTION factory_private.stocktake(p_action text,p_payload jsonb,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_session inventory_count_sessions%ROWTYPE; v_id bigint; v_selection jsonb;
 v_count jsonb; v_line inventory_count_items%ROWTYPE; v_current numeric; v_delta numeric;
 v_table text; v_effects jsonb:='[]'::jsonb; v_cost_impact numeric:=0;
BEGIN
 PERFORM factory_private.require_role(ARRAY['admin','manager','inventory_officer']);
 IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('create_stocktake','start_stocktake','record_stocktake_counts','reconcile_stocktake','cancel_stocktake')
 THEN RAISE EXCEPTION 'MCP_ACTION_FORBIDDEN'; END IF;
 -- Use the same lock order as all integrated stock commands: advisory/stock,
 -- then document header and lines. Parent must align other command lock order.
 PERFORM factory_private.lock_stock();
 IF p_action='create_stocktake' THEN
  IF coalesce(p_payload->>'type','') NOT IN ('full','partial') OR p_payload->>'date' IS NULL
   OR length(coalesce(p_payload->>'notes',''))>2000 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  INSERT INTO inventory_count_sessions(code,date,type,notes,status)
   VALUES('ST-MCP-'||p_request,(p_payload->>'date')::date,p_payload->>'type',p_payload->>'notes','draft')
   RETURNING * INTO v_session;
 ELSE
  v_id:=(p_payload->>'id')::bigint;
  SELECT * INTO v_session FROM inventory_count_sessions WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  PERFORM 1 FROM inventory_count_items WHERE session_id=v_id ORDER BY id FOR UPDATE;
  IF p_action='start_stocktake' THEN
   IF EXISTS(SELECT 1 FROM jsonb_each(p_payload) WHERE key IN ('raw','packaging','semi','finished') AND jsonb_typeof(value)<>'boolean')
    OR NOT(p_payload ?& ARRAY['raw','packaging','semi','finished']) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   v_selection:=jsonb_build_object('raw',p_payload->'raw','packaging',p_payload->'packaging','semi',p_payload->'semi','finished',p_payload->'finished');
   IF v_selection='{"raw":false,"packaging":false,"semi":false,"finished":false}'::jsonb THEN RAISE EXCEPTION 'MCP_EMPTY_SNAPSHOT'; END IF;
   IF v_session.status='in_progress' THEN
    IF NOT EXISTS(SELECT 1 FROM factory_private.stocktake_starts WHERE session_id=v_id AND selection=v_selection)
    THEN RAISE EXCEPTION 'MCP_SNAPSHOT_ALREADY_STARTED'; END IF;
   ELSE
    IF v_session.status<>'draft' THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
    IF EXISTS(SELECT 1 FROM inventory_count_items WHERE session_id=v_id) THEN RAISE EXCEPTION 'MCP_SNAPSHOT_ALREADY_STARTED'; END IF;
    INSERT INTO factory_private.stocktake_starts VALUES(v_id,v_selection);
    INSERT INTO inventory_count_items(session_id,item_type,item_id,product_name,unit,system_quantity,counted_quantity,unit_cost)
     SELECT v_id,s.item_type,s.id,s.name,s.unit,s.quantity,s.quantity,s.unit_cost
     FROM factory_private.stock_current s WHERE
      (s.item_type='raw_material' AND (p_payload->>'raw')::boolean) OR
      (s.item_type='packaging_material' AND (p_payload->>'packaging')::boolean) OR
      (s.item_type='semi_finished' AND (p_payload->>'semi')::boolean) OR
      (s.item_type='finished_product' AND (p_payload->>'finished')::boolean)
     ORDER BY s.item_type,s.id;
    UPDATE inventory_count_sessions SET status='in_progress',updated_at=now() WHERE id=v_id;
   END IF;
  ELSIF p_action='record_stocktake_counts' THEN
   IF v_session.status<>'in_progress' THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
   IF jsonb_typeof(p_payload->'counts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'counts') NOT BETWEEN 1 AND 500
   THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'counts') c GROUP BY c->>'item_id' HAVING count(*)>1)
   THEN RAISE EXCEPTION 'MCP_DUPLICATE_COUNT_ITEM'; END IF;
   FOR v_count IN SELECT value FROM jsonb_array_elements(p_payload->'counts') LOOP
    IF jsonb_typeof(v_count->'counted_quantity') IS DISTINCT FROM 'number' OR
      (v_count->>'counted_quantity')::numeric NOT BETWEEN 0 AND 1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
    -- item_id here is inventory_count_items.id, NOT the underlying stock id.
    UPDATE inventory_count_items SET counted_quantity=(v_count->>'counted_quantity')::numeric,
      cost_impact=((v_count->>'counted_quantity')::numeric-system_quantity)*unit_cost
     WHERE id=(v_count->>'item_id')::bigint AND session_id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MCP_COUNT_ITEM_NOT_FOUND'; END IF;
   END LOOP;
  ELSIF p_action='reconcile_stocktake' THEN
   IF v_session.status='completed' THEN
    SELECT effects INTO v_effects FROM factory_private.execution_effects WHERE kind='stocktake' AND record_id=v_id;
   ELSE
    IF v_session.status<>'in_progress' THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
    -- Protect old native sessions containing duplicate/missing snapshot rows.
    IF EXISTS(SELECT 1 FROM inventory_count_items WHERE session_id=v_id GROUP BY item_type,item_id HAVING count(*)>1)
     THEN RAISE EXCEPTION 'MCP_DUPLICATE_SNAPSHOT_ITEM'; END IF;
    FOR v_line IN SELECT * FROM inventory_count_items WHERE session_id=v_id ORDER BY item_type,item_id LOOP
     IF v_line.counted_quantity IS NULL OR v_line.counted_quantity<0 THEN RAISE EXCEPTION 'MCP_COUNT_INVALID'; END IF;
     SELECT quantity INTO v_current FROM factory_private.stock_current WHERE item_type=v_line.item_type AND id=v_line.item_id;
     IF NOT FOUND THEN RAISE EXCEPTION 'MCP_STOCK_RECORD_NOT_FOUND'; END IF;
     v_delta:=v_line.counted_quantity-v_line.system_quantity;
     IF v_current+v_delta<0 THEN RAISE EXCEPTION 'MCP_STOCK_INSUFFICIENT'; END IF;
     v_table:=factory_private.stock_table(v_line.item_type);
     IF v_delta<>0 THEN
      EXECUTE format('UPDATE public.%I SET quantity=quantity+$1,updated_at=now() WHERE id=$2',v_table) USING v_delta,v_line.item_id;
      PERFORM public.log_inventory_movement(v_line.item_id,v_table,CASE WHEN v_delta>0 THEN 'in' ELSE 'out' END,abs(v_delta),'Stocktake reconciliation','INV-ADJ-'||v_id);
     END IF;
     -- Cost is deliberately never assigned on the stock table.
     UPDATE inventory_count_items SET cost_impact=v_delta*unit_cost WHERE id=v_line.id;
     v_effects:=v_effects||jsonb_build_array(jsonb_build_object('item_type',v_line.item_type,'item_id',v_line.item_id,
      'snapshot_quantity',v_line.system_quantity,'counted_quantity',v_line.counted_quantity,'delta',v_delta,
      'before_quantity',v_current,'after_quantity',v_current+v_delta,'snapshot_unit_cost',v_line.unit_cost,'cost_impact',v_delta*v_line.unit_cost));
    END LOOP;
    INSERT INTO factory_private.execution_effects(kind,record_id,effects) VALUES('stocktake',v_id,v_effects);
    UPDATE inventory_count_sessions SET status='completed',updated_at=now() WHERE id=v_id;
   END IF;
  ELSE
   IF v_session.status NOT IN ('draft','in_progress','cancelled') THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
   UPDATE inventory_count_sessions SET status='cancelled',updated_at=now() WHERE id=v_id AND status<>'cancelled';
  END IF;
  SELECT * INTO v_session FROM inventory_count_sessions WHERE id=v_id;
 END IF;
 SELECT coalesce(sum(cost_impact),0) INTO v_cost_impact FROM inventory_count_items WHERE session_id=v_session.id;
 RETURN to_jsonb(v_session)||jsonb_build_object('kind','stocktake','number',v_session.code,
  'item_count',(SELECT count(*) FROM inventory_count_items WHERE session_id=v_session.id),
  'cost_impact',v_cost_impact,'effects',coalesce(v_effects,'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION factory_private.stock_requirements(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_kind text:=p_payload->>'kind'; v_id bigint:=(p_payload->>'id')::bigint;
 v_quantity numeric:=coalesce((p_payload->>'quantity')::numeric,1); v_result jsonb;
BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR coalesce(v_kind,'') NOT IN ('semi_finished','finished_product','bundle','packaging_order') OR v_id IS NULL OR v_id<=0
  OR v_quantity<=0 OR v_quantity>1e9 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 PERFORM factory_private.require_role(ARRAY['admin','manager','inventory_officer','production_officer']);
 IF (v_kind='packaging_order' AND NOT EXISTS(SELECT 1 FROM packaging_orders WHERE id=v_id)) OR
   (v_kind<>'packaging_order' AND NOT EXISTS(SELECT 1 FROM factory_private.stock_current WHERE item_type=v_kind AND id=v_id))
 THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
 WITH demand(item_type,item_id,required) AS (
  SELECT 'raw_material'::text,g.raw_material_id,g.quantity*v_quantity/coalesce(nullif(s.recipe_batch_size,0),100)
   FROM semi_finished_products s JOIN semi_finished_ingredients g ON g.semi_finished_id=s.id WHERE v_kind='semi_finished' AND s.id=v_id
  UNION ALL SELECT 'semi_finished',f.semi_finished_id,f.semi_finished_quantity*v_quantity FROM finished_products f WHERE v_kind='finished_product' AND f.id=v_id AND f.semi_finished_id IS NOT NULL
  UNION ALL SELECT 'packaging_material',g.packaging_material_id,g.quantity*v_quantity FROM finished_product_packaging g WHERE v_kind='finished_product' AND g.finished_product_id=v_id
  UNION ALL SELECT g.item_type,coalesce(g.raw_material_id,g.packaging_material_id,g.semi_finished_product_id,g.finished_product_id),g.quantity*v_quantity FROM bundle_items g WHERE v_kind='bundle' AND g.bundle_id=v_id
  UNION ALL SELECT p.item_type,p.item_id,-p.delta FROM factory_private.order_plan('packaging',v_id) p WHERE v_kind='packaging_order' AND p.delta<0
 ), pending(item_type,item_id,required) AS (
  -- Same pending-demand logic as native UI, aggregated across all lines.
  SELECT 'raw_material'::text,g.raw_material_id,g.quantity*i.quantity/coalesce(nullif(s.recipe_batch_size,0),100)
   FROM production_orders o JOIN production_order_items i ON i.production_order_id=o.id
   JOIN semi_finished_products s ON s.id=i.semi_finished_id JOIN semi_finished_ingredients g ON g.semi_finished_id=s.id WHERE o.status IN ('pending','inProgress')
  UNION ALL SELECT 'semi_finished',f.semi_finished_id,f.semi_finished_quantity*i.quantity
   FROM packaging_orders o JOIN packaging_order_items i ON i.packaging_order_id=o.id JOIN finished_products f ON f.id=i.finished_product_id
   WHERE o.status IN ('pending','inProgress') AND f.semi_finished_id IS NOT NULL AND NOT(v_kind='packaging_order' AND o.id=v_id)
  UNION ALL SELECT 'packaging_material',g.packaging_material_id,g.quantity*i.quantity
   FROM packaging_orders o JOIN packaging_order_items i ON i.packaging_order_id=o.id JOIN finished_product_packaging g ON g.finished_product_id=i.finished_product_id
   WHERE o.status IN ('pending','inProgress') AND NOT(v_kind='packaging_order' AND o.id=v_id)
 ), summed AS (SELECT item_type,item_id,sum(required) required FROM demand GROUP BY item_type,item_id),
 reserved AS (SELECT item_type,item_id,sum(required) required FROM pending GROUP BY item_type,item_id),
 details AS (SELECT d.item_type,d.item_id,s.name,s.unit,d.required,s.quantity available,s.unit_cost,
  coalesce(r.required,0) pending_demand,greatest(0,s.quantity-coalesce(r.required,0)) adjusted_available,
  greatest(0,d.required-s.quantity) shortage,greatest(0,d.required-greatest(0,s.quantity-coalesce(r.required,0))) adjusted_shortage
  FROM summed d LEFT JOIN factory_private.stock_current s ON s.item_type=d.item_type AND s.id=d.item_id
  LEFT JOIN reserved r ON r.item_type=d.item_type AND r.item_id=d.item_id)
 SELECT jsonb_build_object('kind',v_kind,'id',v_id,'quantity',CASE WHEN v_kind='packaging_order' THEN NULL ELSE v_quantity END,
  'as_of',statement_timestamp(),'reservation_basis','pending/inProgress production and packaging; informational, no stock reservation',
  'can_complete',coalesce(bool_and(available IS NOT NULL AND shortage=0),true),
  'can_complete_after_pending_demand',coalesce(bool_and(available IS NOT NULL AND adjusted_shortage=0),true),
  'estimated_component_cost',coalesce(sum(required*unit_cost),0),
  'components',coalesce(jsonb_agg(to_jsonb(details) ORDER BY item_type,item_id),'[]'::jsonb),
  'suggested_production',coalesce(jsonb_agg(jsonb_build_object('semi_finished_id',item_id,'quantity',shortage)) FILTER(WHERE item_type='semi_finished' AND shortage>0),'[]'::jsonb))
 INTO v_result FROM details;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION factory_private.stocktake(text,jsonb,uuid),factory_private.stock_requirements(jsonb) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;


CREATE FUNCTION factory_private.create_assembly(p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE newid bigint; entry jsonb; cost numeric; qty numeric; total numeric:=0;
BEGIN
 PERFORM factory_private.assert_keys(p_payload,ARRAY['date','notes','items','code']);
 IF p_payload ? 'code' AND (auth.jwt()->>'client_id' IS NOT NULL OR length(btrim(coalesce(p_payload->>'code',''))) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 INSERT INTO bundle_assembly_orders(code,date,notes,status,total_cost) VALUES(coalesce(p_payload->>'code','BA-MCP-'||p_key),(p_payload->>'date')::date,p_payload->>'notes','pending',0) RETURNING id INTO newid;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  PERFORM factory_private.assert_keys(entry,ARRAY['bundle_id','quantity']); qty:=(entry->>'quantity')::numeric;
  IF qty IS NULL OR qty<=0 OR qty>1e9 OR NOT EXISTS(SELECT 1 FROM product_bundles WHERE id=(entry->>'bundle_id')::bigint AND is_active) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  SELECT coalesce(sum(i.quantity*s.unit_cost),0) INTO cost FROM bundle_items i JOIN factory_private.stock_current s ON s.item_type=i.item_type AND s.id=coalesce(i.raw_material_id,i.packaging_material_id,i.semi_finished_product_id,i.finished_product_id) WHERE bundle_id=(entry->>'bundle_id')::bigint;
  INSERT INTO bundle_assembly_order_items(assembly_order_id,bundle_id,quantity,unit_cost,total_cost) VALUES(newid,(entry->>'bundle_id')::bigint,qty,round(cost,2),round(cost*qty,2)); total:=total+cost*qty;
 END LOOP;
 UPDATE bundle_assembly_orders SET total_cost=round(total,2) WHERE id=newid;
 RETURN (SELECT to_jsonb(o)||jsonb_build_object('kind','bundle_assembly','number',o.code) FROM bundle_assembly_orders o WHERE o.id=newid);
END $$;

CREATE FUNCTION factory_private.adjust_inventory(p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE tab text:=factory_private.stock_table(p_payload->>'item_type'); target bigint:=(p_payload->>'item_id')::bigint; qty numeric:=(p_payload->>'quantity')::numeric; oldqty numeric; oldcost numeric; cost numeric;
BEGIN
 PERFORM factory_private.assert_keys(p_payload,ARRAY['item_type','item_id','quantity','unit_cost','reason']);
 IF tab IS NULL OR tab='product_bundles' OR qty IS NULL OR qty NOT BETWEEN 0 AND 1e12 OR length(btrim(coalesce(p_payload->>'reason','')))=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 EXECUTE format('SELECT quantity,unit_cost FROM %I WHERE id=$1 FOR UPDATE',tab) INTO oldqty,oldcost USING target;
 IF oldqty IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF; cost:=coalesce((p_payload->>'unit_cost')::numeric,oldcost);
 IF cost NOT BETWEEN 0 AND 1e12 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 EXECUTE format('UPDATE %I SET quantity=$1,unit_cost=$2,updated_at=now() WHERE id=$3',tab) USING qty,cost,target;
 IF qty<>oldqty THEN PERFORM log_inventory_movement(target,tab,CASE WHEN qty>oldqty THEN 'in' ELSE 'out' END,abs(qty-oldqty),p_payload->>'reason','ADJ-MCP-'||p_key); END IF;
 RETURN jsonb_build_object('kind','inventory_adjustment','number','ADJ-MCP-'||p_key,'status','recorded','item_type',p_payload->>'item_type','item_id',target,'before_quantity',oldqty,'quantity',qty,'before_unit_cost',oldcost,'unit_cost',cost);
END $$;

CREATE FUNCTION public.factory_write(p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE receipt factory_private.write_receipts; answer jsonb; kind text; target bigint; stockdata jsonb; tab text;
 requirements jsonb; production jsonb; production_result jsonb; packaging_result jsonb; state text;
 financial public.financial_transactions;
BEGIN
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF p_action ~ '^(create|update|edit)_(raw_material|packaging_material|semi_finished_product|finished_product|bundle)$' OR p_action='adjust_inventory' OR p_action ~ '^(create|start|record|reconcile|cancel)_stocktake' THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','inventory_officer']);
 ELSIF p_action ~ '^(create|start|complete|cancel)_(production|packaging|bundle_assembly)_order$' OR p_action='fulfill_packaging_order' THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
 ELSIF p_action ~ '^(create|post|void)_(sales|purchase)_(invoice|return)$' OR p_action ~ '^(create|update)_(party|treasury|financial_category)$' OR p_action IN ('record_financial_transaction','transfer_treasury') THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
 ELSIF p_action='delete_financial_transaction' THEN PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
 ELSIF p_action='rename_user' THEN PERFORM factory_private.require_role(ARRAY['admin']);
 ELSE RAISE EXCEPTION 'MCP_TOOL_UNKNOWN'; END IF;
 IF auth.jwt()->>'client_id' IS NOT NULL AND NOT (factory_private.authorize_mcp()->>'can_write')::boolean THEN RAISE EXCEPTION 'MCP_WRITE_FORBIDDEN'; END IF;
 -- Global ordering matches the hardened native completion/posting functions.
 PERFORM factory_private.lock_stock();
 IF p_action IN ('create_production_order','create_packaging_order') THEN RETURN factory_private.foundation_write(p_action,p_payload,p_request_id); END IF;
 INSERT INTO factory_private.write_receipts(user_id,request_id,client_id,action,payload) VALUES(auth.uid(),p_request_id,auth.jwt()->>'client_id',p_action,p_payload) ON CONFLICT DO NOTHING;
 SELECT * INTO receipt FROM factory_private.write_receipts WHERE user_id=auth.uid() AND request_id=p_request_id FOR UPDATE;
 IF receipt.action IS DISTINCT FROM p_action OR receipt.payload IS DISTINCT FROM p_payload OR receipt.client_id IS DISTINCT FROM auth.jwt()->>'client_id' THEN RAISE EXCEPTION 'MCP_REQUEST_CONFLICT'; END IF;
 IF receipt.result IS NOT NULL THEN RETURN receipt.result; END IF;
 IF p_action='delete_financial_transaction' THEN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'MCP_ACTION_FORBIDDEN'; END IF;
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id']);
  SELECT * INTO financial FROM financial_transactions WHERE id=(p_payload->>'id')::bigint FOR UPDATE;
  IF FOUND THEN
   IF financial.party_id IS NOT NULL OR financial.invoice_id IS NOT NULL OR financial.transaction_type='transfer' OR financial.category ~* 'transfer' THEN RAISE EXCEPTION 'MCP_FINANCIAL_REVERSAL_REVIEW_REQUIRED'; END IF;
   PERFORM 1 FROM treasuries WHERE id=financial.treasury_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'MCP_TREASURY_INVALID'; END IF;
   IF financial.transaction_type='income' AND (SELECT balance FROM treasuries WHERE id=financial.treasury_id)<financial.amount THEN RAISE EXCEPTION 'MCP_TREASURY_INSUFFICIENT'; END IF;
   UPDATE treasuries SET balance=balance+CASE WHEN financial.transaction_type='expense' THEN financial.amount ELSE -financial.amount END,updated_at=now() WHERE id=financial.treasury_id;
   DELETE FROM financial_transactions WHERE id=financial.id;
  END IF;
  answer:=jsonb_build_object('kind','financial_transaction','id',p_payload->'id','status','deleted','original',to_jsonb(financial));
 ELSIF p_action='fulfill_packaging_order' THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id']); target:=(p_payload->>'id')::bigint;
  SELECT status INTO state FROM packaging_orders WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  IF state NOT IN ('pending','inProgress','completed') THEN RAISE EXCEPTION 'MCP_TRANSITION_INVALID'; END IF;
  IF state<>'completed' THEN
   requirements:=factory_private.stock_requirements(jsonb_build_object('kind','packaging_order','id',target));
   IF jsonb_array_length(requirements->'suggested_production')>0 THEN
    production:=public.factory_write('create_production_order',jsonb_build_object('date',current_date,'notes','Packaging shortage fulfillment','items',requirements->'suggested_production'),md5(p_request_id::text||':create-production')::uuid)->'record';
    production_result:=public.factory_write('complete_production_order',jsonb_build_object('id',production->'id'),md5(p_request_id::text||':complete-production')::uuid)->'record';
   END IF;
  END IF;
  packaging_result:=public.factory_write('complete_packaging_order',jsonb_build_object('id',target),md5(p_request_id::text||':complete-packaging')::uuid)->'record';
  answer:=packaging_result||jsonb_build_object('production',production_result,'atomic',true);
 ELSIF p_action ~ '^edit_(raw_material|packaging_material|semi_finished_product|finished_product)$' THEN
  IF auth.jwt()->>'client_id' IS NOT NULL AND length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  kind:=regexp_replace(p_action,'^edit_','');
  IF coalesce((p_payload->>'id')::bigint,0)<=0 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  answer:=factory_private.save_master(kind,p_payload-ARRAY['quantity','unit_cost','reason'],p_request_id);
  tab:=factory_private.master_spec(kind)->>'table';
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO stockdata USING (p_payload->>'id')::bigint;
  IF p_payload ? 'quantity' OR (kind IN ('raw_material','packaging_material') AND p_payload ? 'unit_cost') THEN
   PERFORM factory_private.adjust_inventory(jsonb_build_object('item_type',CASE WHEN kind='semi_finished_product' THEN 'semi_finished' ELSE kind END,'item_id',p_payload->'id','quantity',coalesce(p_payload->'quantity',stockdata->'quantity'),'unit_cost',CASE WHEN kind IN ('raw_material','packaging_material') THEN coalesce(p_payload->'unit_cost',stockdata->'unit_cost') ELSE stockdata->'unit_cost' END,'reason',coalesce(p_payload->>'reason','Native item edit')),p_request_id);
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO stockdata USING (p_payload->>'id')::bigint;
  answer:=answer||jsonb_build_object('record',stockdata);
 ELSIF p_action ~ '^(create|update)_(raw_material|packaging_material|semi_finished_product|finished_product|bundle|party|treasury|financial_category)$' THEN
  kind:=regexp_replace(p_action,'^(create|update)_','');
  IF (p_action LIKE 'update_%') IS DISTINCT FROM (p_payload ? 'id') THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  answer:=factory_private.save_master(kind,p_payload,p_request_id);
 ELSIF p_action ~ '^create_(sales|purchase)_(invoice|return)$' THEN answer:=factory_private.create_commercial(p_action,p_payload,p_request_id);
 ELSIF p_action ~ '^(post|void)_(sales|purchase)_(invoice|return)$' THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id']); answer:=factory_private.transition_commercial(p_action,(p_payload->>'id')::bigint,p_request_id);
 ELSIF p_action='create_bundle_assembly_order' THEN answer:=factory_private.create_assembly(p_payload,p_request_id);
 ELSIF p_action ~ '^(start|complete|cancel)_(production|packaging|bundle_assembly)_order$' THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['id']); answer:=factory_private.transition_order(p_action,(p_payload->>'id')::bigint);
 ELSIF p_action='record_financial_transaction' THEN answer:=factory_private.record_finance(p_payload,p_request_id);
 ELSIF p_action='transfer_treasury' THEN answer:=factory_private.transfer_treasury(p_payload,p_request_id);
 ELSIF p_action='adjust_inventory' THEN answer:=factory_private.adjust_inventory(p_payload,p_request_id);
 ELSIF p_action ~ '^(create|start|record|reconcile|cancel)_stocktake' THEN answer:=factory_private.stocktake(p_action,p_payload,p_request_id);
 ELSIF p_action='rename_user' THEN
  PERFORM factory_private.assert_keys(p_payload,ARRAY['user_id','name']);
  IF length(btrim(coalesce(p_payload->>'name','')))=0 OR length(p_payload->>'name')>200 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  UPDATE profiles SET full_name=btrim(p_payload->>'name') WHERE id=(p_payload->>'user_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  UPDATE auth.users SET raw_user_meta_data=coalesce(raw_user_meta_data,'{}')||jsonb_build_object('full_name',btrim(p_payload->>'name')) WHERE id=(p_payload->>'user_id')::uuid;
  answer:=jsonb_build_object('kind','user_name','id',p_payload->>'user_id','name',btrim(p_payload->>'name'),'status','updated');
 ELSE RAISE EXCEPTION 'MCP_TOOL_UNKNOWN'; END IF;
 answer:=jsonb_build_object('request_id',p_request_id,'record',answer);
 UPDATE factory_private.write_receipts SET result=answer WHERE user_id=auth.uid() AND request_id=p_request_id;
 RETURN answer;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA factory_private FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
GRANT EXECUTE ON FUNCTION factory_private.require_role(text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.factory_write(text,jsonb,uuid) FROM PUBLIC,anon,factory_mcp_gateway;
GRANT EXECUTE ON FUNCTION public.factory_write(text,jsonb,uuid) TO authenticated;


-- REVIEW DRAFT ONLY. No live execution; root integrates and tests. Requires foundation migration.
-- Fixed SQL reports; caller never chooses a table, column, SQL expression or ORDER BY fragment.
CREATE TABLE factory_private.report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL, resource text NOT NULL,
  report text NOT NULL, filters jsonb NOT NULL, as_of date NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT statement_timestamp()+interval '30 minutes',
  calculation_basis jsonb NOT NULL, summary jsonb NOT NULL, rows jsonb NOT NULL
);
ALTER TABLE factory_private.report_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON factory_private.report_snapshots FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
CREATE INDEX report_snapshots_expiry ON factory_private.report_snapshots(expires_at);

CREATE FUNCTION factory_private.report_inventory()
RETURNS TABLE(kind text,id bigint,code text,name text,unit text,quantity numeric,min_stock numeric,
  unit_cost numeric,sales_price numeric,active boolean,movement_kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT 'raw_material',id,code,name,unit,quantity,min_stock,unit_cost,sales_price,true,'raw_materials' FROM raw_materials
 UNION ALL SELECT 'packaging_material',id,code,name,unit,quantity,min_stock,unit_cost,sales_price,true,'packaging_materials' FROM packaging_materials
 UNION ALL SELECT 'semi_finished',id,code,name,unit,quantity,min_stock,unit_cost,sales_price,true,'semi_finished_products' FROM semi_finished_products
 UNION ALL SELECT 'finished_product',id,code,name,unit,quantity,min_stock,unit_cost,sales_price,true,'finished_products' FROM finished_products
 UNION ALL SELECT 'bundle',id,code,name,'unit',quantity,min_stock,unit_cost,bundle_price,is_active,'product_bundles' FROM product_bundles;
$$;

CREATE FUNCTION factory_private.report_bundle_cost(p_id bigint)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(sum(bi.quantity*coalesce(CASE bi.item_type
   WHEN 'finished_product' THEN f.unit_cost WHEN 'semi_finished' THEN s.unit_cost
   WHEN 'raw_material' THEN r.unit_cost WHEN 'packaging_material' THEN p.unit_cost END,0)),0)
 FROM bundle_items bi LEFT JOIN finished_products f ON f.id=bi.finished_product_id
 LEFT JOIN semi_finished_products s ON s.id=bi.semi_finished_product_id
 LEFT JOIN raw_materials r ON r.id=bi.raw_material_id
 LEFT JOIN packaging_materials p ON p.id=bi.packaging_material_id WHERE bi.bundle_id=p_id;
$$;

CREATE FUNCTION factory_private.report_operating_category(p_category text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(p_category,'') !~* '(payment|purchase_payment|دفعة مورد|transfer|تحويل)';
$$;

CREATE FUNCTION factory_private.report_pnl(p_start date,p_end date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH v AS (SELECT
   (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date BETWEEN p_start AND p_end) sales_revenue,
   (SELECT coalesce(sum(total_amount),0) FROM sales_returns WHERE status='posted' AND return_date BETWEEN p_start AND p_end) returns_amount,
   (SELECT coalesce(sum(t.amount),0) FROM financial_transactions t WHERE t.transaction_type='income' AND t.transaction_date BETWEEN p_start AND p_end
      AND EXISTS(SELECT 1 FROM financial_categories c WHERE c.name=t.category AND c.type='income')) manual_revenue,
   (SELECT coalesce(sum(i.quantity*coalesce(i.unit_cost_at_sale,0)),0) FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id
      WHERE h.status='posted' AND h.transaction_date BETWEEN p_start AND p_end) sales_cogs,
   (SELECT coalesce(sum(i.quantity*coalesce(i.unit_cost_at_return,0)),0) FROM sales_return_items i JOIN sales_returns h ON h.id=i.return_id
      WHERE h.status='posted' AND h.return_date BETWEEN p_start AND p_end) return_cogs,
   (SELECT coalesce(sum(t.amount),0) FROM financial_transactions t WHERE t.transaction_type='expense' AND t.transaction_date BETWEEN p_start AND p_end
      AND EXISTS(SELECT 1 FROM financial_categories c WHERE c.name=t.category AND c.type='expense')) expenses
 ), q AS(SELECT *,sales_revenue-returns_amount+manual_revenue revenue,sales_cogs-return_cogs cogs FROM v)
 SELECT to_jsonb(q)||jsonb_build_object('gross_profit',revenue-cogs,'net_profit',revenue-cogs-expenses) FROM q;
$$;

CREATE FUNCTION factory_private.report_build(p_report text,p_filters jsonb,p_asof date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rows jsonb:='[]'; summary jsonb:='{}'; basis jsonb; extra jsonb;
  ds date:=coalesce((p_filters->>'start_date')::date,p_asof-(coalesce((p_filters->>'period')::int,30)-1));
  de date:=coalesce((p_filters->>'end_date')::date,p_asof);
  target numeric:=coalesce((p_filters->>'target_margin')::numeric,25);
  fp_id bigint:=(p_filters->>'item_id')::bigint;
BEGIN
 IF ds>de OR de>p_asof OR target<0 OR target>=100 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 basis:=jsonb_build_object('source','current application report formulas','start_date',ds,'end_date',de,
   'as_of',p_asof,'current_balances',false,'currency','EGP','complete_input_set',true);
 IF p_report IN ('inventory','inventory_analytics','low_stock','turnover','pricing_analysis','product_performance') THEN
   basis:=basis||jsonb_build_object('current_balances',true,'as_of_meaning','movement/date cutoff; inventory quantity/cost/price are current at captured_at, not historical');
   WITH base AS (SELECT i.*,quantity*unit_cost value,
     (sales_price-unit_cost)*quantity potential_profit,
     CASE WHEN p_report='inventory_analytics' THEN
       CASE WHEN quantity*unit_cost>0 THEN (sales_price-unit_cost)*quantity/(quantity*unit_cost)*100 ELSE 0 END
       ELSE CASE WHEN sales_price>0 THEN (sales_price-unit_cost)/sales_price*100 ELSE 0 END END margin,
     coalesce((SELECT sum(m.quantity) FROM inventory_movements m WHERE m.item_id=i.id AND m.item_type::text=i.movement_kind
       AND m.movement_type='out' AND m.created_at>=p_asof-90 AND m.created_at<p_asof+1),0) consumed,
     coalesce((SELECT sum(l.quantity) FROM sales_invoice_items l JOIN sales_invoices h ON h.id=l.invoice_id
       WHERE l.finished_product_id=i.id AND i.kind='finished_product' AND h.status='posted' AND h.transaction_date<=p_asof),0) sold,
     coalesce((SELECT sum(l.quantity*l.unit_price) FROM sales_invoice_items l JOIN sales_invoices h ON h.id=l.invoice_id
       WHERE l.finished_product_id=i.id AND i.kind='finished_product' AND h.status='posted' AND h.transaction_date<=p_asof),0) revenue,
     CASE WHEN i.kind='bundle' THEN factory_private.report_bundle_cost(i.id) ELSE i.unit_cost END price_cost
     FROM factory_private.report_inventory() i WHERE (i.kind<>'bundle' OR i.active)
       AND (NOT p_filters?'item_type' OR i.kind=p_filters->>'item_type')
       AND (NOT p_filters?'item_id' OR i.id=fp_id)
       AND (NOT p_filters?'search' OR i.name ILIKE '%'||(p_filters->>'search')||'%' OR i.code ILIKE '%'||(p_filters->>'search')||'%')
   ), filtered AS (SELECT * FROM base WHERE
      (p_report<>'low_stock' OR min_stock>0 AND quantity<=min_stock)
      AND (p_report<>'turnover' OR kind<>'bundle')
      AND (p_report<>'product_performance' OR kind IN ('finished_product','bundle'))
      AND (p_report<>'pricing_analysis' OR kind IN ('finished_product','bundle') OR kind='raw_material' AND sales_price>0)
   ), valued AS(SELECT *,sum(value) OVER() full_value,sum(value) OVER(ORDER BY value DESC,kind,id) cumulative FROM filtered)
   SELECT coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object(
     'row_key',kind||':'||id,'total_cost',price_cost,'amount',value,
     'stock_level',CASE WHEN min_stock>0 THEN round(quantity/min_stock*100) ELSE NULL END,
     'deficit',greatest(0,min_stock-quantity),'urgency',CASE WHEN quantity=0 THEN 'critical' WHEN quantity<=min_stock THEN 'warning' ELSE 'ok' END,
     'turnover',CASE WHEN quantity+consumed/2>0 THEN round(consumed/(quantity+consumed/2)*4,2) ELSE 0 END,
     'days_on_hand',CASE WHEN consumed>0 THEN round(quantity/(consumed/90)) ELSE 999 END,
     'margin_amount',sales_price-price_cost,'margin_percent',CASE WHEN sales_price>0 THEN (sales_price-price_cost)/sales_price*100 ELSE 0 END,
     'margin',CASE WHEN p_report IN('pricing_analysis','product_performance') THEN CASE WHEN sales_price>0 THEN (sales_price-price_cost)/sales_price*100 ELSE 0 END ELSE margin END,
     'suggested_price',price_cost/(1-target/100),'suggested_price25',price_cost/.75,'suggested_price30',price_cost/.70,
     'potential_revenue',sales_price*quantity,
     'abc',CASE WHEN full_value=0 THEN 'C' WHEN cumulative/full_value<=.8 THEN 'A' WHEN cumulative/full_value<=.95 THEN 'B' ELSE 'C' END,
     'cumulative_percent',CASE WHEN full_value>0 THEN cumulative/full_value*100 ELSE 0 END) ORDER BY kind,id),'[]') INTO rows FROM valued v;
   IF p_report='turnover' THEN basis:=basis||jsonb_build_object('turnover_window_days',90,'annualization',4,'average_inventory','current_quantity + consumed/2'); END IF;
   IF p_report='product_performance' THEN basis:=basis||jsonb_build_object('bundle_sales','zero, matching current ProductPerformance source; component cost displayed','sales_window','all posted sales through as_of'); END IF;
 ELSIF p_report='aging' THEN
   WITH docs AS (SELECT 'sales' kind,h.id,h.invoice_number code,h.customer_id party_id,h.transaction_date date,h.total_amount,h.paid_amount FROM sales_invoices h WHERE status='posted'
     UNION ALL SELECT 'purchase',h.id,h.invoice_number,h.supplier_id,h.transaction_date,h.total_amount,h.paid_amount FROM purchase_invoices h WHERE status='posted')
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.kind,q.id),'[]') INTO rows FROM (
     SELECT d.*,p.name,p.type party_type,total_amount-coalesce(paid_amount,0) amount,p_asof-d.date age_days,
       CASE WHEN p_asof-d.date>90 THEN '90+' WHEN p_asof-d.date>60 THEN '61-90' WHEN p_asof-d.date>30 THEN '31-60' ELSE '0-30' END bucket,
       d.kind||':'||d.id row_key FROM docs d LEFT JOIN parties p ON p.id=d.party_id
     WHERE d.date<=p_asof AND total_amount-coalesce(paid_amount,0)>0
       AND (NOT p_filters?'party_id' OR d.party_id=(p_filters->>'party_id')::uuid)
       AND (coalesce(p_filters->>'party_type','all')='all' OR p.type=p_filters->>'party_type')
   ) q;
   basis:=basis||jsonb_build_object('age_basis','invoice transaction date, not contractual due date','paid_amount_basis','current cumulative paid_amount; historical payment rollback unavailable');
 ELSIF p_report='production' THEN
   WITH orders AS (SELECT 'production' kind,id,code,date,status::text,total_cost,created_at FROM production_orders
     UNION ALL SELECT 'packaging',id,code,date,status::text,total_cost,created_at FROM packaging_orders)
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY kind,id),'[]') INTO rows FROM (
     SELECT *,kind||':'||id row_key FROM orders WHERE date BETWEEN ds AND de
       AND (NOT p_filters?'status' OR status=p_filters->>'status')
   ) q;
   SELECT jsonb_build_object('total',count(*),'completed',count(*) FILTER(WHERE j->>'status'='completed'),
     'pending',count(*) FILTER(WHERE j->>'status'='pending'),'in_progress',count(*) FILTER(WHERE j->>'status'='inProgress'),
     'cancelled',count(*) FILTER(WHERE j->>'status'='cancelled'),
     'efficiency_rate',CASE WHEN count(*)>0 THEN round(count(*) FILTER(WHERE j->>'status'='completed')*100.0/count(*)) ELSE 0 END,
     'total_cost',coalesce(sum((j->>'total_cost')::numeric),0)) INTO summary FROM jsonb_array_elements(rows) j;
   basis:=basis||jsonb_build_object('efficiency','completed orders / all filtered orders; full input replaces UI latest50 cap');
 ELSIF p_report='expense_analysis' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY id),'[]') INTO rows FROM (
     SELECT t.id,t.id::text row_key,t.transaction_date date,t.amount,t.category,t.description,tr.name treasury_name
     FROM financial_transactions t LEFT JOIN treasuries tr ON tr.id=t.treasury_id
     WHERE t.transaction_type='expense' AND t.transaction_date BETWEEN ds AND de
       AND (coalesce((p_filters->>'include_payments')::boolean,false) OR t.category !~* '(payment|purchase_payment|دفعة مورد)')
       AND (coalesce((p_filters->>'include_transfers')::boolean,false) OR t.category !~* '(transfer|تحويل)')
       AND (NOT p_filters?'party_id' OR t.party_id=(p_filters->>'party_id')::uuid)
   ) q;
 ELSIF p_report='pnl' THEN
   summary:=factory_private.report_pnl(ds,de); rows:=jsonb_build_array(summary||jsonb_build_object('row_key','pnl'));
   basis:=basis||jsonb_build_object('returns','posted sales returns subtract revenue and historical return COGS','manual_income_expenses','exact configured category name/type; not substring exclusions');
 ELSIF p_report='cost_card' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY id),'[]') INTO rows FROM (
     SELECT f.id,f.id::text row_key,f.code,f.name,f.quantity,f.sales_price,
       coalesce(nullif(f.semi_finished_quantity,0),1) semi_finished_quantity,s.name semi_finished_name,
       coalesce(s.unit_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1) semi_finished_cost,
       coalesce(ing.raw_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1) raw_materials_cost,
       coalesce(ing.components,'[]') raw_materials,coalesce(pkg.components,'[]') packaging_items,coalesce(pkg.cost,0) packaging_cost,
       coalesce(nullif(f.unit_cost,0),coalesce(s.unit_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1)+coalesce(pkg.cost,0)) total_cost,
       f.sales_price-coalesce(nullif(f.unit_cost,0),coalesce(s.unit_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1)+coalesce(pkg.cost,0)) margin_amount,
       CASE WHEN f.sales_price>0 THEN (f.sales_price-coalesce(nullif(f.unit_cost,0),coalesce(s.unit_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1)+coalesce(pkg.cost,0)))/f.sales_price*100 ELSE 0 END margin
     FROM finished_products f LEFT JOIN semi_finished_products s ON s.id=f.semi_finished_id
     LEFT JOIN LATERAL(SELECT sum(r.unit_cost*i.percentage/100) raw_cost,
       jsonb_agg(jsonb_build_object('name',r.name,'percentage',i.percentage,'cost',r.unit_cost*i.percentage/100) ORDER BY i.id) components
       FROM semi_finished_ingredients i JOIN raw_materials r ON r.id=i.raw_material_id WHERE i.semi_finished_id=s.id) ing ON true
     LEFT JOIN LATERAL(SELECT sum(p.unit_cost*i.quantity) cost,
       jsonb_agg(jsonb_build_object('name',p.name,'quantity',i.quantity,'cost',p.unit_cost*i.quantity) ORDER BY i.id) components
       FROM finished_product_packaging i JOIN packaging_materials p ON p.id=i.packaging_material_id WHERE i.finished_product_id=f.id) pkg ON true
     WHERE fp_id IS NULL OR f.id=fp_id
   ) q;
   basis:=basis||jsonb_build_object('current_balances',true,'raw_cost','percentage / 100 source report formula; not order batch cost','total_cost','stored finished WACO when nonzero, else semi WACO quantity plus packaging costs');
 ELSIF p_report='balance_sheet' THEN
   WITH v AS (SELECT
     (SELECT coalesce(sum(quantity*unit_cost),0) FROM factory_private.report_inventory() WHERE kind<>'bundle' OR quantity>0) inventory,
     (SELECT coalesce(sum(balance),0) FROM treasuries) cash,
     (SELECT coalesce(sum(balance),0) FROM parties WHERE type='customer' AND balance>0) receivables,
     (SELECT coalesce(-sum(balance),0) FROM parties WHERE type='supplier' AND balance<0) payables)
   SELECT to_jsonb(v)||jsonb_build_object('assets',inventory+cash+receivables,'liabilities',payables,
     'net_position',inventory+cash+receivables-payables,
     'coverage_ratio',CASE WHEN payables>0 THEN round((inventory+cash+receivables)/payables*100) ELSE 100 END,
     'inventory_breakdown',(SELECT jsonb_agg(to_jsonb(g) ORDER BY kind) FROM(SELECT kind,count(*) count,sum(quantity*unit_cost) value FROM factory_private.report_inventory() WHERE kind<>'bundle' OR quantity>0 GROUP BY kind)g),
     'treasuries',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM(SELECT id,name,type,balance FROM treasuries)t),
     'parties',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM(SELECT id,name,type,balance FROM parties WHERE type='customer' AND balance>0 OR type='supplier' AND balance<0)p)) INTO summary FROM v;
   rows:=jsonb_build_array(summary||jsonb_build_object('row_key','balance_sheet'));
   basis:=basis||jsonb_build_object('current_balances',true,'as_of_meaning','current captured snapshot, historical valuation not available','payable_sign','supplier balance < 0');
 ELSIF p_report='party_analysis' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY id),'[]') INTO rows FROM (
     SELECT p.id,p.id::text row_key,p.name,p.type party_type,p.balance,abs(p.balance) amount,
       coalesce(i.total,0) total_invoices,coalesce(i.amount,0) invoice_amount,coalesce(i.paid,0) paid,
       coalesce(r.total,0) return_count,coalesce(r.amount,0) return_amount,
       CASE WHEN i.amount>0 THEN coalesce(r.amount,0)/i.amount*100 ELSE 0 END return_percentage,
       greatest(i.last_date,r.last_date) last_date,NULL::numeric avg_payment_days
     FROM parties p LEFT JOIN LATERAL(
       SELECT count(*) total,sum(total_amount) amount,sum(paid_amount) paid,max(date) last_date FROM (
         SELECT total_amount,paid_amount,transaction_date date FROM sales_invoices WHERE status='posted' AND customer_id=p.id AND transaction_date<=p_asof
         UNION ALL SELECT total_amount,paid_amount,transaction_date FROM purchase_invoices WHERE status='posted' AND supplier_id=p.id AND transaction_date<=p_asof) a) i ON true
     LEFT JOIN LATERAL(SELECT count(*) total,sum(total_amount) amount,max(date) last_date FROM (
       SELECT total_amount,return_date date FROM sales_returns WHERE status='posted' AND customer_id=p.id AND return_date<=p_asof
       UNION ALL SELECT total_amount,return_date FROM purchase_returns WHERE status='posted' AND supplier_id=p.id AND return_date<=p_asof)a) r ON true
     WHERE (coalesce(p_filters->>'party_type','all')='all' OR p.type=p_filters->>'party_type')
       AND (NOT p_filters?'party_id' OR p.id=(p_filters->>'party_id')::uuid)
   ) q;
   basis:=basis||jsonb_build_object('current_balances',true,'avg_payment_days','not calculable from current app model; null replaces UI placeholder zero','payable_sign','supplier negative; known UI summary sign mismatch is not copied');
 ELSIF p_report IN ('trends','cash_flow') THEN
   WITH days AS(SELECT d::date date FROM generate_series(ds::timestamp,de::timestamp,interval '1 day') d),
   daily AS(SELECT date,
     coalesce((SELECT sum(total_amount) FROM sales_invoices WHERE status='posted' AND transaction_date=d.date),0) revenue,
     coalesce((SELECT sum(paid_amount) FROM sales_invoices WHERE status='posted' AND transaction_date=d.date),0) sales_paid,
     coalesce((SELECT sum(total_amount) FROM purchase_invoices WHERE status='posted' AND transaction_date=d.date),0) purchases,
     coalesce((SELECT sum(paid_amount) FROM purchase_invoices WHERE status='posted' AND transaction_date=d.date),0) purchase_paid,
     coalesce((SELECT sum(i.quantity*coalesce(i.unit_cost_at_sale,0)) FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date=d.date),0) cogs,
     coalesce((SELECT sum(amount) FROM financial_transactions WHERE transaction_type='income' AND transaction_date=d.date),0) other_income,
     coalesce((SELECT sum(amount) FROM financial_transactions WHERE transaction_type='expense' AND transaction_date=d.date AND factory_private.report_operating_category(category)),0) expenses FROM days d)
   SELECT coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('row_key',date,'profit',revenue-cogs-expenses,
     'inflows',sales_paid+other_income,'outflows',purchase_paid+expenses,'net',sales_paid+other_income-purchase_paid-expenses) ORDER BY date),'[]') INTO rows FROM daily v;
   basis:=basis||CASE WHEN p_report='cash_flow' THEN jsonb_build_object('cash_basis','current cumulative invoice paid_amount assigned to invoice date plus all income ledger entries; matches app, not payment-date cash ledger','double_count_warning','invoice-linked receipts may also occur in income entries')
     ELSE jsonb_build_object('profit_basis','posted gross sales - sold historical COGS - expense entries excluding payment/transfer substrings; unlike PNL does not net returns or configured manual income') END;
 ELSIF p_report='product_journey' THEN
   IF fp_id IS NULL OR NOT EXISTS(SELECT 1 FROM finished_products WHERE id=fp_id) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   WITH entries AS(
     SELECT 'production' section,i.id,h.created_at::date date,h.status::text,i.quantity,i.unit_cost,i.total_cost amount,h.id operation_id FROM production_order_items i JOIN production_orders h ON h.id=i.production_order_id JOIN finished_products f ON f.semi_finished_id=i.semi_finished_id WHERE f.id=fp_id
     UNION ALL SELECT 'packaging',i.id,h.created_at::date,h.status::text,i.quantity,i.unit_cost,i.total_cost,h.id FROM packaging_order_items i JOIN packaging_orders h ON h.id=i.packaging_order_id WHERE i.finished_product_id=fp_id
     UNION ALL SELECT 'sales',i.id,h.transaction_date,h.status,i.quantity,i.unit_price,i.quantity*i.unit_price,h.id FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id WHERE i.finished_product_id=fp_id)
   SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('row_key',section||':'||id,
     'unit_price',CASE WHEN section='sales' THEN unit_cost ELSE NULL END,
     'unit_cost',CASE WHEN section='sales' THEN NULL ELSE unit_cost END) ORDER BY section,id),'[]') INTO rows FROM entries e WHERE date BETWEEN ds AND de AND (NOT p_filters?'status' OR status=p_filters->>'status');
   SELECT jsonb_build_object('total_produced',coalesce(sum((j->>'quantity')::numeric) FILTER(WHERE j->>'section'='packaging' AND j->>'status'='completed'),0),
     'total_sold',coalesce(sum((j->>'quantity')::numeric) FILTER(WHERE j->>'section'='sales'),0),
     'total_revenue',coalesce(sum((j->>'amount')::numeric) FILTER(WHERE j->>'section'='sales'),0),
     'cost_cards',factory_private.report_build('cost_card',jsonb_build_object('item_id',fp_id),p_asof)->'rows') INTO summary FROM jsonb_array_elements(rows)j;
   basis:=basis||jsonb_build_object('journey_status','all statuses unless status requested, matching source history query','full_history','UI limit10 removed; cost card in summary');
 ELSIF p_report='dashboard' THEN
   WITH d AS(SELECT coalesce(sum(total_amount),0) daily_sales FROM sales_invoices WHERE created_at>=p_asof AND created_at<p_asof+1)
   SELECT to_jsonb(d)||jsonb_build_object('active_orders',(SELECT count(*) FROM production_orders WHERE status::text IN('pending','inProgress'))+(SELECT count(*) FROM packaging_orders WHERE status::text IN('pending','inProgress')),
     'low_stock_count',(SELECT count(*) FROM raw_materials WHERE quantity<=min_stock),'cash_balance',(SELECT coalesce(sum(balance),0) FROM treasuries)) INTO summary FROM d;
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY id),'[]') INTO rows FROM(
     SELECT a.id,a.id::text row_key,a.action,a.table_name,a.created_at,p.full_name user_name FROM audit_logs a LEFT JOIN profiles p ON p.id=a.user_id WHERE a.created_at<p_asof+1
   )q;
   basis:=basis||jsonb_build_object('current_balances',true,'daily_sales','created_at day, all statuses; source Dashboard RPC','audit','full history through as_of, replaces recent10 presentation');
 ELSIF p_report='decision_support' THEN
   -- Preserve source executive gross-sales/historical-COGS formula, distinct from named PNL.
   WITH v AS(SELECT
     (SELECT coalesce(sum(balance),0) FROM treasuries) treasury_balance,
     (SELECT coalesce(sum(balance),0) FROM parties WHERE type='customer' AND balance>0) receivables,
     (SELECT coalesce(-sum(balance),0) FROM parties WHERE type='supplier' AND balance<0) payables,
     (SELECT count(*) FROM production_orders WHERE status='pending') pending_production,
     (SELECT count(*) FROM packaging_orders WHERE status='pending') pending_packaging,
     (SELECT coalesce(sum(total_cost),0) FROM production_orders WHERE status='pending') production_value,
     (SELECT coalesce(sum(total_cost),0) FROM packaging_orders WHERE status='pending') packaging_value,
     (SELECT coalesce(p_asof-min(date),0) FROM(SELECT date FROM production_orders WHERE status='pending' UNION ALL SELECT date FROM packaging_orders WHERE status='pending')x) oldest_pending_days,
     (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date BETWEEN p_asof-30 AND p_asof) revenue30d,
     (SELECT coalesce(sum(i.quantity*coalesce(i.unit_cost_at_sale,0)),0) FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date BETWEEN p_asof-30 AND p_asof) cogs30d,
     (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date>=p_asof-60 AND transaction_date<p_asof-30) previous_revenue30d,
     (SELECT coalesce(sum(i.quantity*coalesce(i.unit_cost_at_sale,0)),0) FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date>=p_asof-60 AND h.transaction_date<p_asof-30) previous_cogs30d)
   SELECT to_jsonb(v)||jsonb_build_object('net_cash',treasury_balance+receivables-payables,'gross_margin',revenue30d-cogs30d,
     'gross_margin_percent',CASE WHEN revenue30d>0 THEN round((revenue30d-cogs30d)/revenue30d*100) ELSE 0 END,
     'revenue_change',CASE WHEN previous_revenue30d>0 THEN round((revenue30d-previous_revenue30d)/previous_revenue30d*100) ELSE 0 END,
     'margin_change',round(CASE WHEN revenue30d>0 THEN (revenue30d-cogs30d)/revenue30d*100 ELSE 0 END-CASE WHEN previous_revenue30d>0 THEN (previous_revenue30d-previous_cogs30d)/previous_revenue30d*100 ELSE 0 END)) INTO summary FROM v;
   -- Flat rows, so coverage, product and trend details can actually be paged.
   WITH usage AS(SELECT item_id,sum(quantity)/30 avg_daily_usage FROM inventory_movements
     WHERE item_type::text='raw_materials' AND movement_type='out' AND created_at>=p_asof-30 AND created_at<p_asof+1 GROUP BY item_id)
   SELECT coalesce(jsonb_agg(jsonb_build_object('row_key','coverage:'||r.id,'section','coverage','id',r.id,'name',r.name,
     'quantity',r.quantity,'min_stock',r.min_stock,'avg_daily_usage',round(u.avg_daily_usage,2),
     'days_left',round(r.quantity/u.avg_daily_usage),'status',CASE WHEN r.quantity/u.avg_daily_usage<7 THEN 'critical' WHEN r.quantity/u.avg_daily_usage<14 THEN 'warning' ELSE 'ok' END) ORDER BY r.id),'[]') INTO rows
     FROM raw_materials r JOIN usage u ON u.item_id=r.id WHERE u.avg_daily_usage>0;
   SELECT coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('row_key','product:'||id,'section','profitability_products') ORDER BY id),'[]') INTO extra FROM(
     SELECT f.id,f.name,sum(i.quantity*i.unit_price) revenue,sum(i.quantity*(i.unit_price-coalesce(i.unit_cost_at_sale,0))) margin
     FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id JOIN finished_products f ON f.id=i.finished_product_id
     WHERE h.status='posted' AND h.transaction_date BETWEEN p_asof-30 AND p_asof GROUP BY f.id,f.name)q;
   rows:=rows||extra;
   SELECT coalesce(jsonb_agg(j||jsonb_build_object('section','trends','row_key','trend:'||(j->>'date')) ORDER BY j->>'date'),'[]') INTO extra
     FROM jsonb_array_elements(factory_private.report_build('trends',jsonb_build_object('start_date',p_asof-29,'end_date',p_asof),p_asof)->'rows')j;
   rows:=rows||extra;
   WITH stats AS(SELECT
     (SELECT count(*) FROM raw_materials WHERE min_stock>0 AND quantity<min_stock) raw_low,
     (SELECT count(*) FROM packaging_materials WHERE min_stock>0 AND quantity<min_stock) packaging_low,
     (SELECT count(*) FROM production_orders WHERE status='pending' AND date<p_asof-7) old_production,
     (SELECT count(*) FROM sales_invoices WHERE status='posted' AND transaction_date<p_asof-60 AND total_amount-coalesce(paid_amount,0)>0) overdue,
     (SELECT coalesce(sum(total_amount-coalesce(paid_amount,0)),0) FROM sales_invoices WHERE status='posted' AND transaction_date<p_asof-60 AND total_amount-coalesce(paid_amount,0)>0) overdue_amount,
     (SELECT count(*) FROM treasuries WHERE balance<0) negative_treasury,
     (SELECT count(*) FROM finished_products WHERE sales_price>0 AND unit_cost>sales_price) negative_margin,
     (SELECT count(*) FROM finished_products WHERE sales_price>0 AND (sales_price-unit_cost)/sales_price>=0 AND (sales_price-unit_cost)/sales_price<.15) low_margin,
     (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date BETWEEN p_asof-7 AND p_asof) this_week,
     (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date>=p_asof-14 AND transaction_date<p_asof-7) last_week,
     (SELECT count(*) FROM finished_products f WHERE quantity>0 AND NOT EXISTS(SELECT 1 FROM inventory_movements m WHERE m.item_type::text='finished_products' AND m.item_id=f.id AND m.created_at>=p_asof-30 AND m.created_at<p_asof+1)) stagnant),
   alerts AS(SELECT a.* FROM stats s CROSS JOIN LATERAL(VALUES
     ('low-stock-raw',CASE WHEN raw_low>5 THEN 'critical' ELSE 'warning' END,'inventory',raw_low::numeric,raw_low>0,'/reports/low-stock'),
     ('low-stock-pkg',CASE WHEN packaging_low>3 THEN 'critical' ELSE 'warning' END,'inventory',packaging_low::numeric,packaging_low>0,'/reports/low-stock'),
     ('pending-production','warning','production',old_production::numeric,old_production>0,'/production/orders'),
     ('overdue-receivables','critical','finance',overdue_amount,overdue>0,'/reports/aging'),
     ('negative-treasury','critical','finance',negative_treasury::numeric,negative_treasury>0,'/treasuries'),
     ('negative-margin','critical','sales',negative_margin::numeric,negative_margin>0,'/reports/pricing-analysis'),
     ('low-margin','warning','sales',low_margin::numeric,negative_margin=0 AND low_margin>0,'/reports/pricing-analysis'),
     ('declining-sales','warning','sales',CASE WHEN last_week>0 THEN round((last_week-this_week)/last_week*100) ELSE 0 END,last_week>0 AND this_week<last_week*.7,'/reports/trends'),
     ('supplier-payables',CASE WHEN (summary->>'payables')::numeric>50000 THEN 'warning' ELSE 'info' END,'finance',(summary->>'payables')::numeric,(summary->>'payables')::numeric>0,'/reports/aging'),
     ('stagnant-inventory','info','inventory',stagnant::numeric,stagnant>0,'/reports/inventory-analytics'))a(id,severity,category,value,shown,path) WHERE shown)
   SELECT coalesce(jsonb_agg(jsonb_build_object('row_key','alert:'||id,'section','alert','id',id,'severity',severity,'category',category,'value',value,'path',path) ORDER BY id),'[]') INTO extra FROM alerts;
   rows:=rows||extra;
   basis:=basis||jsonb_build_object('current_balances',true,'coverage_columns','uses actual movement_type/created_at, correcting source direction/movement_date mismatch',
     'profitability','source posted gross sales/historical sold COGS; source current30d window includes both cutoff dates',
     'detail_scope','all profitability products instead of only top5; all alert types with numeric evidence, UI labels omitted');
 ELSE RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 -- Full summary from the materialized set, before ORDER/LIMIT. Each named report retains section-specific summary.
 IF jsonb_typeof(summary)<>'object' THEN summary:=jsonb_build_object('details',summary); END IF;
 SELECT jsonb_build_object('row_count',count(*),'amount',coalesce(sum((j->>'amount')::numeric),0),
   'value',coalesce(sum((j->>'value')::numeric),0),'revenue',coalesce(sum((j->>'revenue')::numeric),0),
   'quantity',coalesce(sum((j->>'quantity')::numeric),0),'expenses',coalesce(sum((j->>'expenses')::numeric),0),
   'average_margin',coalesce(avg((j->>'margin')::numeric),0),'potential_profit',coalesce(sum((j->>'potential_profit')::numeric),0),
   'categories',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY category),'[]') FROM(
       SELECT x->>'category' category,count(*) count,sum((x->>'amount')::numeric) amount
       FROM jsonb_array_elements(rows)x WHERE x?'category' GROUP BY x->>'category')g),
   'group_totals',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY group_key),'[]') FROM(
       SELECT coalesce(x->>'bucket',x->>'kind',x->>'party_type',x->>'section') group_key,count(*) count,
         coalesce(sum((x->>'amount')::numeric),0) amount,coalesce(sum((x->>'value')::numeric),0) value,
         count(*) FILTER(WHERE x->>'status'='completed') completed,count(*) FILTER(WHERE x->>'status'='pending') pending,
       count(*) FILTER(WHERE x->>'urgency'='critical') critical,
       count(*) FILTER(WHERE (x->>'turnover')::numeric<2 AND (x->>'consumed')::numeric>0) slow_moving,
       count(*) FILTER(WHERE (x->>'turnover')::numeric>=6) fast_moving,
       count(*) FILTER(WHERE (x->>'consumed')::numeric=0 AND (x->>'quantity')::numeric>0) dead_stock
       FROM jsonb_array_elements(rows)x GROUP BY coalesce(x->>'bucket',x->>'kind',x->>'party_type',x->>'section'))g),
   'profit',coalesce(sum((j->>'profit')::numeric),0),'inflows',coalesce(sum((j->>'inflows')::numeric),0),
   'outflows',coalesce(sum((j->>'outflows')::numeric),0),'net',coalesce(sum((j->>'net')::numeric),0),
   'average_amount',coalesce(avg((j->>'amount')::numeric),0),
   'monthly',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY month),'[]') FROM(
       SELECT left(x->>'date',7) AS month,coalesce(sum((x->>'revenue')::numeric),0) revenue,
       coalesce(sum((x->>'cogs')::numeric),0) cogs,coalesce(sum((x->>'purchases')::numeric),0) purchases,
       coalesce(sum((x->>'expenses')::numeric),0) expenses,coalesce(sum((x->>'profit')::numeric),0) profit,
       coalesce(sum((x->>'inflows')::numeric),0) inflows,coalesce(sum((x->>'outflows')::numeric),0) outflows,
       coalesce(sum((x->>'net')::numeric),0) net FROM jsonb_array_elements(rows)x WHERE x?'date' GROUP BY left(x->>'date',7))g))||summary INTO summary FROM jsonb_array_elements(rows)j;
 IF p_report='trends' THEN
   summary:=summary||jsonb_build_object('previous_sales',(SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date>=ds-(de-ds+1) AND transaction_date<ds),
     'previous_purchases',(SELECT coalesce(sum(total_amount),0) FROM purchase_invoices WHERE status='posted' AND transaction_date>=ds-(de-ds+1) AND transaction_date<ds));
 END IF;
 RETURN jsonb_build_object('rows',rows,'summary',summary,'calculation_basis',basis);
END $$;

CREATE FUNCTION factory_private.report_page(p_args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE snap factory_private.report_snapshots; result jsonb; filters jsonb; page jsonb;
  report_name text:=p_args->>'report'; cutoff date:=coalesce((p_args->>'as_of')::date,current_date);
  offset_n int:=coalesce((p_args->>'offset')::int,0); limit_n int:=coalesce((p_args->>'limit')::int,100);
  sort_name text:=coalesce(p_args->>'sort_by','name'); descending boolean:=coalesce((p_args->>'descending')::boolean,false);
  allowed text[];
BEGIN
 PERFORM factory_private.authorize_mcp(); -- current approval/profile/session checked again for every page
 allowed:=ARRAY['report','snapshot_id','offset','limit','as_of','sort_by','descending']||CASE
  WHEN report_name IN ('inventory','inventory_analytics','low_stock','turnover','pricing_analysis','product_performance') THEN ARRAY['item_type','item_id','search','target_margin']
  WHEN report_name='aging' THEN ARRAY['party_id','party_type']
  WHEN report_name='production' THEN ARRAY['start_date','end_date','period','status']
  WHEN report_name='expense_analysis' THEN ARRAY['start_date','end_date','period','party_id','include_payments','include_transfers']
  WHEN report_name='party_analysis' THEN ARRAY['party_id','party_type']
  WHEN report_name='cost_card' THEN ARRAY['item_id']
  WHEN report_name='product_journey' THEN ARRAY['item_id','start_date','end_date','period','status']
  WHEN report_name IN ('pnl','cash_flow','trends') THEN ARRAY['start_date','end_date','period'] ELSE ARRAY[]::text[] END;
 PERFORM factory_private.assert_keys(p_args,allowed);
 IF report_name NOT IN('dashboard','pnl','balance_sheet','cash_flow','aging','inventory','inventory_analytics','low_stock','turnover','production','product_performance','decision_support','party_analysis','expense_analysis','cost_card','pricing_analysis','trends','product_journey')
   OR report_name IS NULL OR offset_n<0 OR limit_n NOT BETWEEN 1 AND 250 OR cutoff>current_date
   OR sort_name NOT IN('name','date','quantity','value','revenue','margin','amount','age_days','turnover','total_cost') THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 filters:=p_args-ARRAY['snapshot_id','offset','limit','report'];
 IF p_args?'snapshot_id' THEN
   SELECT * INTO snap FROM factory_private.report_snapshots WHERE id=(p_args->>'snapshot_id')::uuid
     AND user_id=auth.uid() AND client_id=auth.jwt()->>'client_id' AND resource=auth.jwt()->>'aud'
     AND expires_at>statement_timestamp() AND report=report_name;
   IF NOT FOUND THEN RAISE EXCEPTION 'MCP_REPORT_SNAPSHOT_UNAVAILABLE'; END IF;
   -- Continuation may omit original filters; explicitly supplied filters must match their captured values.
   IF EXISTS(SELECT 1 FROM jsonb_each(filters) f WHERE snap.filters->f.key IS DISTINCT FROM f.value) THEN RAISE EXCEPTION 'MCP_REPORT_FILTER_CONFLICT'; END IF;
   sort_name:=snap.filters->>'sort_by';
   descending:=(snap.filters->>'descending')::boolean;
 ELSE
   filters:=filters||jsonb_build_object('as_of',cutoff,'sort_by',sort_name,'descending',descending);
   result:=factory_private.report_build(report_name,filters,cutoff);
   INSERT INTO factory_private.report_snapshots(user_id,client_id,resource,report,filters,as_of,calculation_basis,summary,rows)
     VALUES(auth.uid(),auth.jwt()->>'client_id',auth.jwt()->>'aud',report_name,filters,cutoff,result->'calculation_basis',result->'summary',result->'rows') RETURNING * INTO snap;
 END IF;
 -- Numeric sort never lexicographic. Fixed expression mapping, row_key is the deterministic tiebreak.
 SELECT coalesce(jsonb_agg(j ORDER BY ordinal),'[]') INTO page FROM(
   SELECT j,row_number() OVER(ORDER BY
     CASE WHEN sort_name IN('name','date') AND NOT descending THEN j->>sort_name END ASC NULLS LAST,
     CASE WHEN sort_name IN('name','date') AND descending THEN j->>sort_name END DESC NULLS LAST,
     CASE WHEN sort_name NOT IN('name','date') AND NOT descending THEN (j->>sort_name)::numeric END ASC NULLS LAST,
     CASE WHEN sort_name NOT IN('name','date') AND descending THEN (j->>sort_name)::numeric END DESC NULLS LAST,
     j->>'row_key') ordinal FROM jsonb_array_elements(snap.rows)j
   )q WHERE ordinal>offset_n AND ordinal<=offset_n+limit_n;
 RETURN jsonb_build_object('snapshot_id',snap.id,'report',snap.report,'filters',snap.filters,'as_of',snap.as_of,
   'captured_at',snap.captured_at,'expires_at',snap.expires_at,'calculation_basis',snap.calculation_basis,
   'summary',snap.summary,'total_count',jsonb_array_length(snap.rows),'offset',offset_n,'limit',limit_n,
   'has_more',offset_n+limit_n<jsonb_array_length(snap.rows),'next_offset',CASE WHEN offset_n+limit_n<jsonb_array_length(snap.rows) THEN offset_n+limit_n ELSE NULL END,'rows',page);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA factory_private FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
-- Integrator calls factory_private.report_page from the existing gated dispatcher; do not expose directly.


ALTER FUNCTION public.factory_mcp_query(text,jsonb) SET SCHEMA factory_private;
ALTER FUNCTION factory_private.factory_mcp_query(text,jsonb) RENAME TO foundation_query;
REVOKE ALL ON FUNCTION factory_private.foundation_query(text,jsonb) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

CREATE FUNCTION factory_private.business_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY['treasuries','raw_materials','packaging_materials','parties','financial_categories','semi_finished_products','semi_finished_ingredients','finished_products','finished_product_packaging','product_bundles','bundle_items','production_orders','packaging_orders','bundle_assembly_orders','production_order_items','production_order_consumed_materials','packaging_order_items','packaging_order_consumed_materials','bundle_assembly_order_items','purchase_invoices','sales_invoices','purchase_invoice_items','sales_invoice_items','purchase_returns','sales_returns','purchase_return_items','sales_return_items','financial_transactions','inventory_count_sessions','inventory_count_items','inventory_movements']::text[];
$$;
CREATE FUNCTION factory_private.resource_access(p_resource text) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT p_resource=ANY(factory_private.business_tables()||ARRAY['profiles','audit_logs']) THEN RAISE EXCEPTION 'MCP_RESOURCE_FORBIDDEN'; END IF;
 IF p_resource IN ('profiles','audit_logs') THEN PERFORM factory_private.require_role(ARRAY['admin']);
 ELSIF p_resource ~ '^(sales|purchase|financial|parties|treasuries)' THEN PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
 ELSIF p_resource ~ '^(production|packaging_order|bundle_assembly)' THEN PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
 ELSE PERFORM factory_private.require_role(ARRAY['admin','manager','inventory_officer','production_officer','accountant']); END IF;
END $$;
CREATE FUNCTION factory_private.data_page(p_name text,p_rows jsonb,p_summary jsonb,p_args jsonb,p_basis jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE snap factory_private.report_snapshots; page jsonb; off integer:=coalesce((p_args->>'offset')::integer,0); lim integer:=coalesce((p_args->>'limit')::integer,100); filters jsonb:=p_args-ARRAY['offset','limit','snapshot_id'];
BEGIN
 IF off<0 OR lim NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF p_args ? 'snapshot_id' THEN
  SELECT * INTO snap FROM factory_private.report_snapshots WHERE id=(p_args->>'snapshot_id')::uuid AND report=p_name AND user_id=auth.uid() AND client_id=auth.jwt()->>'client_id' AND resource=auth.jwt()->>'aud' AND expires_at>statement_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'MCP_REPORT_SNAPSHOT_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(filters)f WHERE snap.filters->f.key IS DISTINCT FROM f.value) THEN RAISE EXCEPTION 'MCP_REPORT_FILTER_CONFLICT'; END IF;
 ELSE
  INSERT INTO factory_private.report_snapshots(user_id,client_id,resource,report,filters,as_of,calculation_basis,summary,rows) VALUES(auth.uid(),auth.jwt()->>'client_id',auth.jwt()->>'aud',p_name,filters,current_date,p_basis,p_summary,coalesce(p_rows,'[]')) RETURNING * INTO snap;
 END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO page FROM jsonb_array_elements(snap.rows) WITH ORDINALITY t(value,ord) WHERE ord>off AND ord<=off+lim;
 RETURN jsonb_build_object('snapshot_id',snap.id,'captured_at',snap.captured_at,'expires_at',snap.expires_at,'filters',snap.filters,'calculation_basis',snap.calculation_basis,'summary',snap.summary,'total_count',jsonb_array_length(snap.rows),'offset',off,'limit',lim,'rows',page,'has_more',off+lim<jsonb_array_length(snap.rows),'next_offset',CASE WHEN off+lim<jsonb_array_length(snap.rows) THEN off+lim ELSE NULL END);
END $$;

CREATE FUNCTION factory_private.list_resource(p_resource text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE rows jsonb; summary jsonb;
BEGIN
 PERFORM factory_private.resource_access(p_resource);
 IF p_args ? 'snapshot_id' THEN RETURN factory_private.data_page('resource:'||p_resource,NULL,NULL,p_args,NULL); END IF;
 -- p_resource can only be an exact developer-owned identifier from business_tables.
 EXECUTE format('SELECT coalesce(jsonb_agg(j ORDER BY j->>''id''),''[]'') FROM (SELECT to_jsonb(t) j FROM public.%I t) q WHERE ($1->>''search'' IS NULL OR strpos(lower(coalesce(j->>''name'',j->>''product_name'',j->>''description'',j->>''notes'','''')||'' ''||coalesce(j->>''code'',j->>''invoice_number'',j->>''return_number'','''')),lower($1->>''search''))>0) AND ($1->>''status'' IS NULL OR j->>''status''=$1->>''status'') AND ($1->>''party_id'' IS NULL OR coalesce(j->>''party_id'',j->>''customer_id'',j->>''supplier_id'')=$1->>''party_id'') AND ($1->>''item_type'' IS NULL OR j->>''item_type''=CASE WHEN $1->>''resource''=''inventory_movements'' THEN factory_private.stock_table($1->>''item_type'') ELSE $1->>''item_type'' END) AND ($1->>''item_id'' IS NULL OR j->>''item_id''=$1->>''item_id'') AND ($1->>''start_date'' IS NULL OR substr(coalesce(j->>''transaction_date'',j->>''return_date'',j->>''date'',j->>''created_at''),1,10)>=$1->>''start_date'') AND ($1->>''end_date'' IS NULL OR substr(coalesce(j->>''transaction_date'',j->>''return_date'',j->>''date'',j->>''created_at''),1,10)<=$1->>''end_date'') AND ($1->>''parent_id'' IS NULL OR coalesce(j->>''invoice_id'',j->>''return_id'',j->>''production_order_id'',j->>''packaging_order_id'',j->>''assembly_order_id'',j->>''session_id'',j->>''bundle_id'',j->>''semi_finished_id'',j->>''finished_product_id'')=$1->>''parent_id'')',p_resource) INTO rows USING p_args;
 SELECT jsonb_build_object('count',count(*),'quantity',coalesce(sum((j->>'quantity')::numeric),0),'value',coalesce(sum((j->>'quantity')::numeric*(j->>'unit_cost')::numeric),0),'total_amount',coalesce(sum((j->>'total_amount')::numeric),0),'paid_amount',coalesce(sum((j->>'paid_amount')::numeric),0),'balance',coalesce(sum((j->>'balance')::numeric),0),'total_cost',coalesce(sum((j->>'total_cost')::numeric),0)) INTO summary FROM jsonb_array_elements(rows)j;
 RETURN factory_private.data_page('resource:'||p_resource,rows,summary,p_args,jsonb_build_object('ordering','stable captured id text order','scope','all filtered records at captured_at','current_balances',true));
END $$;

CREATE FUNCTION factory_private.get_record(p_resource text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE header jsonb; child text; parentkey text; lines jsonb; rows jsonb;
BEGIN
 PERFORM factory_private.resource_access(p_resource);
 PERFORM factory_private.assert_keys(p_args,ARRAY['resource','id','snapshot_id','offset','limit']);
 child:=CASE p_resource WHEN 'semi_finished_products' THEN 'semi_finished_ingredients' WHEN 'finished_products' THEN 'finished_product_packaging' WHEN 'product_bundles' THEN 'bundle_items' WHEN 'sales_invoices' THEN 'sales_invoice_items' WHEN 'purchase_invoices' THEN 'purchase_invoice_items' WHEN 'sales_returns' THEN 'sales_return_items' WHEN 'purchase_returns' THEN 'purchase_return_items' WHEN 'production_orders' THEN 'production_order_items' WHEN 'packaging_orders' THEN 'packaging_order_items' WHEN 'bundle_assembly_orders' THEN 'bundle_assembly_order_items' WHEN 'inventory_count_sessions' THEN 'inventory_count_items' END;
 parentkey:=CASE p_resource WHEN 'semi_finished_products' THEN 'semi_finished_id' WHEN 'finished_products' THEN 'finished_product_id' WHEN 'product_bundles' THEN 'bundle_id' WHEN 'sales_invoices' THEN 'invoice_id' WHEN 'purchase_invoices' THEN 'invoice_id' WHEN 'sales_returns' THEN 'return_id' WHEN 'purchase_returns' THEN 'return_id' WHEN 'production_orders' THEN 'production_order_id' WHEN 'packaging_orders' THEN 'packaging_order_id' WHEN 'bundle_assembly_orders' THEN 'assembly_order_id' WHEN 'inventory_count_sessions' THEN 'session_id' END;
 IF NOT p_args?'snapshot_id' THEN
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text=$1',p_resource) INTO header USING p_args->>'id';
  IF header IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  IF child IS NOT NULL THEN EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),''[]'') FROM public.%I t WHERE %I::text=$1',child,parentkey) INTO rows USING p_args->>'id'; ELSE rows:='[]'; END IF;
 END IF;
 lines:=factory_private.data_page('record:'||p_resource||':'||(p_args->>'id'),rows,jsonb_build_object('count',jsonb_array_length(coalesce(rows,'[]'))),p_args,jsonb_build_object('header',header,'line_resource',child,'scope','header and every child line frozen together'));
 RETURN jsonb_build_object('resource',p_resource,'record',lines->'calculation_basis'->'header','line_resource',child,'lines',lines,'read_at',lines->'captured_at');
END $$;

CREATE FUNCTION factory_private.statement(p_kind text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE rows jsonb; summary jsonb; target text; balance numeric; offset_balance numeric; opening numeric; credits numeric; debits numeric; ds date:=coalesce((p_args->>'start_date')::date,'1900-01-01'); de date:=coalesce((p_args->>'end_date')::date,current_date);
BEGIN
 PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
 target:=p_args->>CASE WHEN p_kind='party' THEN 'party_id' ELSE 'treasury_id' END;
 IF target IS NULL OR ds>de THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 IF p_args ? 'snapshot_id' THEN RETURN factory_private.data_page(p_kind||'_statement:'||target,NULL,NULL,p_args,NULL); END IF;
 IF p_kind='party' THEN
  SELECT p.balance INTO balance FROM parties p WHERE id=target::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  SELECT balance-coalesce(sum(debit-credit),0) INTO offset_balance FROM ledger_entries WHERE party_id=target::uuid;
  SELECT offset_balance+coalesce(sum(debit-credit),0) INTO opening FROM ledger_entries WHERE party_id=target::uuid AND transaction_date<ds;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY transaction_date,created_at,id),'[]'),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO rows,debits,credits FROM (SELECT l.*,opening+sum(debit-credit)OVER(ORDER BY transaction_date,created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) running_balance FROM ledger_entries l WHERE party_id=target::uuid AND transaction_date BETWEEN ds AND de)q;
 ELSE
  SELECT t.balance INTO balance FROM treasuries t WHERE id=target::bigint; IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  SELECT balance-coalesce(sum(CASE WHEN transaction_type='income' THEN amount ELSE -amount END),0) INTO offset_balance FROM financial_transactions WHERE treasury_id=target::bigint;
  SELECT offset_balance+coalesce(sum(CASE WHEN transaction_type='income' THEN amount ELSE -amount END),0) INTO opening FROM financial_transactions WHERE treasury_id=target::bigint AND transaction_date<ds;
  WITH entries AS(SELECT t.*,CASE WHEN transaction_type='income' THEN amount ELSE 0 END debit,CASE WHEN transaction_type='expense' THEN amount ELSE 0 END credit FROM financial_transactions t WHERE treasury_id=target::bigint AND transaction_date BETWEEN ds AND de)
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY transaction_date,created_at,id),'[]'),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO rows,debits,credits FROM(SELECT e.*,opening+sum(debit-credit)OVER(ORDER BY transaction_date,created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) running_balance FROM entries e)q;
 END IF;
 summary:=jsonb_build_object('opening_balance',opening,'debit',debits,'credit',credits,'closing_balance',opening+debits-credits,'current_balance',balance,'opening_adjustment',offset_balance,'start_date',ds,'end_date',de);
 RETURN factory_private.data_page(p_kind||'_statement:'||target,rows,summary,p_args,jsonb_build_object('opening_basis','current balance minus all recorded ledger net; includes opening/manual adjustments, not zero assumption','debit_credit','party: expense debit/income credit; treasury: income debit/expense credit','scope','complete date-filtered entries including transfer sides'));
END $$;

CREATE TABLE factory_private.backup_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,client_id text NOT NULL,resource text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT statement_timestamp(),expires_at timestamptz NOT NULL DEFAULT statement_timestamp()+interval '30 minutes',
 tables jsonb NOT NULL,data jsonb NOT NULL
);
ALTER TABLE factory_private.backup_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON factory_private.backup_snapshots FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
CREATE FUNCTION factory_private.backup(p_kind text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE snap factory_private.backup_snapshots; tab text; all_data jsonb:='{}'; manifest jsonb:='[]'; rows jsonb; page jsonb;
 off int:=coalesce((p_args->>'offset')::int,0); lim int:=coalesce((p_args->>'limit')::int,100);
BEGIN
 PERFORM factory_private.require_role(ARRAY['admin']);
 IF p_kind='backup_manifest' THEN
  PERFORM factory_private.assert_keys(p_args,ARRAY[]::text[]);
  FOREACH tab IN ARRAY factory_private.business_tables() LOOP
   EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id::text),''[]'') FROM public.%I t',tab) INTO rows;
   all_data:=all_data||jsonb_build_object(tab,rows);manifest:=manifest||jsonb_build_array(jsonb_build_object('table',tab,'count',jsonb_array_length(rows)));
  END LOOP;
  DELETE FROM factory_private.backup_snapshots WHERE expires_at<statement_timestamp();
  INSERT INTO factory_private.backup_snapshots(user_id,client_id,resource,tables,data) VALUES(auth.uid(),auth.jwt()->>'client_id',auth.jwt()->>'aud',manifest,all_data) RETURNING * INTO snap;
  RETURN jsonb_build_object('snapshot_id',snap.id,'version','1.0','app_name','new-factory-sys','captured_at',snap.captured_at,'expires_at',snap.expires_at,'tables',manifest,'table_count',jsonb_array_length(manifest),'record_count',(SELECT sum((j->>'count')::bigint) FROM jsonb_array_elements(manifest)j),'excluded',ARRAY['profiles','auth','credentials'],'export_instructions','Export every manifest table with this same snapshot_id; all tables were captured in one repeatable-read transaction.');
 END IF;
 PERFORM factory_private.assert_keys(p_args,ARRAY['table','snapshot_id','offset','limit']);
 tab:=p_args->>'table';IF NOT tab=ANY(factory_private.business_tables()) OR off<0 OR lim NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID';END IF;
 SELECT * INTO snap FROM factory_private.backup_snapshots WHERE id=(p_args->>'snapshot_id')::uuid AND user_id=auth.uid() AND client_id=auth.jwt()->>'client_id' AND resource=auth.jwt()->>'aud' AND expires_at>statement_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'MCP_BACKUP_SNAPSHOT_UNAVAILABLE';END IF;
 rows:=snap.data->tab;
 SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') INTO page FROM jsonb_array_elements(rows) WITH ORDINALITY t(value,ord) WHERE ord>off AND ord<=off+lim;
 RETURN jsonb_build_object('snapshot_id',snap.id,'table',tab,'captured_at',snap.captured_at,'expires_at',snap.expires_at,'total_count',jsonb_array_length(rows),'offset',off,'limit',lim,'has_more',off+lim<jsonb_array_length(rows),'next_offset',CASE WHEN off+lim<jsonb_array_length(rows) THEN off+lim ELSE NULL END,'rows',page);
END $$;

CREATE FUNCTION public.factory_mcp_query(p_kind text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tab text; answer jsonb; action text; route text;
BEGIN
 PERFORM factory_private.authorize_mcp();
 IF p_kind IN ('customers','finished_products','semi_finished_products','operation') THEN RETURN factory_private.foundation_query(p_kind,p_payload); END IF;
 IF p_kind='report' THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','accountant','production_officer']); RETURN factory_private.report_page(p_payload);
 ELSIF p_kind='list_records' THEN RETURN factory_private.list_resource(p_payload->>'resource',p_payload);
 ELSIF p_kind='get_record' THEN RETURN factory_private.get_record(p_payload->>'resource',p_payload);
 ELSIF p_kind IN ('party_statement','treasury_statement') THEN RETURN factory_private.statement(split_part(p_kind,'_',1),p_payload);
 ELSIF p_kind='stock_requirements' THEN RETURN factory_private.stock_requirements(p_payload);
 ELSIF p_kind='list_users' THEN PERFORM factory_private.require_role(ARRAY['admin']); RETURN factory_private.list_resource('profiles',p_payload);
 ELSIF p_kind IN ('backup_manifest','backup_export') THEN RETURN factory_private.backup(p_kind,p_payload);
 ELSIF p_kind='protected_handoff' THEN
  PERFORM factory_private.require_role(ARRAY['admin']); action:=p_payload->>'action';
  IF action IN ('create_user','change_user_role','change_user_status','reset_password','delete_user') THEN
   route:='/settings/users';
   IF action<>'create_user' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=(p_payload->>'user_id')::uuid) THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  ELSIF action IN ('download_cloud_backup','restore_backup','factory_reset') THEN route:='/settings/system';
  ELSIF action IN ('delete_record','delete_financial_transaction') THEN
   IF action='delete_financial_transaction' THEN tab:='financial_transactions'; ELSE tab:=p_payload->>'resource'; END IF;
   PERFORM factory_private.resource_access(tab); answer:=factory_private.get_record(tab,jsonb_build_object('id',p_payload->'record_id','limit',1));
   IF tab='financial_transactions' AND ((answer->'record'->>'party_id') IS NOT NULL OR (answer->'record'->>'invoice_id') IS NOT NULL OR answer->'record'->>'transaction_type'='transfer' OR answer->'record'->>'category' ~* 'transfer') THEN
    RETURN jsonb_build_object('executed',false,'status','blocked_reversal_requires_review','action',action,'target',p_payload,'path',CASE WHEN answer->'record'->>'invoice_type'='sales' THEN '/commercial/selling' WHEN answer->'record'->>'invoice_type'='purchase' THEN '/commercial/buying' ELSE '/commercial/payments' END,'warning','Linked invoice/party/transfer entries cannot be deleted independently. Review the original operation and use its supported reversal; otherwise this action is unsupported.');
   END IF;
   route:=CASE tab WHEN 'raw_materials' THEN '/inventory/raw-materials' WHEN 'packaging_materials' THEN '/inventory/packaging' WHEN 'semi_finished_products' THEN '/inventory/semi-finished' WHEN 'finished_products' THEN '/inventory/finished' WHEN 'product_bundles' THEN '/inventory/bundles' WHEN 'bundle_assembly_orders' THEN '/inventory/bundles/assembly' WHEN 'inventory_count_sessions' THEN '/inventory/stocktaking' WHEN 'sales_invoices' THEN '/commercial/selling' WHEN 'purchase_invoices' THEN '/commercial/buying' WHEN 'sales_returns' THEN '/commercial/returns' WHEN 'purchase_returns' THEN '/commercial/returns' WHEN 'parties' THEN '/commercial/parties' WHEN 'treasuries' THEN '/commercial/treasuries' WHEN 'financial_transactions' THEN '/financial/expenses' WHEN 'financial_categories' THEN '/financial/expenses' WHEN 'production_orders' THEN '/production/orders' WHEN 'packaging_orders' THEN '/packaging' ELSE NULL END;
  IF route IS NULL THEN RAISE EXCEPTION 'MCP_ACTION_FORBIDDEN'; END IF;
  ELSE RAISE EXCEPTION 'MCP_ACTION_FORBIDDEN'; END IF;
  RETURN jsonb_build_object('executed',false,'status','awaiting_specific_human_approval','action',action,'target',p_payload,'path',route,'requires_first_party_admin_session',true,'approval_scope','exact target/action only; no password or credential may be entered in MCP','warning',CASE WHEN action IN ('restore_backup','factory_reset','delete_user','delete_record','delete_financial_transaction') THEN 'Existing action can irreversibly delete data; review and complete it in the signed-in native UI.' ELSE 'Complete this specific protected action in the signed-in native UI.' END);
 ELSE RAISE EXCEPTION 'MCP_TOOL_UNKNOWN'; END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA factory_private FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
GRANT EXECUTE ON FUNCTION factory_private.require_role(text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.factory_mcp_query(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.factory_mcp_query(text,jsonb) TO factory_mcp_gateway;
