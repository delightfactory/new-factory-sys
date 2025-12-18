import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== CONFIGURATION =====
// Adjust these paths as needed for your environment
const OLD_BACKUP_PATH = path.join(__dirname, '..', 'backup_2025-12-18_19-34-04.json');
// Output file name with timestamp
const OUTPUT_PATH = path.join(__dirname, '..', 'migrated-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');

// ID Mapping - to convert old IDs to new sequential IDs
const idMaps = {
    raw_materials: new Map(),
    packaging_materials: new Map(),
    semi_finished_products: new Map(),
    finished_products: new Map(),
    parties: new Map(),
    treasuries: new Map(),
    production_orders: new Map(),
    packaging_orders: new Map(),
    purchase_invoices: new Map(),
    sales_invoices: new Map(),
};

// Counters for new IDs
const counters = {
    raw_materials: 1,
    packaging_materials: 1,
    semi_finished_products: 1,
    finished_products: 1,
    treasuries: 1,
    production_orders: 1,
    packaging_orders: 1,
    production_order_items: 1,
    packaging_order_items: 1,
    purchase_invoices: 1,
    sales_invoices: 1,
    purchase_invoice_items: 1,
    sales_invoice_items: 1,
    financial_transactions: 1,
    semi_finished_ingredients: 1,
    finished_product_packaging: 1,
    inventory_count_sessions: 1,
    inventory_count_items: 1,
    purchase_returns: 1,
    sales_returns: 1,
    purchase_return_items: 1,
    sales_return_items: 1,
};

// ===== UTILITY FUNCTIONS =====

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getCurrentTimestamp() {
    return new Date().toISOString();
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes('T')) {
        return dateStr.split('T')[0];
    }
    return dateStr;
}

// Code Prefixes for each table (matching the new system EXACTLY)
// Based on complete audit of all services and pages
const CODE_PREFIXES = {
    // Inventory (from InventoryService.getNextCode calls)
    raw_materials: 'RM',           // RM-001, RM-002...
    packaging_materials: 'PM',     // PM-001, PM-002...
    semi_finished_products: 'SF',  // SF-001, SF-002...
    finished_products: 'FP',       // FP-001, FP-002...

    // Orders (from ProductionOrders.tsx and PackagingOrders.tsx)
    production_orders: 'PO',       // PO-001, PO-002...
    packaging_orders: 'PK',        // PK-001, PK-002...

    // Returns (from PurchaseReturnsService.ts and SalesReturnsService.ts)
    // Note: These services pass 'PR-' and 'SR-' WITH hyphen to get_next_code
    // But get_next_code adds another hyphen, resulting in 'PR--001'
    // This seems like a bug in the system, so we match exactly what the system produces
    purchase_returns: 'PR-',       // PR--001, PR--002... (matches system behavior)
    sales_returns: 'SR-',          // SR--001, SR--002... (matches system behavior)

    // Stocktaking (from StocktakingService.ts)
    inventory_count_sessions: 'ST', // ST-001, ST-002...

    // Invoices - These DON'T use auto-generated codes in the system!
    // Users enter invoice_number manually or leave blank
    // We'll generate sequential codes to make data usable
    purchase_invoices: 'PI',       // PI-001 (not auto-generated in system)
    sales_invoices: 'SI',          // SI-001 (not auto-generated in system)
};

// Code counters (separate from ID counters)
const codeCounters = {
    raw_materials: 1,
    packaging_materials: 1,
    semi_finished_products: 1,
    finished_products: 1,
    production_orders: 1,
    packaging_orders: 1,
    purchase_invoices: 1,
    sales_invoices: 1,
    purchase_returns: 1,
    sales_returns: 1,
    inventory_count_sessions: 1,
};

/**
 * Generate a code in the new system format: PREFIXNNN (no hyphen)
 * User confirmed system generates PI002 not PI-002
 * @param {string} tableName - The table name to generate code for
 * @returns {string} - Generated code like "FP001"
 */
