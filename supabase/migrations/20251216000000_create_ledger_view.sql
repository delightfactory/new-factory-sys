-- Migration: Create Unified Ledger View for Statement of Account
-- Date: 2025-12-16
-- Purpose: Provide a chronological view of all financial interactions (Accrual + Cash)

-- Drop the table and dependent objects (e.g. party_balances view) if they exist
DROP TABLE IF EXISTS ledger_entries CASCADE;

CREATE OR REPLACE VIEW ledger_entries AS
-- 1. Sales Invoices (Debit)
SELECT
    'si_' || id AS id,
    customer_id AS party_id,
    transaction_date,
    total_amount AS amount,
    'invoice' AS type,
    'sales_invoice' AS reference_type,
    id::text AS reference_id,
    'فاتورة بيع #' || COALESCE(invoice_number, id::text) AS description,
    total_amount AS debit,
    0 AS credit,
    created_at
FROM sales_invoices
WHERE status = 'posted'

UNION ALL

-- 2. Purchase Invoices (Credit)
SELECT
    'pi_' || id AS id,
    supplier_id AS party_id,
    transaction_date,
    total_amount AS amount,
    'invoice' AS type,
    'purchase_invoice' AS reference_type,
    id::text AS reference_id,
    'فاتورة شراء #' || COALESCE(invoice_number, id::text) AS description,
    0 AS debit,
    total_amount AS credit,
    created_at
FROM purchase_invoices
WHERE status = 'posted'

UNION ALL

-- 3. Sales Returns (Credit)
SELECT
    'sr_' || id AS id,
    customer_id AS party_id,
    return_date AS transaction_date,
    total_amount AS amount,
    'return' AS type,
    'sales_return' AS reference_type,
    id::text AS reference_id,
    'مرتجع بيع #' || COALESCE(return_number, id::text) AS description,
    0 AS debit,
    total_amount AS credit,
    created_at
FROM sales_returns
WHERE status = 'posted'

UNION ALL

-- 4. Purchase Returns (Debit)
SELECT
    'pr_' || id AS id,
    supplier_id AS party_id,
    return_date AS transaction_date,
    total_amount AS amount,
    'return' AS type,
    'purchase_return' AS reference_type,
    id::text AS reference_id,
    'مرتجع شراء #' || COALESCE(return_number, id::text) AS description,
    total_amount AS debit,
    0 AS credit,
    created_at
FROM purchase_returns
WHERE status = 'posted'

UNION ALL

-- 5. Financial Transactions (Cash Flow)
SELECT
    'ft_' || id AS id,
    party_id,
    transaction_date,
    amount,
    'transaction' AS type,
    COALESCE(reference_type, 'manual_transaction') AS reference_type,
    COALESCE(reference_id, id::text) AS reference_id,
    description,
    -- Expense (Payment to Supplier / Refund to Customer) = Debit
    CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END AS debit,
    -- Income (Receipt from Customer / Refund from Supplier) = Credit
    CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END AS credit,
    created_at
FROM financial_transactions
WHERE party_id IS NOT NULL;
