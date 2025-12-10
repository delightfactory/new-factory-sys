import { supabase } from "@/integrations/supabase/client";

/**
 * Backup Service - Handles full database export, import, and factory reset
 * Uses client-side JSON files for maximum security and user control
 */

// Table dependency order (must respect FK relationships)
const TABLE_EXPORT_ORDER = [
    // Level 1: No dependencies
    'treasuries',
    'raw_materials',
    'packaging_materials',
    'parties',

    // Level 2: Depends on Level 1
    'semi_finished_products',
    'semi_finished_ingredients',

    // Level 3: Depends on Level 2
    'finished_products',
    'finished_product_packaging',
    'production_orders',
    'packaging_orders',

    // Level 4: Depends on Level 3
    'production_order_items',
    'packaging_order_items',
    'purchase_invoices',
    'sales_invoices',

    // Level 5: Depends on Level 4
    'purchase_invoice_items',
    'sales_invoice_items',
    'purchase_returns',
    'sales_returns',
    'purchase_return_items',
    'sales_return_items',
    'financial_transactions',

    // Level 6: Logs and audit
    'inventory_count_sessions',
    'inventory_count_items',
];

// Tables that use UUID as primary key (not BIGINT)
const UUID_TABLES = ['parties'];

// Tables to reset (reverse order for FK compliance)
const TABLE_RESET_ORDER = [...TABLE_EXPORT_ORDER].reverse();

export interface BackupMetadata {
    version: string;
    createdAt: string;
    tableCount: number;
    recordCount: number;
    appName: string;
}

export interface BackupData {
    metadata: BackupMetadata;
    tables: Record<string, any[]>;
}

export interface BackupProgress {
    currentTable: string;
    currentIndex: number;
    totalTables: number;
    status: 'exporting' | 'importing' | 'resetting' | 'complete' | 'error';
    message?: string;
}

/**
 * Helper to delete all records from a table
 * Handles both UUID and BIGINT primary keys
 */
async function deleteAllFromTable(tableName: string): Promise<{ error: any }> {
    if (UUID_TABLES.includes(tableName)) {
        // For UUID tables, use a different approach - delete where id is not null
        return await supabase
            .from(tableName)
            .delete()
            .not('id', 'is', null);
    } else {
        // For BIGINT tables, use gte(0) which covers all positive IDs
        return await supabase
            .from(tableName)
            .delete()
            .gte('id', 0);
    }
}