function generateCode(tableName) {
    const prefix = CODE_PREFIXES[tableName] || 'XX';
    const num = codeCounters[tableName]++;
    // Format: PREFIX + padded number (NO hyphen based on user feedback)
    return `${prefix}${String(num).padStart(3, '0')}`;
}

// ===== MIGRATION FUNCTIONS =====

/**
 * Migrate financial categories (income/expense types)
 * Preserves original UUID since they are not referenced by BIGINT
 */
function migrateFinancialCategories(oldData) {
    const result = [];
    if (!oldData.financial_categories) return result;

    for (const item of oldData.financial_categories) {
        result.push({
            id: item.id, // Keep original UUID
            name: item.name,
            type: item.type, // 'income' or 'expense'
            created_at: item.created_at
        });
    }
    return result;
}

function migrateRawMaterials(oldData) {
    const result = [];
    if (!oldData.raw_materials) return result;

    for (const item of oldData.raw_materials) {
        const newId = counters.raw_materials++;
        idMaps.raw_materials.set(item.id, newId);

        result.push({
            id: newId,
            code: generateCode('raw_materials'),
            name: item.name,
            unit: item.unit,
            quantity: Number(item.quantity) || 0,
            min_stock: Number(item.min_stock) || 0,
            unit_cost: Number(item.unit_cost) || 0,
            importance: item.importance || 0,
            sales_price: Number(item.sales_price) || 0,
            created_at: item.created_at,
            updated_at: item.updated_at || item.created_at,
            price_per_unit: Number(item.unit_cost) || 0 // Ensuring price_per_unit reflects unit_cost
        });
    }
    return result;
}

function migratePackagingMaterials(oldData) {
    const result = [];
    if (!oldData.packaging_materials) return result;

    for (const item of oldData.packaging_materials) {
        const newId = counters.packaging_materials++;
        idMaps.packaging_materials.set(item.id, newId);

        result.push({
            id: newId,
            code: generateCode('packaging_materials'),
            name: item.name,
            unit: item.unit,
            quantity: Number(item.quantity) || 0,
            min_stock: Number(item.min_stock) || 0,
            unit_cost: Number(item.unit_cost) || 0,
            sales_price: Number(item.sales_price) || 0,
            created_at: item.created_at,
            updated_at: item.updated_at || item.created_at,
            price_per_unit: Number(item.unit_cost) || 0
        });
    }
    return result;
}

function migrateSemiFinishedProducts(oldData) {
    const result = [];
    if (!oldData.semi_finished_products) return result;

    for (const item of oldData.semi_finished_products) {
        const newId = counters.semi_finished_products++;
        idMaps.semi_finished_products.set(item.id, newId);

        result.push({
            id: newId,
            code: generateCode('semi_finished_products'),
            name: item.name,
            unit: item.unit,
            quantity: Number(item.quantity) || 0,
            min_stock: Number(item.min_stock) || 0,
            unit_cost: Number(item.unit_cost) || 0,
            sales_price: Number(item.sales_price) || 0,
            created_at: item.created_at,
            updated_at: item.updated_at || item.created_at,
            recipe_batch_size: 100, // Default reference batch size
            price_per_unit: Number(item.unit_cost) || 0
        });
    }
    return result;
}

function migrateSemiFinishedIngredients(oldData) {
    const result = [];
    if (!oldData.semi_finished_ingredients) return result;

    const seen = new Set();

    for (const item of oldData.semi_finished_ingredients) {
        const newSemiFinishedId = idMaps.semi_finished_products.get(item.semi_finished_id);
        const newRawMaterialId = idMaps.raw_materials.get(item.raw_material_id);

        if (!newSemiFinishedId || !newRawMaterialId) continue;

        // Prevent Duplicate Composite Keys (Conflict prevention)
        const compositeKey = `${newSemiFinishedId}-${newRawMaterialId}`;
        if (seen.has(compositeKey)) continue;
        seen.add(compositeKey);

        // In old system, percentage represented quantity per 100 units usually
        // New system has both percentage and quantity
        const percentage = Number(item.percentage);
        const quantity = percentage; // Assuming 1:1 mapping for 100 batch size

        result.push({
            id: counters.semi_finished_ingredients++,
            semi_finished_id: newSemiFinishedId,
            raw_material_id: newRawMaterialId,
            percentage: percentage,
            quantity: quantity,
            created_at: item.created_at
        });
    }
    return result;
}

