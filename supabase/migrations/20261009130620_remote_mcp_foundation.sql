-- Review-only foundation. Does not provision passwords, OAuth clients or grants.
CREATE SCHEMA IF NOT EXISTS factory_private;
REVOKE ALL ON SCHEMA factory_private FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'factory_mcp_gateway') THEN
    CREATE ROLE factory_mcp_gateway NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO factory_mcp_gateway;

CREATE TABLE factory_private.mcp_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  resource text NOT NULL CHECK (resource LIKE 'https://%/api/mcp'),
  can_write boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (user_id, client_id, resource)
);
CREATE TABLE factory_private.write_receipts (
  -- Historical identity must survive native user deletion for audit/replay.
  -- Every new write validates the existing active Auth user at the boundary.
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  client_id text,
  action text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE factory_private.mcp_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_private.write_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA factory_private FROM PUBLIC, anon, authenticated, factory_mcp_gateway;
ALTER DEFAULT PRIVILEGES IN SCHEMA factory_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- profiles.role/is_active are authorization data, never self-service fields.
REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE(full_name) ON public.profiles TO authenticated;

CREATE FUNCTION factory_private.require_role(p_roles text[])
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role text;
BEGIN
  SELECT p.role::text INTO v_role FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = auth.uid() AND p.is_active AND NOT coalesce(u.is_anonymous, false)
    FOR SHARE OF p,u;
  PERFORM 1 FROM auth.sessions s WHERE s.id::text = auth.jwt()->>'session_id'
    AND s.user_id = auth.uid() AND (s.not_after IS NULL OR s.not_after > now()) FOR SHARE;
  IF v_role IS NULL OR NOT (v_role = ANY(p_roles)) OR NOT FOUND
    THEN RAISE EXCEPTION 'MCP_ACCESS_FORBIDDEN'; END IF;
  RETURN v_role;
END $$;

CREATE FUNCTION factory_private.authorize_mcp()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role text; v_access factory_private.mcp_access;
BEGIN
  v_role := factory_private.require_role(ARRAY['admin','manager','accountant','production_officer','inventory_officer','viewer']);
  SELECT * INTO v_access FROM factory_private.mcp_access
    WHERE user_id = auth.uid() AND client_id = auth.jwt()->>'client_id'
      AND resource = auth.jwt()->>'aud' AND expires_at > now() AND revoked_at IS NULL
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MCP_ACCESS_FORBIDDEN'; END IF;
  RETURN jsonb_build_object('user_id',auth.uid(),'role',v_role,'can_write',v_access.can_write);
END $$;

CREATE FUNCTION factory_private.assert_keys(p_payload jsonb, p_allowed text[])
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'MCP_INPUT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT k = ANY(p_allowed)) THEN
    RAISE EXCEPTION 'MCP_INPUT_INVALID';
  END IF;
END $$;

CREATE FUNCTION factory_private.operation(p_kind text, p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_record jsonb;
BEGIN
  IF p_kind = 'sales_invoice' THEN
    PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
    SELECT to_jsonb(sales_invoices)||jsonb_build_object('kind',p_kind,'number',invoice_number)
      INTO v_record FROM public.sales_invoices WHERE id = p_id;
  ELSIF p_kind IN ('production_order','packaging_order') THEN
    PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
    IF p_kind = 'production_order' THEN
      SELECT to_jsonb(production_orders)||jsonb_build_object('kind',p_kind,'number',code)
        INTO v_record FROM public.production_orders WHERE id = p_id;
    ELSE
      SELECT to_jsonb(packaging_orders)||jsonb_build_object('kind',p_kind,'number',code)
        INTO v_record FROM public.packaging_orders WHERE id = p_id;
    END IF;
  ELSE RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  IF v_record IS NULL THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
  RETURN v_record;
END $$;

-- Shared command service: UI and MCP use the same transaction and receipt.
CREATE FUNCTION public.factory_write(p_action text, p_payload jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
      WHEN 'post_sales_invoice' THEN PERFORM public.process_sales_invoice(v_id);
      WHEN 'complete_production_order' THEN PERFORM public.complete_production_order_atomic(v_id);
      WHEN 'complete_packaging_order' THEN PERFORM public.complete_packaging_order_atomic(v_id);
    END CASE;
  END IF;
  v_result := jsonb_build_object('request_id',p_request_id,'record',factory_private.operation(v_kind,v_id));
  UPDATE factory_private.write_receipts SET result=v_result WHERE user_id=auth.uid() AND request_id=p_request_id;
  RETURN v_result;
END $$;

CREATE FUNCTION public.factory_mcp_context()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT factory_private.authorize_mcp();
$$;
CREATE FUNCTION public.factory_mcp_write(p_action text,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (factory_private.authorize_mcp()->>'can_write')::boolean THEN RAISE EXCEPTION 'MCP_WRITE_FORBIDDEN'; END IF;
  RETURN public.factory_write(p_action,p_payload,p_request_id);
END $$;

CREATE FUNCTION public.factory_mcp_query(p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rows jsonb; v_limit integer; v_search text;
BEGIN
  PERFORM factory_private.authorize_mcp();
  IF p_kind = 'operation' THEN
    PERFORM factory_private.assert_keys(p_payload,ARRAY['kind','id']);
    RETURN jsonb_build_object('record',factory_private.operation(p_payload->>'kind',(p_payload->>'id')::bigint));
  END IF;
  PERFORM factory_private.assert_keys(p_payload,ARRAY['kind','search','limit']);
  v_limit := coalesce((p_payload->>'limit')::integer,20);
  v_search := coalesce(p_payload->>'search','');
  IF v_limit NOT BETWEEN 1 AND 50 OR length(v_search)>100 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  IF p_kind = 'customers' THEN
    PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
    SELECT coalesce(jsonb_agg(t),'[]'::jsonb) INTO v_rows FROM (
      SELECT id,name FROM public.parties WHERE type='customer' AND strpos(lower(name),lower(v_search))>0 ORDER BY name,id LIMIT v_limit
    ) t;
  ELSIF p_kind = 'finished_products' THEN
    PERFORM factory_private.require_role(ARRAY['admin','manager','accountant','production_officer','inventory_officer']);
    SELECT coalesce(jsonb_agg(t),'[]'::jsonb) INTO v_rows FROM (
      SELECT id,code,name,unit,quantity,sales_price FROM public.finished_products
        WHERE strpos(lower(name || ' ' || code),lower(v_search))>0 ORDER BY name,id LIMIT v_limit
    ) t;
  ELSIF p_kind = 'semi_finished_products' THEN
    PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer','inventory_officer']);
    SELECT coalesce(jsonb_agg(t),'[]'::jsonb) INTO v_rows FROM (
      SELECT id,code,name,unit,quantity FROM public.semi_finished_products
        WHERE strpos(lower(name || ' ' || code),lower(v_search))>0 ORDER BY name,id LIMIT v_limit
    ) t;
  ELSE RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
  RETURN jsonb_build_object('kind',p_kind,'rows',v_rows,'limit',v_limit,'may_have_more',jsonb_array_length(v_rows)=v_limit);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA factory_private FROM PUBLIC, anon, authenticated, factory_mcp_gateway;
GRANT USAGE ON SCHEMA factory_private TO authenticated;
GRANT EXECUTE ON FUNCTION factory_private.require_role(text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.factory_write(text,jsonb,uuid) FROM PUBLIC, anon, factory_mcp_gateway;
GRANT EXECUTE ON FUNCTION public.factory_write(text,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.factory_mcp_context(), public.factory_mcp_query(text,jsonb), public.factory_mcp_write(text,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.factory_mcp_context(), public.factory_mcp_query(text,jsonb), public.factory_mcp_write(text,jsonb,uuid)
  TO factory_mcp_gateway;


-- Existing complete_production_order_atomic cost equations retained; shared state/role/row guards added.
CREATE OR REPLACE FUNCTION complete_production_order_atomic(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status text;
    r_item RECORD;
    r_ingredient RECORD;
    v_order_code TEXT;
    v_recipe_batch_size NUMERIC;
    v_ratio NUMERIC;
    v_qty_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
    v_prev_cost NUMERIC;
    v_new_cost NUMERIC;
    -- WACO Variables
    v_batch_cost NUMERIC;      -- Total cost for one batch (recipe_batch_size units)
    v_item_unit_cost NUMERIC;  -- Cost per single unit of semi-finished product
    v_total_order_cost NUMERIC := 0;
BEGIN
    PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
    PERFORM pg_advisory_xact_lock(78102026);
    SELECT status::text INTO v_order_status FROM public.production_orders WHERE id=p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
    IF v_order_status = 'completed' THEN RETURN; END IF;
    IF v_order_status NOT IN ('pending','inProgress') THEN RAISE EXCEPTION 'MCP_STATE_CONFLICT'; END IF;
    PERFORM 1 FROM public.production_order_items WHERE production_order_id=p_order_id ORDER BY id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.production_order_items WHERE production_order_id=p_order_id) OR
      EXISTS(SELECT 1 FROM public.production_order_items WHERE production_order_id=p_order_id AND
        (quantity IS NULL OR quantity <= 0 OR quantity = 'NaN'::numeric)) THEN
      RAISE EXCEPTION 'MCP_INPUT_INVALID';
    END IF;

    -- Get Order Code
    SELECT code INTO v_order_code FROM production_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PO-' || p_order_id::TEXT; END IF;

    -- Freeze the recipe and component costs before calculating any WACO snapshot.
    PERFORM 1 FROM public.semi_finished_products WHERE id IN (
      SELECT semi_finished_id FROM public.production_order_items WHERE production_order_id=p_order_id
    ) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.semi_finished_ingredients WHERE semi_finished_id IN (
      SELECT semi_finished_id FROM public.production_order_items WHERE production_order_id=p_order_id
    ) ORDER BY id FOR SHARE;
    PERFORM 1 FROM public.raw_materials WHERE id IN (
      SELECT si.raw_material_id FROM public.semi_finished_ingredients si
      JOIN public.production_order_items oi ON oi.semi_finished_id=si.semi_finished_id
      WHERE oi.production_order_id=p_order_id
    ) ORDER BY id FOR UPDATE;

    -- Loop through Order Items
    FOR r_item IN SELECT * FROM production_order_items WHERE production_order_id = p_order_id LOOP

        -- Get Recipe Details (batch size)
        SELECT recipe_batch_size INTO v_recipe_batch_size
        FROM semi_finished_products
        WHERE id = r_item.semi_finished_id;

        -- Handle NULL or zero batch size
        IF v_recipe_batch_size IS NULL OR v_recipe_batch_size = 0 THEN
            v_recipe_batch_size := 100;
        END IF;

        -- Calculate ratio: how many batches are we producing
        v_ratio := r_item.quantity / v_recipe_batch_size;

        -- =====================================================================
        -- Calculate UNIT COST from Raw Materials (CORRECTED)
        --
        -- si.quantity = amount of raw material for ONE batch (recipe_batch_size)
        -- rm.unit_cost = cost per unit of raw material
        --
        -- v_batch_cost = Total cost of raw materials for ONE batch
        -- v_item_unit_cost = Cost per SINGLE UNIT of semi-finished product
        -- =====================================================================
        SELECT COALESCE(SUM(rm.unit_cost * si.quantity), 0) INTO v_batch_cost
        FROM semi_finished_ingredients si
        JOIN raw_materials rm ON si.raw_material_id = rm.id
        WHERE si.semi_finished_id = r_item.semi_finished_id;

        -- Unit cost = batch cost / batch size
        v_item_unit_cost := v_batch_cost / v_recipe_batch_size;

        -- Deduct Raw Materials (Ingredients)
        FOR r_ingredient IN
            SELECT * FROM semi_finished_ingredients WHERE semi_finished_id = r_item.semi_finished_id
        LOOP
            -- Amount needed = ingredient quantity per batch * number of batches
            v_qty_needed := r_ingredient.quantity * v_ratio;

            SELECT quantity INTO v_prev_balance FROM raw_materials WHERE id = r_ingredient.raw_material_id FOR UPDATE;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_qty_needed;

            UPDATE raw_materials SET quantity = v_new_balance, updated_at = NOW()
            WHERE id = r_ingredient.raw_material_id;

            PERFORM log_inventory_movement(
                r_ingredient.raw_material_id, 'raw_materials', 'out', v_qty_needed,
                'استهلاك في أمر إنتاج #' || v_order_code, v_order_code
            );
        END LOOP;

        -- Get current semi-finished product quantity and cost
        SELECT quantity, COALESCE(unit_cost, 0) INTO v_prev_balance, v_prev_cost
        FROM semi_finished_products WHERE id = r_item.semi_finished_id FOR UPDATE;
        IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
        IF v_prev_cost IS NULL THEN v_prev_cost := 0; END IF;

        v_new_balance := v_prev_balance + r_item.quantity;

        -- =====================================================================
        -- Calculate WACO for Semi-Finished Product
        -- New Avg Cost = (Old Qty × Old Cost + New Qty × New Unit Cost) / Total Qty
        -- =====================================================================
        IF v_new_balance > 0 THEN
            v_new_cost := ((v_prev_balance * v_prev_cost) + (r_item.quantity * v_item_unit_cost)) / v_new_balance;
        ELSE
            v_new_cost := v_item_unit_cost;
        END IF;

        -- Update Semi-Finished Product with quantity AND cost
        UPDATE semi_finished_products
        SET quantity = v_new_balance,
            unit_cost = v_new_cost,
            updated_at = NOW()
        WHERE id = r_item.semi_finished_id;

        PERFORM log_inventory_movement(
            r_item.semi_finished_id, 'semi_finished_products', 'in', r_item.quantity,
            'إنتاج من أمر تشغيل #' || v_order_code, v_order_code
        );

        -- =====================================================================
        -- Update Order Item with Cost
        -- unit_cost = cost per unit, total_cost = unit_cost * quantity
        -- =====================================================================
        UPDATE production_order_items
        SET unit_cost = v_item_unit_cost,
            total_cost = r_item.quantity * v_item_unit_cost
        WHERE id = r_item.id;

        v_total_order_cost := v_total_order_cost + (r_item.quantity * v_item_unit_cost);
    END LOOP;

    -- =====================================================================
    -- Update Order with Total Cost
    -- =====================================================================
    UPDATE production_orders
    SET status = 'completed',
        total_cost = v_total_order_cost,
        updated_at = NOW()
    WHERE id = p_order_id;
END;
$$;


-- Existing complete_packaging_order_atomic cost equations retained; shared state/role/row guards added.
CREATE OR REPLACE FUNCTION complete_packaging_order_atomic(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status text;
    r_item RECORD;
    r_pkg RECORD;
    v_order_code TEXT;
    v_sf_id BIGINT;
    v_sf_qty_per_unit NUMERIC;
    v_sf_needed NUMERIC;
    v_pkg_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
    -- WACO Variables (NEW)
    v_prev_cost NUMERIC;
    v_new_cost NUMERIC;
    v_semi_cost NUMERIC;
    v_pack_cost NUMERIC;
    v_item_cost NUMERIC;
    v_total_cost NUMERIC := 0;
BEGIN
    PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
    PERFORM pg_advisory_xact_lock(78102026);
    SELECT status::text INTO v_order_status FROM public.packaging_orders WHERE id=p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
    IF v_order_status = 'completed' THEN RETURN; END IF;
    IF v_order_status NOT IN ('pending','inProgress') THEN RAISE EXCEPTION 'MCP_STATE_CONFLICT'; END IF;
    PERFORM 1 FROM public.packaging_order_items WHERE packaging_order_id=p_order_id ORDER BY id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.packaging_order_items WHERE packaging_order_id=p_order_id) OR
      EXISTS(SELECT 1 FROM public.packaging_order_items WHERE packaging_order_id=p_order_id AND
        (quantity IS NULL OR quantity <= 0 OR quantity = 'NaN'::numeric)) THEN
      RAISE EXCEPTION 'MCP_INPUT_INVALID';
    END IF;

    -- Get Order Code
    SELECT code INTO v_order_code FROM packaging_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PKG-' || p_order_id::TEXT; END IF;

    -- Lock recipe/component rows before reading their weighted costs.
    PERFORM 1 FROM public.finished_products WHERE id IN (
      SELECT finished_product_id FROM public.packaging_order_items WHERE packaging_order_id=p_order_id
    ) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.finished_product_packaging WHERE finished_product_id IN (
      SELECT finished_product_id FROM public.packaging_order_items WHERE packaging_order_id=p_order_id
    ) ORDER BY id FOR SHARE;
    PERFORM 1 FROM public.semi_finished_products WHERE id IN (
      SELECT fp.semi_finished_id FROM public.finished_products fp
      JOIN public.packaging_order_items oi ON oi.finished_product_id=fp.id
      WHERE oi.packaging_order_id=p_order_id
    ) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.packaging_materials WHERE id IN (
      SELECT fpp.packaging_material_id FROM public.finished_product_packaging fpp
      JOIN public.packaging_order_items oi ON oi.finished_product_id=fpp.finished_product_id
      WHERE oi.packaging_order_id=p_order_id
    ) ORDER BY id FOR UPDATE;

    -- Loop through Order Items
    FOR r_item IN SELECT * FROM packaging_order_items WHERE packaging_order_id = p_order_id LOOP

        -- Get Finished Product Details
        SELECT semi_finished_id, semi_finished_quantity
        INTO v_sf_id, v_sf_qty_per_unit
        FROM finished_products
        WHERE id = r_item.finished_product_id;

        -- =====================================================================
        -- Calculate Item Cost (WACO Enhancement)
        -- Cost = (Semi-Finished Qty × Cost) + Sum(Packaging Qty × Cost)
        -- =====================================================================

        -- 1. Semi-Finished Cost Component
        v_semi_cost := 0;
        IF v_sf_id IS NOT NULL AND v_sf_qty_per_unit IS NOT NULL THEN
            SELECT COALESCE(v_sf_qty_per_unit * sfp.unit_cost, 0) INTO v_semi_cost
            FROM semi_finished_products sfp
            WHERE sfp.id = v_sf_id;
        END IF;

        -- 2. Packaging Materials Cost Component
        SELECT COALESCE(SUM(fpp.quantity * pm.unit_cost), 0) INTO v_pack_cost
        FROM finished_product_packaging fpp
        JOIN packaging_materials pm ON fpp.packaging_material_id = pm.id
        WHERE fpp.finished_product_id = r_item.finished_product_id;

        -- Total item cost = semi-finished cost + packaging cost
        v_item_cost := COALESCE(v_semi_cost, 0) + COALESCE(v_pack_cost, 0);

        -- Deduct Semi-Finished
        IF v_sf_id IS NOT NULL AND v_sf_qty_per_unit IS NOT NULL THEN
            v_sf_needed := r_item.quantity * v_sf_qty_per_unit;

            SELECT quantity INTO v_prev_balance FROM semi_finished_products WHERE id = v_sf_id FOR UPDATE;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_sf_needed;

            UPDATE semi_finished_products
            SET quantity = v_new_balance, updated_at = NOW()
            WHERE id = v_sf_id;

            PERFORM log_inventory_movement(
                v_sf_id, 'semi_finished_products', 'out', v_sf_needed,
                'استهلاك في أمر تعبئة #' || v_order_code, v_order_code
            );
        END IF;

        -- Deduct Packaging Materials
        FOR r_pkg IN
            SELECT * FROM finished_product_packaging WHERE finished_product_id = r_item.finished_product_id
        LOOP
            v_pkg_needed := r_item.quantity * r_pkg.quantity;

            SELECT quantity INTO v_prev_balance FROM packaging_materials WHERE id = r_pkg.packaging_material_id FOR UPDATE;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_pkg_needed;

            UPDATE packaging_materials
            SET quantity = v_new_balance, updated_at = NOW()
            WHERE id = r_pkg.packaging_material_id;

            PERFORM log_inventory_movement(
                r_pkg.packaging_material_id, 'packaging_materials', 'out', v_pkg_needed,
                'استهلاك في أمر تعبئة #' || v_order_code, v_order_code
            );
        END LOOP;

        -- Get current finished product quantity and cost
        SELECT quantity, COALESCE(unit_cost, 0) INTO v_prev_balance, v_prev_cost
        FROM finished_products WHERE id = r_item.finished_product_id FOR UPDATE;
        IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
        IF v_prev_cost IS NULL THEN v_prev_cost := 0; END IF;

        v_new_balance := v_prev_balance + r_item.quantity;

        -- =====================================================================
        -- Calculate WACO for Finished Product (Enhancement)
        -- New Cost = (Old Qty × Old Cost + New Qty × New Cost) / Total Qty
        -- =====================================================================
        IF v_new_balance > 0 THEN
            v_new_cost := ((v_prev_balance * v_prev_cost) + (r_item.quantity * v_item_cost)) / v_new_balance;
        ELSE
            v_new_cost := v_item_cost;
        END IF;

        -- Update Finished Product with quantity AND cost
        UPDATE finished_products
        SET quantity = v_new_balance,
            unit_cost = v_new_cost,
            updated_at = NOW()
        WHERE id = r_item.finished_product_id;

        PERFORM log_inventory_movement(
            r_item.finished_product_id, 'finished_products', 'in', r_item.quantity,
            'إنتاج تعبئة وتغليف #' || v_order_code, v_order_code
        );

        -- =====================================================================
        -- Update Order Item with Cost (Enhancement)
        -- =====================================================================
        UPDATE packaging_order_items
        SET unit_cost = v_item_cost,
            total_cost = r_item.quantity * v_item_cost
        WHERE id = r_item.id;

        v_total_cost := v_total_cost + (r_item.quantity * v_item_cost);
    END LOOP;

    -- =====================================================================
    -- Update Order with Total Cost (Enhancement)
    -- =====================================================================
    UPDATE packaging_orders
    SET status = 'completed',
        total_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = p_order_id;
END;
$$;


-- Existing stock, bundle, COGS, treasury and party logic retained.
CREATE OR REPLACE FUNCTION process_sales_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_current_qty NUMERIC;
    v_current_cost NUMERIC;
    v_remaining_amount NUMERIC;
    v_item_id BIGINT;
    v_item_type_str TEXT;
BEGIN
    PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
    PERFORM pg_advisory_xact_lock(78102026);
    SELECT * INTO v_invoice FROM sales_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MCP_RECORD_NOT_FOUND'; END IF;
    IF v_invoice.status = 'posted' THEN RETURN jsonb_build_object('success',true); END IF;

    IF v_invoice.status != 'draft' THEN
        RAISE EXCEPTION 'Invoice is already processed or voided';
    END IF;

    PERFORM 1 FROM parties WHERE id=v_invoice.customer_id FOR UPDATE;
    IF v_invoice.treasury_id IS NOT NULL THEN PERFORM 1 FROM treasuries WHERE id=v_invoice.treasury_id FOR UPDATE; END IF;
    PERFORM 1 FROM sales_invoice_items WHERE invoice_id=p_invoice_id ORDER BY id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM sales_invoice_items WHERE invoice_id=p_invoice_id) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
    FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id LOOP
        v_item_id := NULL;
        v_current_cost := 0;

        IF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM finished_products WHERE id = v_item_id FOR UPDATE;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للمنتج #%', v_item_id; END IF;
            UPDATE finished_products SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM raw_materials WHERE id = v_item_id FOR UPDATE;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للخامة #%', v_item_id; END IF;
            UPDATE raw_materials SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM packaging_materials WHERE id = v_item_id FOR UPDATE;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي لمادة التعبئة #%', v_item_id; END IF;
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM semi_finished_products WHERE id = v_item_id FOR UPDATE;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للمنتج نصف المصنع #%', v_item_id; END IF;
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        -- ===== NEW: Bundle Support =====
        ELSIF v_item.item_type = 'bundle' THEN
            v_item_id := v_item.bundle_id;
            v_item_type_str := 'product_bundles';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM product_bundles WHERE id = v_item_id FOR UPDATE;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للباندل #%', v_item_id; END IF;
            UPDATE product_bundles SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;
        -- ===============================
        END IF;

        UPDATE sales_invoice_items SET unit_cost_at_sale = v_current_cost WHERE id = v_item.id;

        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id, v_item_type_str, 'out', v_item.quantity,
                'فاتورة بيع #' || v_invoice.invoice_number, 'SI-' || p_invoice_id::TEXT
            );
        END IF;
    END LOOP;

    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        UPDATE treasuries SET balance = balance + v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.customer_id, v_invoice.paid_amount, 'income', 'sales_payment', 'تحصيل فاتورة بيع #' || v_invoice.invoice_number, 'sales_invoice', v_invoice.id::text, v_invoice.transaction_date);
    END IF;

    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance + v_remaining_amount WHERE id = v_invoice.customer_id;
    END IF;

    UPDATE sales_invoices SET status = 'posted' WHERE id = p_invoice_id;
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.complete_production_order_atomic(bigint), public.complete_packaging_order_atomic(bigint), public.process_sales_invoice(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_production_order_atomic(bigint), public.complete_packaging_order_atomic(bigint), public.process_sales_invoice(bigint) TO authenticated;
