import { supabase } from "@/integrations/supabase/client";
import { readCompleteBackupTable } from "@/platform/backup/read-complete-table";

/**
 * Exports selected public business tables for inspection and archiving.
 * Full recovery requires the maintenance procedure, including private journals, Auth and Storage.
 */

// Table dependency order (must respect FK relationships)
// Verified against all foreign key constraints - DO NOT REORDER
const TABLE_EXPORT_ORDER = [
    // Level 1: No dependencies (Master Data)
    'treasuries',
    'raw_materials',
    'packaging_materials',
    'parties',
    'financial_categories',    // تصنيفات المصروفات والإيرادات
    // NOTE: 'profiles' is NOT included here - see TABLES_EXPORT_ONLY

    // Level 2: Depends on Level 1
    'semi_finished_products',
    'semi_finished_ingredients',

    // Level 3: Depends on Level 2
    'finished_products',
    'finished_product_packaging',
    'product_bundles',         // NEW: Bundle definitions
    'bundle_items',            // NEW: Bundle components (depends on all inventory tables)
    'production_orders',
    'packaging_orders',
    'bundle_assembly_orders',  // NEW: Assembly orders

    // Level 4: Depends on Level 3
    'production_order_items',
    'production_order_consumed_materials',  // المواد المستهلكة في الإنتاج
    'packaging_order_items',
    'packaging_order_consumed_materials',   // المواد المستهلكة في التعبئة
    'bundle_assembly_order_items',          // NEW: Assembly order items
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
    'inventory_movements',     // سجل حركات المخزون
];

// Tables that are ONLY exported but NOT restored (currently empty)
// NOTE: 'profiles' was removed completely - it has FK to auth.users
// and including it in backups could cause confusion or errors if restored
const TABLES_EXPORT_ONLY: string[] = [
    // Empty - no tables are export-only currently
    // 'profiles' is managed by Supabase Auth and should NOT be backed up
];

// Combined list for export (includes EXPORT_ONLY tables at the end)
const ALL_EXPORT_TABLES = [...TABLE_EXPORT_ORDER, ...TABLES_EXPORT_ONLY];

export interface BackupMetadata {
    version: string;
    createdAt: string;
    tableCount: number;
    recordCount: number;
    appName: string;
    scope?: 'business-tables-export';
    recoveryCompatible?: false;
}

export interface BackupData {
    metadata: BackupMetadata;
    tables: Record<string, Record<string, unknown>[]>;
}

export interface BackupProgress {
    currentTable: string;
    currentIndex: number;
    totalTables: number;
    status: 'exporting' | 'importing' | 'resetting' | 'complete' | 'error';
    message?: string;
}

export const BACKUP_MAINTENANCE_NOTICE = 'استعادة البيانات وإعادة ضبطها متوقفتان من داخل التطبيق لحماية ترابط الفواتير والمخزون وسجلات العمليات. الاستعادة الكاملة ينفذها مسؤول النظام أثناء صيانة مخططة.';

function requireMaintenance(onProgress?: (progress: BackupProgress) => void) {
    onProgress?.({ currentTable: '', currentIndex: 0, totalTables: TABLE_EXPORT_ORDER.length,
        status: 'error', message: BACKUP_MAINTENANCE_NOTICE });
    return { success: false, errors: [BACKUP_MAINTENANCE_NOTICE] };
}

export const BackupService = {
    /**
     * Export selected public business tables. This is not a full recovery snapshot.
     */
    createBackup: async (onProgress?: (progress: BackupProgress) => void): Promise<BackupData> => {
        const tables: Record<string, Record<string, unknown>[]> = {};
        let totalRecords = 0;

        for (let i = 0; i < ALL_EXPORT_TABLES.length; i++) {
            const tableName = ALL_EXPORT_TABLES[i];

            onProgress?.({
                currentTable: tableName,
                currentIndex: i + 1,
                totalTables: ALL_EXPORT_TABLES.length,
                status: 'exporting',
                message: `جاري تصدير ${tableName}...`
            });

            try {
                const rows = await readCompleteBackupTable(async (from, to) => {
                    const { data, error, count } = await supabase
                        .from(tableName)
                        .select('*', { count: 'exact' })
                        .order('id', { ascending: true })
                        .range(from, to);
                    return { rows: data, error, count };
                });
                tables[tableName] = rows;
                totalRecords += rows.length;
            } catch (error) {
                const message = "لم تكتمل النسخة الاحتياطية، ولم يتم إنشاء ملف ناقص. أعد المحاولة بعد انتهاء العمليات الجارية والتأكد من الاتصال.";
                onProgress?.({
                    currentTable: tableName,
                    currentIndex: i + 1,
                    totalTables: ALL_EXPORT_TABLES.length,
                    status: 'error',
                    message
                });
                throw new Error(message, { cause: error });
            }
        }

        const backup: BackupData = {
            metadata: {
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                tableCount: Object.keys(tables).length,
                recordCount: totalRecords,
                appName: 'المصنع الذكي',
                scope: 'business-tables-export',
                recoveryCompatible: false
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
    validateBackup: (data: unknown): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        if (!data || typeof data !== 'object') {
            errors.push('ملف النسخة الاحتياطية غير صالح');
            return { valid: false, errors };
        }

        const backup = data as Partial<BackupData>;
        if (!backup.metadata) {
            errors.push('بيانات التعريف (metadata) مفقودة');
        } else {
            if (!backup.metadata.version) errors.push('رقم الإصدار مفقود');
            if (!backup.metadata.createdAt) errors.push('تاريخ الإنشاء مفقود');
        }

        if (!backup.tables || typeof backup.tables !== 'object') {
            errors.push('بيانات الجداول مفقودة');
        }

        return { valid: errors.length === 0, errors };
    },

    // Preserve the existing method contract, with no read or write request.
    restoreBackup: async (
        _backup: BackupData,
        onProgress?: (progress: BackupProgress) => void
    ): Promise<{ success: boolean; errors: string[] }> => requireMaintenance(onProgress),

    factoryReset: async (
        _confirmationCode: string,
        onProgress?: (progress: BackupProgress) => void
    ): Promise<{ success: boolean; errors: string[] }> => requireMaintenance(onProgress),

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

