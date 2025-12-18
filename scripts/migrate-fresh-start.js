import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== FRESH START CONFIGURATION =====
// This script creates a clean slate with inventory, parties, and treasuries only
// NO orders, NO invoices, NO transaction history
const OLD_BACKUP_PATH = path.join(__dirname, '..', 'backup_2025-12-18_19-34-04.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'fresh-start-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');

// ID Mapping - to convert old IDs to new sequential IDs
const idMaps = {
    raw_materials: new Map(),
    packaging_materials: new Map(),
    semi_finished_products: new Map(),
    finished_products: new Map(),
    parties: new Map(),
    treasuries: new Map(),
};

// Counters for new IDs
const counters = {
    raw_materials: 1,
    packaging_materials: 1,
    semi_finished_products: 1,
    finished_products: 1,
    treasuries: 1,
    semi_finished_ingredients: 1,
    finished_product_packaging: 1,
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

// Code Prefixes (matching the new system - NO hyphen)
const CODE_PREFIXES = {
    raw_materials: 'RM',
    packaging_materials: 'PM',
    semi_finished_products: 'SF',
    finished_products: 'FP',
};

const codeCounters = {
    raw_materials: 1,
    packaging_materials: 1,
    semi_finished_products: 1,
    finished_products: 1,
};

function generateCode(tableName) {
    const prefix = CODE_PREFIXES[tableName] || 'XX';
    const num = codeCounters[tableName]++;
    return `${prefix}${String(num).padStart(3, '0')}`;
}

// ===== MIGRATION FUNCTIONS =====

function migrateFinancialCategories(oldData) {
    const result = [];
    if (!oldData.financial_categories) return result;

    for (const item of oldData.financial_categories) {
        result.push({
            id: item.id,
            name: item.name,
            type: item.type,
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
            price_per_unit: Number(item.unit_cost) || 0
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
            recipe_batch_size: 100,
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

        // Prevent Duplicate Composite Keys
        const compositeKey = `${newSemiFinishedId}-${newRawMaterialId}`;
        if (seen.has(compositeKey)) continue;
        seen.add(compositeKey);

        // Match original script logic
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

    for (const party of oldData.parties) {
        const newId = generateUUID();
        idMaps.parties.set(party.id, newId);

        // Get balance from party_balances if available
        let balance = Number(party.balance) || 0;
        if (oldData.party_balances) {
            const balanceRecord = oldData.party_balances.find(b => b.party_id === party.id);
            if (balanceRecord) {
                balance = Number(balanceRecord.balance) || 0;
            }
        }

        result.push({
            id: newId,
            name: party.name,
            type: party.type,
            phone: party.phone || null,
            email: party.email || null,
            address: party.address || null,
            tax_number: party.tax_number || null,
            commercial_record: party.commercial_record || null,
            balance: balance,
            credit_limit: Number(party.credit_limit) || 0,
            created_at: party.created_at
        });
    }
    return result;
}

function createTreasuries(oldData) {
    // Get balances from financial_balance
    let cashBalance = 0;
    let bankBalance = 0;

    if (oldData.financial_balance) {
        const fb = oldData.financial_balance;
        if (Array.isArray(fb) && fb.length > 0) {
            cashBalance = Number(fb[0].cash_balance) || 0;
            bankBalance = Number(fb[0].bank_balance) || 0;
        } else if (fb.cash_balance !== undefined) {
            cashBalance = Number(fb.cash_balance) || 0;
            bankBalance = Number(fb.bank_balance) || 0;
        }
    }

    console.log(`Fresh Start Balances: Cash ${cashBalance}, Bank ${bankBalance}`);

    return [
        {
            id: 1,
            name: 'الخزنة الرئيسية',
            type: 'cash',
            currency: 'EGP',
            account_number: null,
            balance: cashBalance,
            description: 'الخزنة النقدية الرئيسية',
            created_at: getCurrentTimestamp()
        },
        {
            id: 2,
            name: 'الحساب البنكي',
            type: 'bank',
            currency: 'EGP',
            account_number: null,
            balance: bankBalance,
            description: 'الحساب البنكي الرئيسي',
            created_at: getCurrentTimestamp()
        }
    ];
}

// ===== MAIN =====

function migrate() {
    console.log('========================================');
    console.log('FRESH START MIGRATION');
    console.log('Inventory + Parties + Treasuries ONLY');
    console.log('NO orders, NO invoices, NO history');
    console.log('========================================');

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
            migrationDate: getCurrentTimestamp(),
            migrationType: 'FRESH_START'
        },
        tables: {}
    };

    // Core data only
    newData.tables.financial_categories = migrateFinancialCategories(oldData);
    newData.tables.raw_materials = migrateRawMaterials(oldData);
    newData.tables.packaging_materials = migratePackagingMaterials(oldData);
    newData.tables.semi_finished_products = migrateSemiFinishedProducts(oldData);
    newData.tables.semi_finished_ingredients = migrateSemiFinishedIngredients(oldData);
    newData.tables.finished_products = migrateFinishedProducts(oldData);
    newData.tables.finished_product_packaging = migrateFinishedProductPackaging(oldData);
    newData.tables.parties = migrateParties(oldData);
    newData.tables.treasuries = createTreasuries(oldData);

    // Empty tables for compatibility (required by restore function)
    newData.tables.production_orders = [];
    newData.tables.production_order_items = [];
    newData.tables.packaging_orders = [];
    newData.tables.packaging_order_items = [];
    newData.tables.purchase_invoices = [];
    newData.tables.sales_invoices = [];
    newData.tables.purchase_invoice_items = [];
    newData.tables.sales_invoice_items = [];
    newData.tables.financial_transactions = [];
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

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(newData, null, 2));
    console.log('========================================');
    console.log(`SUCCESS! Fresh Start saved to: ${OUTPUT_PATH}`);
    console.log(`Total Records: ${totalRecords}`);
    console.log('========================================');
}

migrate();