function migrateFinishedProducts(oldData) {
    const result = [];
    if (!oldData.finished_products) return result;

    for (const item of oldData.finished_products) {
        const newId = counters.finished_products++;
        idMaps.finished_products.set(item.id, newId);

        const newSemiFinishedId = idMaps.semi_finished_products.get(item.semi_finished_id);

        result.push({
            id: newId,
            code: generateCode('finished_products'),
            name: item.name,
            unit: item.unit,
            quantity: Number(item.quantity) || 0,
            min_stock: Number(item.min_stock) || 0,
            unit_cost: Number(item.unit_cost) || 0,
            sales_price: Number(item.sales_price) || 0,
            semi_finished_id: newSemiFinishedId,
            semi_finished_quantity: Number(item.semi_finished_quantity) || 0,
            created_at: item.created_at,
            updated_at: item.updated_at || item.created_at,
            price_per_unit: Number(item.unit_cost) || 0
        });
    }
    return result;
}

function migrateFinishedProductPackaging(oldData) {
    const result = [];
    if (!oldData.finished_product_packaging) return result;

    const seen = new Set();

    for (const item of oldData.finished_product_packaging) {
        const newFinishedProductId = idMaps.finished_products.get(item.finished_product_id);
        const newPackagingMaterialId = idMaps.packaging_materials.get(item.packaging_material_id);

        if (!newFinishedProductId || !newPackagingMaterialId) continue;

        // Prevent Duplicate Composite Keys (Conflict prevention)
        const compositeKey = `${newFinishedProductId}-${newPackagingMaterialId}`;
        if (seen.has(compositeKey)) continue;
        seen.add(compositeKey);

        result.push({
            finished_product_id: newFinishedProductId,
            packaging_material_id: newPackagingMaterialId,
            quantity: Number(item.quantity) || 0,
            created_at: item.created_at
        });
    }
    return result;
}

function migrateParties(oldData) {
    const result = [];
    if (!oldData.parties) return result;

    const balances = new Map();
    if (oldData.party_balances) {
        for (const balance of oldData.party_balances) {
            if (balance.party_id) {
                balances.set(balance.party_id, Number(balance.balance) || 0);
            }
        }
    }

    for (const item of oldData.parties) {
        const newId = generateUUID();
        idMaps.parties.set(item.id, newId);

        let balance = balances.get(item.id) ?? (Number(item.opening_balance) || 0);

        result.push({
            id: newId,
            name: item.name,
            type: item.type,
            phone: item.phone || '',
            address: item.address || '',
            email: item.email || '',
            balance: balance,
            created_at: item.created_at,
            updated_at: item.created_at,
            tax_number: '',
            commercial_record: '',
            credit_limit: 0
        });
    }
    return result;
}

// Global calculated balances
let calculatedCashBalance = 0;
let calculatedBankBalance = 0;

