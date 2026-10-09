-- DRAFT ONLY: no execution, roles, credentials, OAuth rows or business table grants.
-- Requires factory OAuth migration and existing authenticated SELECT/RLS configuration.
-- Root must create actual migration through CLI; this file has no migration timestamp.
CREATE FUNCTION factory_mcp_auth.readonly_access() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
DECLARE claims jsonb:=auth.jwt(); actor uuid:=auth.uid(); access jsonb; actor_role text;
BEGIN
 IF actor IS NULL OR claims->>'sub' IS DISTINCT FROM actor::text
   OR claims->>'role' IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'MCP_ANALYTICS_FORBIDDEN'; END IF;
 SELECT p.role::text INTO actor_role FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.id=actor AND p.is_active AND NOT coalesce(u.is_anonymous,false);
 IF actor_role IS NULL OR actor_role NOT IN('admin','manager','accountant','production_officer','inventory_officer','viewer')
 THEN RAISE EXCEPTION 'MCP_ANALYTICS_FORBIDDEN'; END IF;
 access:=factory_mcp_auth.oauth_access(actor,(claims->>'session_id')::uuid,(claims->>'client_id')::uuid,claims->>'scope');
 IF access IS NULL OR access->>'resource' IS DISTINCT FROM claims->>'aud' THEN RAISE EXCEPTION 'MCP_ANALYTICS_FORBIDDEN'; END IF;
 RETURN jsonb_build_object('user_id',actor,'role',actor_role,'resource',access->>'resource','expires_at',access->>'expires_at');
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'MCP_ANALYTICS_FORBIDDEN';
END $body$;
ALTER FUNCTION factory_mcp_auth.readonly_access() OWNER TO postgres;
REVOKE ALL ON FUNCTION factory_mcp_auth.readonly_access() FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
GRANT USAGE ON SCHEMA factory_mcp_auth TO authenticated;
GRANT EXECUTE ON FUNCTION factory_mcp_auth.readonly_access() TO authenticated;

