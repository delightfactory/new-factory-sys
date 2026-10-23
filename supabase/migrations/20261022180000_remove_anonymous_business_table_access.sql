-- LOCAL CANDIDATE ONLY. No production application/release approved.
-- Removes direct anon grants on captured37business tables/33sequences only.
-- Authenticated/service roles, RLS, RPC bodies/EXECUTE and data are unchanged.
-- RPC authorization, views, future objects and role-specific read policy remain separate gates.
DO $candidate$
BEGIN
    IF (select md5(coalesce(jsonb_agg(jsonb_build_object('kind',c.relkind,'object',c.relname,'owner',pg_get_userbyid(c.relowner),'grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee)end,'privilege',a.privilege_type,'grantable',a.is_grantable)order by c.relkind,c.relname,a.grantee,a.grantor,a.privilege_type)::text,'[]'))from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S'then'S'::"char"else'r'::"char"end,c.relowner)))a where n.nspname='public'and c.relkind in('r','S')) <> '0c029f293cc79d94e61e5420585d11c1' THEN
        RAISE EXCEPTION 'ANON_CANDIDATE_RELATION_GRANTS_CHANGED';
    END IF;
    IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member='anon'::regrole)
       OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE n.nspname='public'AND c.relkind IN('r','S')AND a.grantee=0)
       OR EXISTS(SELECT 1 FROM pg_attribute t JOIN pg_class c ON c.oid=t.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(t.attacl)a WHERE n.nspname='public'AND a.grantee='anon'::regrole) THEN
        RAISE EXCEPTION 'ANON_CANDIDATE_INHERITED_OR_COLUMN_ACCESS_REQUIRES_REVIEW';
    END IF;
    REVOKE ALL PRIVILEGES ON TABLE public."audit_logs" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."backup_logs" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."bundle_assembly_order_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."bundle_assembly_orders" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."bundle_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."financial_categories" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."financial_transactions" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."finished_product_packaging" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."finished_products" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."inventory_count_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."inventory_count_sessions" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."inventory_movements" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."invoice_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."invoices" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."packaging_materials" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."packaging_order_consumed_materials" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."packaging_order_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."packaging_orders" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."parties" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."payments" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."product_bundles" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."production_order_consumed_materials" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."production_order_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."production_orders" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."profiles" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."purchase_invoice_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."purchase_invoices" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."purchase_return_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."purchase_returns" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."raw_materials" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."sales_invoice_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."sales_invoices" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."sales_return_items" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."sales_returns" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."semi_finished_ingredients" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."semi_finished_products" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public."treasuries" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."backup_logs_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."bundle_assembly_code_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."bundle_assembly_order_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."bundle_assembly_orders_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."bundle_code_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."bundle_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."financial_categories_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."financial_transactions_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."finished_product_packaging_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."finished_products_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."inventory_count_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."inventory_count_sessions_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."inventory_movements_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."packaging_materials_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."packaging_order_consumed_materials_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."packaging_order_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."packaging_orders_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."product_bundles_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."production_order_consumed_materials_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."production_order_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."production_orders_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."purchase_invoice_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."purchase_invoices_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."purchase_return_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."purchase_returns_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."raw_materials_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."sales_invoice_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."sales_invoices_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."sales_return_items_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."sales_returns_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."semi_finished_ingredients_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."semi_finished_products_id_seq" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE public."treasuries_id_seq" FROM anon;
END;
$candidate$;