function migrateFinancialTransactions(oldData) {
    const result = [];

    // 1. Payments -> Financial Transactions
    if (oldData.payments) {
        for (const payment of oldData.payments) {
            const partyId = idMaps.parties.get(payment.party_id);
            const treasuryId = payment.method === 'cash' ? idMaps.treasuries.get('cash') : idMaps.treasuries.get('bank');

            let invoiceId = null;
            let invoiceType = null;

            if (payment.related_invoice_id) {
                if (idMaps.purchase_invoices.has(payment.related_invoice_id)) {
                    invoiceId = idMaps.purchase_invoices.get(payment.related_invoice_id);
                    invoiceType = 'purchase';
                } else if (idMaps.sales_invoices.has(payment.related_invoice_id)) {
                    invoiceId = idMaps.sales_invoices.get(payment.related_invoice_id);
                    invoiceType = 'sales';
                }
            }

            const amount = Number(payment.amount) || 0;

            result.push({
                treasury_id: treasuryId,
                party_id: partyId || null,
                amount: amount,
                transaction_type: payment.payment_type === 'collection' ? 'income' : 'expense',
                category: payment.payment_type === 'collection' ? 'receipt' : 'payment',
                description: payment.notes || '',
                reference_type: null,
                reference_id: null,
                transaction_date: parseDate(payment.date),
                created_at: payment.created_at,
                invoice_id: invoiceId,
                invoice_type: invoiceType
            });

            // Update running balance
            if (payment.payment_type === 'collection') {
                if (payment.method === 'cash') calculatedCashBalance += amount;
                else calculatedBankBalance += amount;
            } else {
                if (payment.method === 'cash') calculatedCashBalance -= amount;
                else calculatedBankBalance -= amount;
            }
        }
    }

    // 2. Generic Financial Transactions -> Financial Transactions
    if (oldData.financial_transactions) {
        for (const trans of oldData.financial_transactions) {
            const treasuryId = trans.payment_method === 'cash' ? idMaps.treasuries.get('cash') : idMaps.treasuries.get('bank');
            const amount = Number(trans.amount) || 0;

            // Attempt to map category name
            let categoryName = trans.type;
            if (oldData.financial_categories && trans.category_id) {
                const cat = oldData.financial_categories.find(c => c.id === trans.category_id);
                if (cat) categoryName = cat.name;
            }

            result.push({
                treasury_id: treasuryId,
                party_id: null,
                amount: amount,
                transaction_type: trans.type,
                category: categoryName,
                description: trans.notes || '',
                reference_type: trans.reference_type,
                reference_id: trans.reference_id,
                transaction_date: parseDate(trans.date),
                created_at: trans.created_at,
                invoice_id: null,
                invoice_type: null
            });

            // Update running balance
            if (trans.type === 'income') {
                if (trans.payment_method === 'cash') calculatedCashBalance += amount;
                else calculatedBankBalance += amount;
            } else {
                if (trans.payment_method === 'cash') calculatedCashBalance -= amount;
                else calculatedBankBalance -= amount;
            }
        }
    }

    // 3. Cash Operations (Deposits, Withdrawals, Transfers)
    if (oldData.cash_operations) {
        const cashId = idMaps.treasuries.get('cash');
        const bankId = idMaps.treasuries.get('bank');

        for (const op of oldData.cash_operations) {
            const amount = Number(op.amount) || 0;
            const date = parseDate(op.date);

            if (op.operation_type === 'transfer') {
                const fromCash = op.from_account === 'cash';
                const fromId = fromCash ? cashId : bankId;
                const toId = fromCash ? bankId : cashId;

                // Outgoing transaction
                result.push({
                    treasury_id: fromId,
                    party_id: null,
                    amount: amount,
                    transaction_type: 'expense',
                    category: 'transfer_out',
                    description: `Transfer TO ${fromCash ? 'Bank' : 'Cash'}: ${op.notes || ''}`,
                    transaction_date: date,
                    created_at: op.created_at
                });

                // Incoming transaction
                result.push({
                    treasury_id: toId,
                    party_id: null,
                    amount: amount,
                    transaction_type: 'income',
                    category: 'transfer_in',
                    description: `Transfer FROM ${fromCash ? 'Cash' : 'Bank'}: ${op.notes || ''}`,
                    transaction_date: date,
                    created_at: op.created_at
                });

                if (fromCash) {
                    calculatedCashBalance -= amount;
                    calculatedBankBalance += amount;
                } else {
                    calculatedBankBalance -= amount;
                    calculatedCashBalance += amount;
                }

            } else if (op.operation_type === 'deposit') {
                const isCash = op.to_account === 'cash' || op.account_type === 'cash'; // Fallback
                const treasuryId = isCash ? cashId : bankId;

                result.push({
                    treasury_id: treasuryId,
                    party_id: null,
                    amount: amount,
                    transaction_type: 'income',
                    category: 'deposit',
                    description: `Deposit: ${op.notes || ''}`,
                    transaction_date: date,
                    created_at: op.created_at
                });

                if (isCash) calculatedCashBalance += amount;
                else calculatedBankBalance += amount;

            } else if (op.operation_type === 'withdraw') {
                const isCash = op.from_account === 'cash' || op.account_type === 'cash';
                const treasuryId = isCash ? cashId : bankId;

                result.push({
                    treasury_id: treasuryId,
                    party_id: null,
                    amount: amount,
                    transaction_type: 'expense',
                    category: 'withdrawal',
                    description: `Withdrawal: ${op.notes || ''}`,
                    transaction_date: date,
                    created_at: op.created_at
                });

                if (isCash) calculatedCashBalance -= amount;
                else calculatedBankBalance -= amount;
            }
        }
    }

    // 4. Validate against Snapshot and Adjust if necessary
    if (oldData.financial_balance && oldData.financial_balance.length > 0) {
        const snapshot = oldData.financial_balance[0];
        const targetCash = Number(snapshot.cash_balance) || 0;
        const targetBank = Number(snapshot.bank_balance) || 0;

        const cashDiff = targetCash - calculatedCashBalance;
        const bankDiff = targetBank - calculatedBankBalance;

        if (Math.abs(cashDiff) > 0.01) {
            console.log(`Adjusting Cash Balance: ${cashDiff}`);
            result.push({
                treasury_id: idMaps.treasuries.get('cash'),
                party_id: null,
                amount: Math.abs(cashDiff),
                transaction_type: cashDiff > 0 ? 'income' : 'expense',
                category: 'opening_balance_adjustment',
                description: 'System Adjustment to match Legacy Balance',
                transaction_date: getCurrentTimestamp(),
                created_at: getCurrentTimestamp()
            });
            calculatedCashBalance += cashDiff;
        }

        if (Math.abs(bankDiff) > 0.01) {
            console.log(`Adjusting Bank Balance: ${bankDiff}`);
            result.push({
                treasury_id: idMaps.treasuries.get('bank'),
                party_id: null,
                amount: Math.abs(bankDiff),
                transaction_type: bankDiff > 0 ? 'income' : 'expense',
                category: 'opening_balance_adjustment',
                description: 'System Adjustment to match Legacy Balance',
                transaction_date: getCurrentTimestamp(),
                created_at: getCurrentTimestamp()
            });
            calculatedBankBalance += bankDiff;
        }
    }

    return result;
}