CREATE FUNCTION factory_private.analytics_metadata() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $body$
 SELECT $metadata${"version":1,"tables":{"raw_materials":{"domain":"inventory","columns":{"id":"bigint","code":"text","name":"text","unit":"text","quantity":"numeric","min_stock":"numeric","unit_cost":"numeric","sales_price":"numeric","created_at":"timestamptz","updated_at":"timestamptz","importance":"integer"}},"packaging_materials":{"domain":"inventory","columns":{"id":"bigint","code":"text","name":"text","unit":"text","quantity":"numeric","min_stock":"numeric","unit_cost":"numeric","sales_price":"numeric","created_at":"timestamptz","updated_at":"timestamptz"}},"semi_finished_products":{"domain":"inventory","columns":{"id":"bigint","code":"text","name":"text","unit":"text","quantity":"numeric","min_stock":"numeric","unit_cost":"numeric","sales_price":"numeric","created_at":"timestamptz","updated_at":"timestamptz","recipe_batch_size":"numeric"}},"finished_products":{"domain":"inventory","columns":{"id":"bigint","code":"text","name":"text","unit":"text","quantity":"numeric","min_stock":"numeric","unit_cost":"numeric","sales_price":"numeric","created_at":"timestamptz","updated_at":"timestamptz","semi_finished_id":"bigint","semi_finished_quantity":"numeric"}},"product_bundles":{"domain":"inventory","columns":{"id":"bigint","code":"text","name":"text","quantity":"numeric","min_stock":"numeric","unit_cost":"numeric","bundle_price":"numeric","is_active":"boolean","created_at":"timestamptz","updated_at":"timestamptz"}},"parties":{"domain":"finance","columns":{"id":"uuid","name":"text","type":"text","balance":"numeric","credit_limit":"numeric","created_at":"timestamptz","updated_at":"timestamptz"}},"treasuries":{"domain":"finance","columns":{"id":"bigint","name":"text","type":"text","balance":"numeric","currency":"text","created_at":"timestamptz","updated_at":"timestamptz"}},"financial_categories":{"domain":"finance","columns":{"id":"bigint","name":"text","type":"text","is_system":"boolean","created_at":"timestamptz"}},"financial_transactions":{"domain":"finance","columns":{"id":"bigint","treasury_id":"bigint","party_id":"uuid","amount":"numeric","transaction_type":"text","category":"text","reference_type":"text","reference_id":"text","transaction_date":"date","invoice_id":"bigint","invoice_type":"text","created_at":"timestamptz"}},"sales_invoices":{"domain":"finance","columns":{"id":"bigint","invoice_number":"text","customer_id":"uuid","treasury_id":"bigint","transaction_date":"date","total_amount":"numeric","paid_amount":"numeric","tax_amount":"numeric","discount_amount":"numeric","shipping_cost":"numeric","status":"text","created_at":"timestamptz","updated_at":"timestamptz"}},"purchase_invoices":{"domain":"finance","columns":{"id":"bigint","invoice_number":"text","supplier_id":"uuid","treasury_id":"bigint","transaction_date":"date","total_amount":"numeric","paid_amount":"numeric","tax_amount":"numeric","discount_amount":"numeric","shipping_cost":"numeric","status":"text","created_at":"timestamptz","updated_at":"timestamptz"}},"sales_invoice_items":{"domain":"finance","columns":{"id":"bigint","item_type":"text","raw_material_id":"bigint","packaging_material_id":"bigint","finished_product_id":"bigint","semi_finished_product_id":"bigint","quantity":"numeric","unit_price":"numeric","total_price":"numeric","invoice_id":"bigint","unit_cost_at_sale":"numeric","bundle_id":"bigint"}},"purchase_invoice_items":{"domain":"finance","columns":{"id":"bigint","item_type":"text","raw_material_id":"bigint","packaging_material_id":"bigint","finished_product_id":"bigint","semi_finished_product_id":"bigint","quantity":"numeric","unit_price":"numeric","total_price":"numeric","invoice_id":"bigint"}},"sales_returns":{"domain":"finance","columns":{"id":"bigint","return_number":"text","original_invoice_id":"bigint","customer_id":"uuid","return_date":"date","total_amount":"numeric","status":"text","created_at":"timestamptz","updated_at":"timestamptz"}},"purchase_returns":{"domain":"finance","columns":{"id":"bigint","return_number":"text","original_invoice_id":"bigint","supplier_id":"uuid","return_date":"date","total_amount":"numeric","status":"text","created_at":"timestamptz","updated_at":"timestamptz"}},"sales_return_items":{"domain":"finance","columns":{"id":"bigint","item_type":"text","raw_material_id":"bigint","packaging_material_id":"bigint","finished_product_id":"bigint","semi_finished_product_id":"bigint","quantity":"numeric","unit_price":"numeric","total_price":"numeric","created_at":"timestamptz","return_id":"bigint","unit_cost_at_return":"numeric","bundle_id":"bigint"}},"purchase_return_items":{"domain":"finance","columns":{"id":"bigint","item_type":"text","raw_material_id":"bigint","packaging_material_id":"bigint","finished_product_id":"bigint","semi_finished_product_id":"bigint","quantity":"numeric","unit_price":"numeric","total_price":"numeric","created_at":"timestamptz","return_id":"bigint"}},"production_orders":{"domain":"production","columns":{"id":"bigint","code":"text","date":"date","status":"text","total_cost":"numeric","created_at":"timestamptz","updated_at":"timestamptz"}},"packaging_orders":{"domain":"production","columns":{"id":"bigint","code":"text","date":"date","status":"text","total_cost":"numeric","created_at":"timestamptz","updated_at":"timestamptz"}},"bundle_assembly_orders":{"domain":"production","columns":{"id":"bigint","code":"text","date":"date","status":"text","total_cost":"numeric","created_at":"timestamptz","updated_at":"timestamptz"}},"production_order_items":{"domain":"production","columns":{"id":"bigint","production_order_id":"bigint","semi_finished_id":"bigint","quantity":"numeric","unit_cost":"numeric","total_cost":"numeric","created_at":"timestamptz"}},"packaging_order_items":{"domain":"production","columns":{"id":"bigint","packaging_order_id":"bigint","finished_product_id":"bigint","quantity":"numeric","unit_cost":"numeric","total_cost":"numeric","created_at":"timestamptz"}},"bundle_assembly_order_items":{"domain":"production","columns":{"id":"bigint","assembly_order_id":"bigint","bundle_id":"bigint","quantity":"numeric","unit_cost":"numeric","total_cost":"numeric","created_at":"timestamptz"}},"semi_finished_ingredients":{"domain":"inventory","columns":{"id":"bigint","semi_finished_id":"bigint","raw_material_id":"bigint","percentage":"numeric","quantity":"numeric","created_at":"timestamptz"}},"finished_product_packaging":{"domain":"inventory","columns":{"id":"bigint","finished_product_id":"bigint","packaging_material_id":"bigint","quantity":"numeric","created_at":"timestamptz"}},"bundle_items":{"domain":"inventory","columns":{"id":"bigint","bundle_id":"bigint","item_type":"text","finished_product_id":"bigint","semi_finished_product_id":"bigint","raw_material_id":"bigint","packaging_material_id":"bigint","quantity":"numeric","unit_cost":"numeric","created_at":"timestamptz"}},"production_order_consumed_materials":{"domain":"production","columns":{"id":"bigint","production_order_id":"bigint","raw_material_id":"bigint","quantity":"numeric","unit_cost":"numeric","total_cost":"numeric","created_at":"timestamptz"}},"packaging_order_consumed_materials":{"domain":"production","columns":{"id":"bigint","packaging_order_id":"bigint","item_id":"bigint","item_type":"text","quantity":"numeric","unit_cost":"numeric","total_cost":"numeric","created_at":"timestamptz"}},"inventory_count_sessions":{"domain":"inventory","columns":{"id":"bigint","code":"text","date":"date","type":"text","status":"text","created_at":"timestamptz","updated_at":"timestamptz"}},"inventory_count_items":{"domain":"inventory","columns":{"id":"bigint","session_id":"bigint","item_type":"text","item_id":"bigint","product_name":"text","unit":"text","system_quantity":"numeric","counted_quantity":"numeric","difference":"numeric","unit_cost":"numeric","cost_impact":"numeric","created_at":"timestamptz"}},"inventory_movements":{"domain":"inventory","columns":{"id":"bigint","item_id":"bigint","item_type":"text","movement_type":"text","quantity":"numeric","previous_balance":"numeric","new_balance":"numeric","reference_id":"text","created_at":"timestamptz"}}},"relationships":{"sales_invoices.customer_id":{"left_table":"sales_invoices","left_column":"customer_id","right_table":"parties","right_column":"id"},"sales_returns.customer_id":{"left_table":"sales_returns","left_column":"customer_id","right_table":"parties","right_column":"id"},"purchase_invoices.supplier_id":{"left_table":"purchase_invoices","left_column":"supplier_id","right_table":"parties","right_column":"id"},"purchase_returns.supplier_id":{"left_table":"purchase_returns","left_column":"supplier_id","right_table":"parties","right_column":"id"},"sales_invoices.treasury_id":{"left_table":"sales_invoices","left_column":"treasury_id","right_table":"treasuries","right_column":"id"},"purchase_invoices.treasury_id":{"left_table":"purchase_invoices","left_column":"treasury_id","right_table":"treasuries","right_column":"id"},"financial_transactions.treasury_id":{"left_table":"financial_transactions","left_column":"treasury_id","right_table":"treasuries","right_column":"id"},"financial_transactions.party_id":{"left_table":"financial_transactions","left_column":"party_id","right_table":"parties","right_column":"id"},"sales_invoice_items.invoice_id":{"left_table":"sales_invoice_items","left_column":"invoice_id","right_table":"sales_invoices","right_column":"id"},"sales_return_items.return_id":{"left_table":"sales_return_items","left_column":"return_id","right_table":"sales_returns","right_column":"id"},"sales_returns.original_invoice_id":{"left_table":"sales_returns","left_column":"original_invoice_id","right_table":"sales_invoices","right_column":"id"},"sales_invoice_items.raw_material_id":{"left_table":"sales_invoice_items","left_column":"raw_material_id","right_table":"raw_materials","right_column":"id"},"sales_invoice_items.packaging_material_id":{"left_table":"sales_invoice_items","left_column":"packaging_material_id","right_table":"packaging_materials","right_column":"id"},"sales_invoice_items.finished_product_id":{"left_table":"sales_invoice_items","left_column":"finished_product_id","right_table":"finished_products","right_column":"id"},"sales_invoice_items.semi_finished_product_id":{"left_table":"sales_invoice_items","left_column":"semi_finished_product_id","right_table":"semi_finished_products","right_column":"id"},"sales_return_items.raw_material_id":{"left_table":"sales_return_items","left_column":"raw_material_id","right_table":"raw_materials","right_column":"id"},"sales_return_items.packaging_material_id":{"left_table":"sales_return_items","left_column":"packaging_material_id","right_table":"packaging_materials","right_column":"id"},"sales_return_items.finished_product_id":{"left_table":"sales_return_items","left_column":"finished_product_id","right_table":"finished_products","right_column":"id"},"sales_return_items.semi_finished_product_id":{"left_table":"sales_return_items","left_column":"semi_finished_product_id","right_table":"semi_finished_products","right_column":"id"},"purchase_invoice_items.invoice_id":{"left_table":"purchase_invoice_items","left_column":"invoice_id","right_table":"purchase_invoices","right_column":"id"},"purchase_return_items.return_id":{"left_table":"purchase_return_items","left_column":"return_id","right_table":"purchase_returns","right_column":"id"},"purchase_returns.original_invoice_id":{"left_table":"purchase_returns","left_column":"original_invoice_id","right_table":"purchase_invoices","right_column":"id"},"purchase_invoice_items.raw_material_id":{"left_table":"purchase_invoice_items","left_column":"raw_material_id","right_table":"raw_materials","right_column":"id"},"purchase_invoice_items.packaging_material_id":{"left_table":"purchase_invoice_items","left_column":"packaging_material_id","right_table":"packaging_materials","right_column":"id"},"purchase_invoice_items.finished_product_id":{"left_table":"purchase_invoice_items","left_column":"finished_product_id","right_table":"finished_products","right_column":"id"},"purchase_invoice_items.semi_finished_product_id":{"left_table":"purchase_invoice_items","left_column":"semi_finished_product_id","right_table":"semi_finished_products","right_column":"id"},"purchase_return_items.raw_material_id":{"left_table":"purchase_return_items","left_column":"raw_material_id","right_table":"raw_materials","right_column":"id"},"purchase_return_items.packaging_material_id":{"left_table":"purchase_return_items","left_column":"packaging_material_id","right_table":"packaging_materials","right_column":"id"},"purchase_return_items.finished_product_id":{"left_table":"purchase_return_items","left_column":"finished_product_id","right_table":"finished_products","right_column":"id"},"purchase_return_items.semi_finished_product_id":{"left_table":"purchase_return_items","left_column":"semi_finished_product_id","right_table":"semi_finished_products","right_column":"id"},"sales_invoice_items.bundle_id":{"left_table":"sales_invoice_items","left_column":"bundle_id","right_table":"product_bundles","right_column":"id"},"sales_return_items.bundle_id":{"left_table":"sales_return_items","left_column":"bundle_id","right_table":"product_bundles","right_column":"id"},"finished_products.semi_finished_id":{"left_table":"finished_products","left_column":"semi_finished_id","right_table":"semi_finished_products","right_column":"id"},"semi_finished_ingredients.semi_finished_id":{"left_table":"semi_finished_ingredients","left_column":"semi_finished_id","right_table":"semi_finished_products","right_column":"id"},"semi_finished_ingredients.raw_material_id":{"left_table":"semi_finished_ingredients","left_column":"raw_material_id","right_table":"raw_materials","right_column":"id"},"finished_product_packaging.finished_product_id":{"left_table":"finished_product_packaging","left_column":"finished_product_id","right_table":"finished_products","right_column":"id"},"finished_product_packaging.packaging_material_id":{"left_table":"finished_product_packaging","left_column":"packaging_material_id","right_table":"packaging_materials","right_column":"id"},"production_order_items.production_order_id":{"left_table":"production_order_items","left_column":"production_order_id","right_table":"production_orders","right_column":"id"},"production_order_items.semi_finished_id":{"left_table":"production_order_items","left_column":"semi_finished_id","right_table":"semi_finished_products","right_column":"id"},"packaging_order_items.packaging_order_id":{"left_table":"packaging_order_items","left_column":"packaging_order_id","right_table":"packaging_orders","right_column":"id"},"packaging_order_items.finished_product_id":{"left_table":"packaging_order_items","left_column":"finished_product_id","right_table":"finished_products","right_column":"id"},"bundle_assembly_order_items.assembly_order_id":{"left_table":"bundle_assembly_order_items","left_column":"assembly_order_id","right_table":"bundle_assembly_orders","right_column":"id"},"bundle_assembly_order_items.bundle_id":{"left_table":"bundle_assembly_order_items","left_column":"bundle_id","right_table":"product_bundles","right_column":"id"},"bundle_items.bundle_id":{"left_table":"bundle_items","left_column":"bundle_id","right_table":"product_bundles","right_column":"id"},"bundle_items.finished_product_id":{"left_table":"bundle_items","left_column":"finished_product_id","right_table":"finished_products","right_column":"id"},"bundle_items.semi_finished_product_id":{"left_table":"bundle_items","left_column":"semi_finished_product_id","right_table":"semi_finished_products","right_column":"id"},"bundle_items.raw_material_id":{"left_table":"bundle_items","left_column":"raw_material_id","right_table":"raw_materials","right_column":"id"},"bundle_items.packaging_material_id":{"left_table":"bundle_items","left_column":"packaging_material_id","right_table":"packaging_materials","right_column":"id"},"production_order_consumed_materials.production_order_id":{"left_table":"production_order_consumed_materials","left_column":"production_order_id","right_table":"production_orders","right_column":"id"},"production_order_consumed_materials.raw_material_id":{"left_table":"production_order_consumed_materials","left_column":"raw_material_id","right_table":"raw_materials","right_column":"id"},"packaging_order_consumed_materials.packaging_order_id":{"left_table":"packaging_order_consumed_materials","left_column":"packaging_order_id","right_table":"packaging_orders","right_column":"id"},"inventory_count_items.session_id":{"left_table":"inventory_count_items","left_column":"session_id","right_table":"inventory_count_sessions","right_column":"id"}},"excluded":["auth","storage","system catalogs","profiles","audit_logs","ledger_entries view","credentials","freeform notes","contact details","bank account numbers"],"limits":{"joins":5,"selects":20,"filters":20,"group_by":10,"limit":250}}$metadata$::jsonb;