export const BackupService = {
    /**
     * Create a full backup of all data
     */
    createBackup: async (onProgress?: (progress: BackupProgress) => void): Promise<BackupData> => {
        const tables: Record<string, any[]> = {};
        let totalRecords = 0;

        for (let i = 0; i < TABLE_EXPORT_ORDER.length; i++) {
            const tableName = TABLE_EXPORT_ORDER[i];

            onProgress?.({
                currentTable: tableName,
                currentIndex: i + 1,
                totalTables: TABLE_EXPORT_ORDER.length,
                status: 'exporting',
                message: `جاري تصدير ${tableName}...`
            });

            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*');

                if (error) {
                    console.warn(`Warning: Could not export ${tableName}:`, error.message);
                    tables[tableName] = [];
                } else {
                    tables[tableName] = data || [];
                    totalRecords += (data?.length || 0);
                }
            } catch (e) {
                console.warn(`Warning: Table ${tableName} might not exist`);
                tables[tableName] = [];
            }
        }

        const backup: BackupData = {
            metadata: {
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                tableCount: Object.keys(tables).length,
                recordCount: totalRecords,
                appName: 'المصنع الذكي'
            },
            tables
        };

        onProgress?.({
            currentTable: '',
            currentIndex: TABLE_EXPORT_ORDER.length,
            totalTables: TABLE_EXPORT_ORDER.length,
            status: 'complete',
            message: `تم تصدير ${totalRecords} سجل بنجاح`
        });

        return backup;
    },

    /**
     * Download backup as JSON file
     */
    downloadBackup: async (onProgress?: (progress: BackupProgress) => void): Promise<void> => {
        const backup = await BackupService.createBackup(onProgress);

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `factory-backup-${timestamp}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Validate backup file structure
     */
    validateBackup: (data: any): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        if (!data || typeof data !== 'object') {
            errors.push('ملف النسخة الاحتياطية غير صالح');
            return { valid: false, errors };
        }

        if (!data.metadata) {
            errors.push('بيانات التعريف (metadata) مفقودة');
        } else {
            if (!data.metadata.version) errors.push('رقم الإصدار مفقود');
            if (!data.metadata.createdAt) errors.push('تاريخ الإنشاء مفقود');
        }

        if (!data.tables || typeof data.tables !== 'object') {
            errors.push('بيانات الجداول مفقودة');
        }

        return { valid: errors.length === 0, errors };
    },

    /**
     * Restore backup (CAUTION: This will overwrite existing data)
     * First deletes all existing data in reverse order, then inserts in correct order
     */
    restoreBackup: async (
        backup: BackupData,
        onProgress?: (progress: BackupProgress) => void
    ): Promise<{ success: boolean; errors: string[] }> => {
        const errors: string[] = [];

        // Validate first
        const validation = BackupService.validateBackup(backup);
        if (!validation.valid) {
            return { success: false, errors: validation.errors };
        }

        // Step 1: Delete ALL existing data in reverse order (children first)
        for (let i = 0; i < TABLE_RESET_ORDER.length; i++) {
            const tableName = TABLE_RESET_ORDER[i];

            onProgress?.({
                currentTable: tableName,
                currentIndex: i + 1,
                totalTables: TABLE_RESET_ORDER.length + TABLE_EXPORT_ORDER.length,
                status: 'importing',
                message: `جاري مسح ${tableName}...`
            });

            try {
                const { error } = await deleteAllFromTable(tableName);
                if (error) {
                    console.warn(`Warning deleting ${tableName}:`, error.message);
                }
            } catch (e: any) {
                console.warn(`Error deleting ${tableName}:`, e.message);
            }
        }

        // Step 2: Insert new data in correct order (parents first)
        for (let i = 0; i < TABLE_EXPORT_ORDER.length; i++) {
            const tableName = TABLE_EXPORT_ORDER[i];
            const tableData = backup.tables[tableName];

            onProgress?.({
                currentTable: tableName,
                currentIndex: TABLE_RESET_ORDER.length + i + 1,
                totalTables: TABLE_RESET_ORDER.length + TABLE_EXPORT_ORDER.length,
                status: 'importing',
                message: `جاري استيراد ${tableName}...`
            });

            if (!tableData || tableData.length === 0) {
                continue;
            }

            try {
                // Insert new data in batches
                const batchSize = 50;
                for (let j = 0; j < tableData.length; j += batchSize) {
                    const batch = tableData.slice(j, j + batchSize);

                    // Remove auto-generated timestamps but keep IDs
                    const cleanedBatch = batch.map((row: any) => {
                        const cleaned = { ...row };
                        delete cleaned.created_at;
                        delete cleaned.updated_at;
                        return cleaned;
                    });

                    const { error } = await supabase.from(tableName).insert(cleanedBatch);

                    if (error) {
                        errors.push(`خطأ في ${tableName}: ${error.message}`);
                        console.error(`Error inserting into ${tableName}:`, error);
                    }
                }
            } catch (e: any) {
                errors.push(`فشل استيراد ${tableName}: ${e.message}`);
            }
        }

        onProgress?.({
            currentTable: '',
            currentIndex: TABLE_RESET_ORDER.length + TABLE_EXPORT_ORDER.length,
            totalTables: TABLE_RESET_ORDER.length + TABLE_EXPORT_ORDER.length,
            status: errors.length > 0 ? 'error' : 'complete',
            message: errors.length > 0
                ? `تم الاستيراد مع ${errors.length} أخطاء`
                : 'تم استيراد النسخة الاحتياطية بنجاح'
        });

        return { success: errors.length === 0, errors };
    },

    /**
     * Factory Reset - Delete ALL data (DANGER!)
     * Preserves table structure but removes all records
     */
    factoryReset: async (
        confirmationCode: string,
        onProgress?: (progress: BackupProgress) => void
    ): Promise<{ success: boolean; errors: string[] }> => {
        // Safety check
        if (confirmationCode !== 'FACTORY_RESET_CONFIRM') {
            return {
                success: false,
                errors: ['رمز التأكيد غير صحيح']
            };
        }

        const errors: string[] = [];

        // Delete in reverse order (children before parents)
        for (let i = 0; i < TABLE_RESET_ORDER.length; i++) {
            const tableName = TABLE_RESET_ORDER[i];

            onProgress?.({
                currentTable: tableName,
                currentIndex: i + 1,
                totalTables: TABLE_RESET_ORDER.length,
                status: 'resetting',
                message: `جاري حذف ${tableName}...`
            });

            try {
                const { error } = await deleteAllFromTable(tableName);

                if (error) {
                    console.warn(`Warning deleting ${tableName}:`, error.message);
                    errors.push(`تحذير: ${tableName} - ${error.message}`);
                }
            } catch (e: any) {
                errors.push(`فشل حذف ${tableName}: ${e.message}`);
            }
        }

        onProgress?.({
            currentTable: '',
            currentIndex: TABLE_RESET_ORDER.length,
            totalTables: TABLE_RESET_ORDER.length,
            status: 'complete',
            message: 'تم إعادة ضبط المصنع بنجاح. جميع البيانات تم حذفها.'
        });

        return { success: errors.length === 0, errors };
    },

    /**
     * Get backup statistics for preview
     */
    getBackupStats: async (): Promise<Record<string, number>> => {
        const stats: Record<string, number> = {};

        for (const tableName of TABLE_EXPORT_ORDER) {
            try {
                const { count } = await supabase
                    .from(tableName)
                    .select('*', { count: 'exact', head: true });
                stats[tableName] = count || 0;
            } catch {
                stats[tableName] = 0;
            }
        }

        return stats;
    }
};