function createTreasuries(oldData) {
    const result = [];

    // IDs are already needed for transaction processing, so we pre-assign them here if not done
    // But logically, this function runs BEFORE migrateFinancialTransactions in the main execution
    // However, migrateFinancialTransactions needs the IDs.
    // So we will initialize maps in main, and this function will just return the objects.

    // NOTE: Balances here are PRE-CALCULATED after processing all transactions?
    // Actually, in the new system structure, treasuries usually just have a current balance field.
    // Since we adjust the transactions to match the snapshot, we can use the snapshot values directly 
    // OR use the calculated values (which should now match).

    // To be safe, let's use the snapshot values if available, otherwise 0.
    // BUT, since we process transactions *after* creating treasuries in the script flow (usually),
    // we need to be careful.
    // In this script version, we will actually populate the treasury OBJECTS at the end of the script
    // or return them here but with placeholder balances that we update?
    // A simplified approach: Use the legacy snapshot balance directly.

    let finalCash = 0;
    let finalBank = 0;

    if (oldData.financial_balance && oldData.financial_balance.length > 0) {
        finalCash = Number(oldData.financial_balance[0].cash_balance) || 0;
        finalBank = Number(oldData.financial_balance[0].bank_balance) || 0;
    }

    // Assign IDs for map if not already (safeguard)
    if (!idMaps.treasuries.has('cash')) idMaps.treasuries.set('cash', counters.treasuries++);
    if (!idMaps.treasuries.has('bank')) idMaps.treasuries.set('bank', counters.treasuries++);

    result.push({
        id: idMaps.treasuries.get('cash'),
        name: 'الخزنة الرئيسية (نقدية)',
        type: 'cash',
        balance: finalCash,
        currency: 'EGP',
        account_number: '',
        description: 'تم الترحيل من النظام القديم',
        created_at: getCurrentTimestamp(),
        updated_at: getCurrentTimestamp()
    });

    result.push({
        id: idMaps.treasuries.get('bank'),
        name: 'حساب البنك (تحويلات)',
        type: 'bank',
        balance: finalBank,
        currency: 'EGP',
        account_number: '',
        description: 'تم الترحيل من النظام القديم',
        created_at: getCurrentTimestamp(),
        updated_at: getCurrentTimestamp()
    });

    return result;
}