$body$;
CREATE FUNCTION factory_private.analytics_keys(v jsonb,allowed text[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $body$
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE NOT k=ANY(allowed))
 THEN RAISE EXCEPTION 'MCP_ANALYTICS_INPUT_INVALID'; END IF;
END $body$;
CREATE FUNCTION factory_private.analytics_table(p_table text,p_role text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path='' AS $body$
DECLARE domain text:=factory_private.analytics_metadata()->'tables'->p_table->>'domain';
BEGIN
 IF domain IS NULL OR NOT(
 p_role='admin' OR p_role='manager' OR
 domain='finance' AND p_role='accountant' OR
 domain='production' AND p_role='production_officer' OR
 domain='inventory' AND p_role IN('accountant','production_officer','inventory_officer'))
 THEN RAISE EXCEPTION 'MCP_ANALYTICS_TABLE_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=p_table AND c.relkind IN('r','p')
   AND NOT pg_catalog.pg_has_role('authenticated',c.relowner,'MEMBER')
   AND pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT'))
 THEN RAISE EXCEPTION 'MCP_ANALYTICS_RLS_PREREQUISITE'; END IF;
END $body$;
CREATE FUNCTION factory_private.analytics_field(f jsonb,aliases jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $body$
DECLARE t text; typ text;
BEGIN
 PERFORM factory_private.analytics_keys(f,ARRAY['alias','column']);
 t:=aliases->>(f->>'alias'); typ:=factory_private.analytics_metadata()->'tables'->t->'columns'->>(f->>'column');
 IF t IS NULL OR typ IS NULL THEN RAISE EXCEPTION 'MCP_ANALYTICS_FIELD_FORBIDDEN'; END IF;
 RETURN jsonb_build_object('sql',CASE WHEN typ='text' THEN pg_catalog.format('(%I.%I)::text',f->>'alias',f->>'column')
   ELSE pg_catalog.format('%I.%I',f->>'alias',f->>'column') END,'type',typ);
END $body$;
CREATE FUNCTION factory_private.analytics_expr(e jsonb,aliases jsonb,allow_aggregate boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $body$
DECLARE l jsonb; r jsonb; inner_expr jsonb; fn text;
BEGIN
 IF e->>'kind'='column' THEN
   PERFORM factory_private.analytics_keys(e,ARRAY['kind','field']);
   RETURN factory_private.analytics_field(e->'field',aliases)||'{"aggregate":false}'::jsonb;
 ELSIF e->>'kind'='product' THEN
   PERFORM factory_private.analytics_keys(e,ARRAY['kind','left','right']);
   l:=factory_private.analytics_field(e->'left',aliases); r:=factory_private.analytics_field(e->'right',aliases);
   IF l->>'type' NOT IN('bigint','integer','numeric') OR r->>'type' NOT IN('bigint','integer','numeric')
   THEN RAISE EXCEPTION 'MCP_ANALYTICS_PRODUCT_INVALID'; END IF;
   RETURN jsonb_build_object('sql',pg_catalog.format('((%s)::numeric * (%s)::numeric)',l->>'sql',r->>'sql'),'type','numeric','aggregate',false);
 ELSIF e->>'kind'='aggregate' AND allow_aggregate THEN
   PERFORM factory_private.analytics_keys(e,ARRAY['kind','fn','expr']); fn:=e->>'fn';
   IF fn IS NULL OR fn NOT IN('count','sum','avg','min','max') THEN RAISE EXCEPTION 'MCP_ANALYTICS_AGGREGATE_INVALID'; END IF;
   IF NOT e?'expr' THEN
     IF fn<>'count' THEN RAISE EXCEPTION 'MCP_ANALYTICS_AGGREGATE_INVALID'; END IF;
     RETURN '{"sql":"count(*)","type":"bigint","aggregate":true}'::jsonb;
   END IF;
   inner_expr:=factory_private.analytics_expr(e->'expr',aliases,false);
   IF fn IN('sum','avg') AND inner_expr->>'type' NOT IN('bigint','integer','numeric')
     OR fn IN('min','max') AND inner_expr->>'type'='boolean' THEN RAISE EXCEPTION 'MCP_ANALYTICS_AGGREGATE_INVALID'; END IF;
   RETURN jsonb_build_object('sql',pg_catalog.format('%s(%s)',fn,inner_expr->>'sql'),
     'type',CASE WHEN fn='count' THEN 'bigint' WHEN fn IN('sum','avg') THEN 'numeric' ELSE inner_expr->>'type' END,'aggregate',true);
 END IF;
 RAISE EXCEPTION 'MCP_ANALYTICS_EXPRESSION_INVALID';
END $body$;

CREATE FUNCTION public.factory_mcp_schema(p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $body$
DECLARE access jsonb; metadata jsonb:=factory_private.analytics_metadata(); tables jsonb:='{}'; relations jsonb:='{}'; entry record;
BEGIN
 IF current_user<>'authenticated' OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
   OR current_setting('transaction_read_only')<>'on' THEN RAISE EXCEPTION 'MCP_ANALYTICS_EXECUTOR_INVALID'; END IF;
 PERFORM factory_private.analytics_keys(p_input,ARRAY['table']); access:=factory_mcp_auth.readonly_access();
 IF p_input?'table' AND NOT metadata->'tables'?(p_input->>'table') THEN RAISE EXCEPTION 'MCP_ANALYTICS_TABLE_FORBIDDEN'; END IF;
 FOR entry IN SELECT * FROM jsonb_each(metadata->'tables') LOOP
   IF NOT p_input?'table' OR entry.key=p_input->>'table' THEN
     -- Denied tables are omitted from discovery; queries fail closed. No private metadata is included.
     IF access->>'role' IN('admin','manager')
       OR entry.value->>'domain'='finance' AND access->>'role'='accountant'
       OR entry.value->>'domain'='production' AND access->>'role'='production_officer'
       OR entry.value->>'domain'='inventory' AND access->>'role' IN('accountant','production_officer','inventory_officer')
     THEN tables:=tables||jsonb_build_object(entry.key,entry.value); END IF;
   END IF;
 END LOOP;
 FOR entry IN SELECT * FROM jsonb_each(metadata->'relationships') LOOP
   IF tables?(entry.value->>'left_table') AND tables?(entry.value->>'right_table') THEN relations:=relations||jsonb_build_object(entry.key,entry.value); END IF;
 END LOOP;
 RETURN metadata||jsonb_build_object('tables',tables,'relationships',relations,'user_role',access->>'role','rls','existing authenticated source SELECT/RLS; no table privilege expansion');
END $body$;
ALTER FUNCTION public.factory_mcp_schema(jsonb) OWNER TO authenticated;
REVOKE ALL ON FUNCTION public.factory_mcp_schema(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.factory_mcp_schema(jsonb) TO factory_mcp_gateway;

CREATE FUNCTION public.factory_mcp_analyze(p_query jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $body$
DECLARE access jsonb; metadata jsonb:=factory_private.analytics_metadata(); aliases jsonb:='{}'; outputs jsonb:='{}';
  joins jsonb:=coalesce(p_query->'joins','[]'); selects jsonb:=p_query->'select';
  filters jsonb:=coalesce(p_query->'filters','[]'); groups jsonb:=coalesce(p_query->'group_by','[]');
  orders jsonb:=coalesce(p_query->'order_by','[]'); item jsonb; exp jsonb; relation jsonb; f jsonb;
  from_sql text; select_sql text:=''; where_sql text:='TRUE'; group_sql text:=''; order_sql text:='';
  statement text; result jsonb; base_alias text; from_table text; join_table text; from_column text; to_column text;
  output_name text; operator text; typ text; path text; rhs text; index_n integer:=0;
  off integer:=coalesce((p_query->>'offset')::integer,0); lim integer:=coalesce((p_query->>'limit')::integer,100);
  aggregate_present boolean:=false; grouped boolean; field_count integer:=0; column_item jsonb;
BEGIN
 IF current_user<>'authenticated' OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
   OR current_setting('transaction_read_only')<>'on' OR current_setting('transaction_isolation')<>'repeatable read'
 THEN RAISE EXCEPTION 'MCP_ANALYTICS_EXECUTOR_INVALID'; END IF;
 access:=factory_mcp_auth.readonly_access();
 PERFORM factory_private.analytics_keys(p_query,ARRAY['from','joins','select','filters','group_by','order_by','offset','limit']);
 PERFORM factory_private.analytics_keys(p_query->'from',ARRAY['table','alias']);
 IF jsonb_typeof(joins) IS DISTINCT FROM 'array' OR jsonb_array_length(joins)>5 OR jsonb_typeof(selects) IS DISTINCT FROM 'array' OR jsonb_array_length(selects) NOT BETWEEN 1 AND 20
   OR jsonb_typeof(filters) IS DISTINCT FROM 'array' OR jsonb_array_length(filters)>20 OR jsonb_typeof(groups) IS DISTINCT FROM 'array' OR jsonb_array_length(groups)>10
   OR jsonb_typeof(orders) IS DISTINCT FROM 'array' OR jsonb_array_length(orders)>20 OR off NOT BETWEEN 0 AND 1000000 OR lim NOT BETWEEN 1 AND 250
 THEN RAISE EXCEPTION 'MCP_ANALYTICS_INPUT_INVALID'; END IF;
 base_alias:=p_query->'from'->>'alias'; from_table:=p_query->'from'->>'table';
 IF base_alias IS NULL OR base_alias NOT IN('a0','a1','a2','a3','a4','a5') THEN RAISE EXCEPTION 'MCP_ANALYTICS_ALIAS_INVALID'; END IF;
 PERFORM factory_private.analytics_table(from_table,access->>'role');
 aliases:=jsonb_build_object(base_alias,from_table);
 from_sql:=pg_catalog.format('public.%I AS %I',from_table,base_alias);
 FOR item IN SELECT value FROM jsonb_array_elements(joins) LOOP
   PERFORM factory_private.analytics_keys(item,ARRAY['relationship','from_alias','alias','type']);
   relation:=metadata->'relationships'->(item->>'relationship');
   IF relation IS NULL OR NOT aliases?(item->>'from_alias') OR item->>'alias' IS NULL
     OR item->>'alias' NOT IN('a0','a1','a2','a3','a4','a5') OR aliases?(item->>'alias')
     OR item->>'type' IS NULL OR item->>'type' NOT IN('inner','left') THEN RAISE EXCEPTION 'MCP_ANALYTICS_JOIN_INVALID'; END IF;
   IF aliases->>(item->>'from_alias')=relation->>'left_table' THEN
     join_table:=relation->>'right_table'; from_column:=relation->>'left_column'; to_column:=relation->>'right_column';
   ELSIF aliases->>(item->>'from_alias')=relation->>'right_table' THEN
     join_table:=relation->>'left_table'; from_column:=relation->>'right_column'; to_column:=relation->>'left_column';
   ELSE RAISE EXCEPTION 'MCP_ANALYTICS_JOIN_INVALID'; END IF;
   PERFORM factory_private.analytics_table(join_table,access->>'role');
   from_sql:=from_sql||pg_catalog.format(' %s JOIN public.%I AS %I ON %I.%I = %I.%I',
     CASE item->>'type' WHEN 'inner' THEN 'INNER' ELSE 'LEFT' END,join_table,item->>'alias',
     item->>'from_alias',from_column,item->>'alias',to_column);
   aliases:=aliases||jsonb_build_object(item->>'alias',join_table);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(selects) LOOP
   PERFORM factory_private.analytics_keys(item,ARRAY['as','expr']); output_name:=item->>'as';
   -- Positive identifier grammar plus validated output registry, not a SQL blacklist.
   IF output_name IS NULL OR output_name !~ '^[a-z][a-z0-9_]{0,31}$' OR outputs?output_name OR output_name='__ordinal'
   THEN RAISE EXCEPTION 'MCP_ANALYTICS_OUTPUT_INVALID'; END IF;
   exp:=factory_private.analytics_expr(item->'expr',aliases,true);
   aggregate_present:=aggregate_present OR (exp->>'aggregate')::boolean;
   outputs:=outputs||jsonb_build_object(output_name,exp);
   select_sql:=select_sql||CASE WHEN select_sql='' THEN '' ELSE ', ' END||pg_catalog.format('%s AS %I',exp->>'sql',output_name);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(groups) LOOP
   IF jsonb_typeof(item)<>'string' OR NOT outputs?(item#>>'{}') OR (outputs->(item#>>'{}')->>'aggregate')::boolean
   THEN RAISE EXCEPTION 'MCP_ANALYTICS_GROUP_INVALID'; END IF;
   group_sql:=group_sql||CASE WHEN group_sql='' THEN '' ELSE ', ' END||(outputs->(item#>>'{}')->>'sql');
 END LOOP;
 FOR column_item IN SELECT value FROM jsonb_array_elements(selects) LOOP
   grouped:=groups ? (column_item->>'as');
   IF aggregate_present AND NOT (outputs->(column_item->>'as')->>'aggregate')::boolean AND NOT grouped
     OR jsonb_array_length(groups)>0 AND NOT (outputs->(column_item->>'as')->>'aggregate')::boolean AND NOT grouped
   THEN RAISE EXCEPTION 'MCP_ANALYTICS_GROUP_INVALID'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(filters) LOOP
   PERFORM factory_private.analytics_keys(item,ARRAY['field','op','value']); f:=factory_private.analytics_field(item->'field',aliases);
   typ:=f->>'type'; operator:=item->>'op';
   IF operator IS NULL OR operator NOT IN('eq','ne','gt','gte','lt','lte','in','between','is_null','not_null') THEN RAISE EXCEPTION 'MCP_ANALYTICS_FILTER_INVALID'; END IF;
   -- Enum/text columns cast to developer-owned text; numeric/date/UUID casts are fixed metadata.
   path:=pg_catalog.format('($1->''filters''->%s->''value'')',index_n);
   IF operator IN('is_null','not_null') THEN
     IF item?'value' THEN RAISE EXCEPTION 'MCP_ANALYTICS_FILTER_INVALID'; END IF;
     where_sql:=where_sql||pg_catalog.format(' AND (%s) IS %sNULL',f->>'sql',CASE operator WHEN 'not_null' THEN 'NOT ' ELSE '' END);
   ELSE
     IF NOT item?'value' OR jsonb_typeof(item->'value')='null'
       OR operator IN('in','between') AND (jsonb_typeof(item->'value')<>'array' OR jsonb_array_length(item->'value') NOT BETWEEN 1 AND 100)
       OR operator='between' AND jsonb_array_length(item->'value')<>2
       OR operator NOT IN('in','between') AND jsonb_typeof(item->'value') NOT IN('string','number','boolean')
     THEN RAISE EXCEPTION 'MCP_ANALYTICS_FILTER_INVALID'; END IF;
     FOR column_item IN SELECT value FROM jsonb_array_elements(CASE WHEN operator IN('in','between') THEN item->'value' ELSE jsonb_build_array(item->'value') END) LOOP
       IF typ IN('numeric','integer','bigint') AND jsonb_typeof(column_item)<>'number'
         OR typ='boolean' AND jsonb_typeof(column_item)<>'boolean'
         OR typ IN('text','date','timestamptz','uuid') AND (jsonb_typeof(column_item)<>'string' OR length(column_item#>>'{}')>500)
       THEN RAISE EXCEPTION 'MCP_ANALYTICS_FILTER_INVALID'; END IF;
     END LOOP;
     rhs:=pg_catalog.format('(%s#>>''{}'')::%s',path,typ);
     IF operator='in' THEN
       where_sql:=where_sql||pg_catalog.format(' AND (%s)::%s IN (SELECT (v#>>''{}'')::%s FROM jsonb_array_elements(%s) v)',f->>'sql',typ,typ,path);
     ELSIF operator='between' THEN
       where_sql:=where_sql||pg_catalog.format(' AND (%s)::%s BETWEEN (%s->>0)::%s AND (%s->>1)::%s',f->>'sql',typ,path,typ,path,typ);
     ELSE
       where_sql:=where_sql||pg_catalog.format(' AND (%s)::%s %s %s',f->>'sql',typ,
         CASE operator WHEN 'eq' THEN '=' WHEN 'ne' THEN '<>' WHEN 'gt' THEN '>' WHEN 'gte' THEN '>=' WHEN 'lt' THEN '<' WHEN 'lte' THEN '<=' END,rhs);
     END IF;
   END IF;
   index_n:=index_n+1;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(orders) LOOP
   PERFORM factory_private.analytics_keys(item,ARRAY['as','direction']);
   IF NOT outputs?(item->>'as') OR item->>'direction' IS NULL OR item->>'direction' NOT IN('asc','desc') THEN RAISE EXCEPTION 'MCP_ANALYTICS_ORDER_INVALID'; END IF;
   order_sql:=order_sql||CASE WHEN order_sql='' THEN '' ELSE ', ' END||pg_catalog.format('%I %s NULLS LAST',item->>'as',upper(item->>'direction'));
 END LOOP;
 -- All outputs as tiebreakers preserve deterministic order for distinct visible rows.
 FOR column_item IN SELECT value FROM jsonb_array_elements(selects) LOOP
   order_sql:=order_sql||CASE WHEN order_sql='' THEN '' ELSE ', ' END||pg_catalog.format('%I ASC NULLS LAST',column_item->>'as');
 END LOOP;
 statement:=pg_catalog.format('WITH results AS MATERIALIZED (SELECT %s FROM %s WHERE %s%s),
 ordered AS (SELECT r.*,row_number() OVER(ORDER BY %s) AS __ordinal FROM results r),
 lookahead AS (SELECT * FROM ordered WHERE __ordinal>%s AND __ordinal<=%s)
 SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(to_jsonb(p)-''__ordinal'' ORDER BY __ordinal) FROM lookahead p WHERE __ordinal<=%s),''[]''::jsonb),
 ''total_count'',(SELECT count(*) FROM results),''has_more'',EXISTS(SELECT 1 FROM lookahead WHERE __ordinal>%s))',
 select_sql,from_sql,where_sql,CASE WHEN group_sql='' THEN '' ELSE ' GROUP BY '||group_sql END,
 order_sql,off,off+lim+1,off+lim,off+lim);
 EXECUTE statement INTO result USING p_query;
 RETURN result||jsonb_build_object('offset',off,'limit',lim,'next_offset',CASE WHEN (result->>'has_more')::boolean THEN off+lim ELSE NULL END,
   'truncated',(result->>'has_more')::boolean,'aggregation_complete',true,'captured_at',statement_timestamp(),
   'execution_role',current_user,'row_security_setting','on','source_rls',
   (SELECT jsonb_object_agg(a.value,c.relrowsecurity) FROM jsonb_each_text(aliases) a
     JOIN pg_catalog.pg_class c ON c.relname=a.value JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'),
   'selected_tables',aliases,'projection',selects,
   'consistency','repeatable read within this request; later offset pages use a new database snapshot',
   'join_basis','SQL join multiplicity is preserved; sum invoice headers after one-to-many joins can duplicate header amounts');
END $body$;
ALTER FUNCTION public.factory_mcp_analyze(jsonb) OWNER TO authenticated;
REVOKE ALL ON FUNCTION public.factory_mcp_analyze(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.factory_mcp_analyze(jsonb) TO factory_mcp_gateway;
GRANT USAGE ON SCHEMA factory_private TO authenticated;
REVOKE ALL ON FUNCTION factory_private.analytics_metadata(),factory_private.analytics_keys(jsonb,text[]),
 factory_private.analytics_table(text,text),factory_private.analytics_field(jsonb,jsonb),factory_private.analytics_expr(jsonb,jsonb,boolean)
 FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
GRANT EXECUTE ON FUNCTION factory_private.analytics_metadata(),factory_private.analytics_keys(jsonb,text[]),
 factory_private.analytics_table(text,text),factory_private.analytics_field(jsonb,jsonb),factory_private.analytics_expr(jsonb,jsonb,boolean) TO authenticated;
-- No business table grants; no persistent writes; no role/membership/credential/client creation.
