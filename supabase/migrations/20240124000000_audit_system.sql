-- Audit System Migration
-- Created at: 2024-01-24
-- Purpose: Track all critical system activities for security and reporting

-- 1. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    table_name TEXT NOT NULL,
    record_id TEXT, -- Flexible to store UUID or INT IDs
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
    FOR SELECT
    USING (public.is_admin());

-- Policy: System can insert logs (via triggers)
-- Note: Trigger functions execute with the privileges of the function owner (postgres), 
-- but we ensure standard users can't manually insert.
CREATE POLICY "No manual insert" ON public.audit_logs
    FOR INSERT
    WITH CHECK (false);

-- 2. Create Generic Trigger Function
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
    record_identifier TEXT;
    payload_old JSONB;
    payload_new JSONB;
BEGIN
    -- Get current user ID (if authenticated)
    current_user_id := auth.uid();
    
    -- Determine Record ID (handle both 'id' UUID and 'id' BIGINT)
    IF (TG_OP = 'DELETE') THEN
        record_identifier := OLD.id::TEXT;
        payload_old := to_jsonb(OLD);
    ELSE
        record_identifier := NEW.id::TEXT;
        payload_new := to_jsonb(NEW);
        IF (TG_OP = 'UPDATE') THEN
            payload_old := to_jsonb(OLD);
        END IF;
    END IF;

    -- Insert Log
    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data
    ) VALUES (
        current_user_id,
        TG_OP,
        TG_TABLE_NAME,
        record_identifier,
        payload_old,
        payload_new
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach Triggers to Key Tables

-- Profiles (User Management)
DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles
    AFTER INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Raw Materials (Inventory)
DROP TRIGGER IF EXISTS audit_raw_materials ON public.raw_materials;
CREATE TRIGGER audit_raw_materials
    AFTER INSERT OR UPDATE OR DELETE ON public.raw_materials
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Packaging Materials (Inventory)
DROP TRIGGER IF EXISTS audit_packaging_materials ON public.packaging_materials;
CREATE TRIGGER audit_packaging_materials
    AFTER INSERT OR UPDATE OR DELETE ON public.packaging_materials
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Finished Products (Inventory)
DROP TRIGGER IF EXISTS audit_finished_products ON public.finished_products;
CREATE TRIGGER audit_finished_products
    AFTER INSERT OR UPDATE OR DELETE ON public.finished_products
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Production Orders (Operations)
DROP TRIGGER IF EXISTS audit_production_orders ON public.production_orders;
CREATE TRIGGER audit_production_orders
    AFTER INSERT OR UPDATE OR DELETE ON public.production_orders
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Invoices (Sales/Purchases)
-- Note: There is no single 'invoices' table, so we attach to both subtypes
DROP TRIGGER IF EXISTS audit_purchase_invoices ON public.purchase_invoices;
CREATE TRIGGER audit_purchase_invoices
    AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoices
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS audit_sales_invoices ON public.sales_invoices;
CREATE TRIGGER audit_sales_invoices
    AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoices
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Financial Transactions (Money)
DROP TRIGGER IF EXISTS audit_financial_transactions ON public.financial_transactions;
CREATE TRIGGER audit_financial_transactions
    AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
    FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- 4. Dashboard Stats RPC
-- Efficiently fetches aggregated stats for the dashboard in one call
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
    daily_sales NUMERIC;
    active_orders INT;
    low_stock_count INT;
    cash_balance NUMERIC;
    recent_activities JSONB;
BEGIN
    -- 1. Daily Sales (Sales Invoices created today)
    -- We use sales_invoices table directly
    SELECT COALESCE(SUM(total_amount), 0) INTO daily_sales
    FROM public.sales_invoices
    WHERE created_at >= CURRENT_DATE;

    -- 2. Active Orders (Production + Packaging)
    SELECT 
        (SELECT COUNT(*) FROM public.production_orders WHERE status IN ('pending', 'inProgress')) +
        (SELECT COUNT(*) FROM public.packaging_orders WHERE status IN ('pending', 'inProgress'))
    INTO active_orders;

    -- 3. Low Stock Items (Raw Materials)
    SELECT COUNT(*) INTO low_stock_count
    FROM public.raw_materials
    WHERE quantity <= min_stock;

    -- 4. Cash Balance (Sum of all Treasuries)
    SELECT COALESCE(SUM(balance), 0) INTO cash_balance
    FROM public.treasuries;

    -- 5. Recent Activities (Last 10 Audit Logs with User Names)
    SELECT jsonb_agg(t) INTO recent_activities
    FROM (
        SELECT 
            al.id,
            al.action,
            al.table_name,
            al.created_at,
            p.full_name as user_name
        FROM public.audit_logs al
        LEFT JOIN public.profiles p ON al.user_id = p.id
        ORDER BY al.created_at DESC
        LIMIT 10
    ) t;

    RETURN jsonb_build_object(
        'daily_sales', daily_sales,
        'active_orders', active_orders,
        'low_stock_count', low_stock_count,
        'cash_balance', cash_balance,
        'recent_activities', COALESCE(recent_activities, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