function migrateProductionOrders(oldData) {
    const orders = [];
    const orderItems = [];
    if (!oldData.production_orders) return { orders, orderItems };

    for (const item of oldData.production_orders) {
        const newId = counters.production_orders++;
        idMaps.production_orders.set(item.id, newId);

        let semiFinishedId = null;
        if (item.product_code) {
            const found = oldData.semi_finished_products?.find(sfp => sfp.code === item.product_code);
            if (found) semiFinishedId = idMaps.semi_finished_products.get(found.id);
        }

        orders.push({
            id: newId,
            code: generateCode('production_orders'),
            date: parseDate(item.date),
            status: item.status,
            notes: '',
            total_cost: Number(item.total_cost) || 0,
            created_at: item.created_at,
            updated_at: item.updated_at || item.created_at
        });

        const q = Number(item.quantity) || 0;
        const tc = Number(item.total_cost) || 0;

        // In old system, production_orders table had the item details directly in some cases?
        // Looking at the data, it seems yes. But verified with user that production_order_items is needed.
        // The previous script assumed 1 item per order based on the order row itself.
        // We will stick to that logical mapping ensuring semiFinishedId is found.

        if (semiFinishedId) {
            orderItems.push({
                production_order_id: newId,
                semi_finished_id: semiFinishedId,
                quantity: q,
                unit_cost: q > 0 ? tc / q : 0,
                total_cost: tc,
                created_at: item.created_at
            });
        }
    }
    return { orders, orderItems };
}

function migratePackagingOrders(oldData) {
    const orders = [];
    const orderItems = [];
    if (!oldData.packaging_orders) return { orders, orderItems };

    for (const item of oldData.packaging_orders) {
        const newId = counters.packaging_orders++;
        idMaps.packaging_orders.set(item.id, newId);

        let finishedProductId = null;
        if (item.product_code) {
            const found = oldData.finished_products?.find(fp => fp.code === item.product_code);
            if (found) finishedProductId = idMaps.finished_products.get(found.id);
        }

        orders.push({
            id: newId,
            code: generateCode('packaging_orders'),
            date: parseDate(item.date),
            status: item.status,
            notes: '',
            total_cost: Number(item.total_cost) || 0,
            created_at: item.created_at,
            updated_at: item.updated_at || item.created_at
        });

        if (finishedProductId) {
            const q = Number(item.quantity) || 0;
            const tc = Number(item.total_cost) || 0;
            orderItems.push({
                packaging_order_id: newId,
                finished_product_id: finishedProductId,
                quantity: q,
                unit_cost: q > 0 ? tc / q : 0,
                total_cost: tc,
                created_at: item.created_at
            });
        }
    }
    return { orders, orderItems };
}

function migrateInvoices(oldData) {
    const purchaseInvoices = [];
    const salesInvoices = [];
    const purchaseInvoiceItems = [];
    const salesInvoiceItems = [];

    if (!oldData.invoices) return { purchaseInvoices, salesInvoices, purchaseInvoiceItems, salesInvoiceItems };

    for (const invoice of oldData.invoices) {
        const partyId = idMaps.parties.get(invoice.party_id);
        const date = parseDate(invoice.date);
        const totalAmount = Number(invoice.total_amount) || 0;

        if (invoice.invoice_type === 'purchase') {
            const newId = counters.purchase_invoices++;
            idMaps.purchase_invoices.set(invoice.id, newId);

            purchaseInvoices.push({
                id: newId,
                invoice_number: generateCode('purchase_invoices'),
                supplier_id: partyId,
                treasury_id: null,
                transaction_date: date,
                total_amount: totalAmount,
                paid_amount: 0,
                tax_amount: 0,
                discount_amount: 0,
                shipping_cost: 0,
                status: 'posted',
                notes: invoice.notes || null,
                created_at: invoice.created_at,
                updated_at: invoice.created_at
            });
        } else if (invoice.invoice_type === 'sale') {
            const newId = counters.sales_invoices++;
            idMaps.sales_invoices.set(invoice.id, newId);

            salesInvoices.push({
                id: newId,
                invoice_number: generateCode('sales_invoices'),
                customer_id: partyId,
                treasury_id: null,
                transaction_date: date,
                total_amount: totalAmount,
                paid_amount: 0,
                tax_amount: 0,
                discount_amount: 0,
                shipping_cost: 0,
                status: 'posted',
                notes: invoice.notes || null,
                created_at: invoice.created_at,
                updated_at: invoice.created_at
            });
        }
    }

    if (oldData.invoice_items) {
        for (const item of oldData.invoice_items) {
            const oldInvoice = oldData.invoices?.find(inv => inv.id === item.invoice_id);
            if (!oldInvoice) continue;

            const finishedProductId = idMaps.finished_products.get(item.item_id);
            const rawMaterialId = idMaps.raw_materials.get(item.item_id);
            const packagingMaterialId = idMaps.packaging_materials.get(item.item_id);
            const semiFinishedProductId = idMaps.semi_finished_products.get(item.item_id);

            const qty = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const total = Number(item.total) || 0;
            const itemType = item.item_type.replace(/s$/, ''); // Remove trailing 's'

            if (oldInvoice.invoice_type === 'purchase') {
                const newInvoiceId = idMaps.purchase_invoices.get(item.invoice_id);

                // RESTRICTION Based on check_purchase_item_source constraint:
                // Typically implies only Raw Materials and Packaging Materials can be purchased.
                // We will filter out semi_finished_products and finished_products from PURCHASE invoices.
                const isPurchasable = itemType === 'raw_material' || itemType === 'packaging_material';

                if (newInvoiceId && isPurchasable) {
                    purchaseInvoiceItems.push({
                        invoice_id: newInvoiceId,
                        item_type: itemType,
                        raw_material_id: item.item_type === 'raw_materials' ? rawMaterialId : null,
                        packaging_material_id: item.item_type === 'packaging_materials' ? packagingMaterialId : null,
                        finished_product_id: null, // Should be null for purchases usually, or at least raw/pkg don't have this
                        semi_finished_product_id: null, // Filtered out, so null
                        quantity: qty,
                        unit_price: unitPrice,
                        total_price: total
                    });
                }
            } else if (oldInvoice.invoice_type === 'sale') {
                const newInvoiceId = idMaps.sales_invoices.get(item.invoice_id);
                // STRICT FILTER: New system only allows 'finished_product' in sales_invoice_items
                if (newInvoiceId && item.item_type === 'finished_products' && finishedProductId) {
                    salesInvoiceItems.push({
                        invoice_id: newInvoiceId,
                        item_type: 'finished_product', // Enforce singular
                        finished_product_id: finishedProductId,
                        quantity: qty,
                        unit_price: unitPrice,
                        total_price: total,
                        unit_cost_at_sale: 0
                    });
                } else {
                    // Log skipped items for visibility
                    // console.log(`Skipping non-finished product sales item: Invoice ${item.invoice_id}, Type ${item.item_type}`);
                }
            }
        }
    }

    return { purchaseInvoices, salesInvoices, purchaseInvoiceItems, salesInvoiceItems };
}

// ===== MAIN =====

function migrate() {
    console.log('STARTING PRECISE MIGRATION...');

    const oldDataRaw = fs.readFileSync(OLD_BACKUP_PATH, 'utf8');
    const oldData = JSON.parse(oldDataRaw);

    const newData = {
        metadata: {
            version: '1.0.0',
            createdAt: getCurrentTimestamp(),
            tableCount: 0,
            recordCount: 0,
            appName: 'Smart Factory',
            migratedFrom: 'legacy-system',
            migrationDate: getCurrentTimestamp()
        },
        tables: {}
    };

    // Execution Order matters for ID referencing
    newData.tables.financial_categories = migrateFinancialCategories(oldData);
    newData.tables.raw_materials = migrateRawMaterials(oldData);
    newData.tables.packaging_materials = migratePackagingMaterials(oldData);
    newData.tables.semi_finished_products = migrateSemiFinishedProducts(oldData);
    newData.tables.semi_finished_ingredients = migrateSemiFinishedIngredients(oldData);
    newData.tables.finished_products = migrateFinishedProducts(oldData);
    newData.tables.finished_product_packaging = migrateFinishedProductPackaging(oldData);

    newData.tables.parties = migrateParties(oldData);

    // Pre-initialize treasury IDs for transaction mapping
    idMaps.treasuries.set('cash', counters.treasuries++);
    idMaps.treasuries.set('bank', counters.treasuries++);

    const prod = migrateProductionOrders(oldData);
    newData.tables.production_orders = prod.orders;
    newData.tables.production_order_items = prod.orderItems;

    const pkg = migratePackagingOrders(oldData);
    newData.tables.packaging_orders = pkg.orders;
    newData.tables.packaging_order_items = pkg.orderItems;

    const inv = migrateInvoices(oldData);
    newData.tables.purchase_invoices = inv.purchaseInvoices;
    newData.tables.sales_invoices = inv.salesInvoices;
    newData.tables.purchase_invoice_items = inv.purchaseInvoiceItems;
    newData.tables.sales_invoice_items = inv.salesInvoiceItems;

    // Migrate transactions AND calculate adjustments
    newData.tables.financial_transactions = migrateFinancialTransactions(oldData);

    // Create Treasuries with FINAL SNAPSHOT balances
    newData.tables.treasuries = createTreasuries(oldData);

    // Empty tables for compatibility
    newData.tables.purchase_returns = [];
    newData.tables.sales_returns = [];
    newData.tables.purchase_return_items = [];
    newData.tables.sales_return_items = [];
    newData.tables.inventory_count_sessions = [];
    newData.tables.inventory_count_items = [];

    // Calculate stats
    let totalRecords = 0;
    let tableCount = 0;
    for (const [k, v] of Object.entries(newData.tables)) {
        if (Array.isArray(v)) {
            totalRecords += v.length;
            tableCount++;
            console.log(`${k}: ${v.length}`);
        }
    }
    newData.metadata.tableCount = tableCount;
    newData.metadata.recordCount = totalRecords;

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(newData, null, 2), 'utf8');
    console.log(`\nSUCCESS! Output saved to: ${OUTPUT_PATH}`);
    // Log final calculated vs snapshot for debug
    console.log(`Calculated Final (Pre-Adjustment): Cash ${calculatedCashBalance}, Bank ${calculatedBankBalance}`);
}

try {
    migrate();
} catch (e) {
    console.error('ERROR:', e);
}
