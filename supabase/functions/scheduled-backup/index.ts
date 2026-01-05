// @ts-nocheck
// Note: TypeScript errors are expected - Edge Functions run on Deno, not Node.js
// These errors will NOT affect deployment or runtime

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Scheduled Backup Edge Function
 * 
 * Creates a full backup of the database and stores it in Supabase Storage.
 * Uses the same table order as BackupService.ts to ensure compatibility.
 * 
 * IMPORTANT: 
 * - 'profiles' table is EXCLUDED (FK to auth.users prevents safe restore)
 * - Runs daily at 1 AM UTC (3 AM Cairo time)
 */

// Table dependency order - MUST match BackupService.ts TABLE_EXPORT_ORDER
// EXCLUDES: profiles (cannot be safely restored due to FK to auth.users)
const TABLE_EXPORT_ORDER = [
    // Level 1: No dependencies (Master Data)
    'treasuries',
    'raw_materials',
    'packaging_materials',
    'parties',
    'financial_categories',
    // NOTE: 'profiles' is EXCLUDED - has FK to auth.users

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
    'production_order_consumed_materials',
    'packaging_order_items',
    'packaging_order_consumed_materials',
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
    'inventory_movements',
]

interface BackupMetadata {
    version: string
    createdAt: string
    tableCount: number
    recordCount: number
    appName: string
    backupType: 'automatic' | 'manual'
}

interface BackupData {
    metadata: BackupMetadata
    tables: Record<string, unknown[]>
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Verify authorization
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        console.log('Starting scheduled backup...')

        // Create backup data structure
        const tables: Record<string, unknown[]> = {}
        let totalRecords = 0

        // Export each table
        for (const tableName of TABLE_EXPORT_ORDER) {
            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')

                if (error) {
                    console.warn(`Warning: Could not export ${tableName}:`, error.message)
                    tables[tableName] = []
                } else {
                    tables[tableName] = data || []
                    totalRecords += (data?.length || 0)
                    console.log(`Exported ${tableName}: ${data?.length || 0} records`)
                }
            } catch (e) {
                console.warn(`Warning: Table ${tableName} might not exist:`, e)
                tables[tableName] = []
            }
        }

        // Create backup object
        const backup: BackupData = {
            metadata: {
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                tableCount: Object.keys(tables).length,
                recordCount: totalRecords,
                appName: 'المصنع الذكي',
                backupType: 'automatic'
            },
            tables
        }

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `auto-backup-${timestamp}.json`
        const backupContent = JSON.stringify(backup, null, 2)

        console.log(`Uploading backup: ${filename} (${backupContent.length} bytes)`)

        // Upload to Storage
        const { error: uploadError } = await supabase.storage
            .from('backups')
            .upload(filename, backupContent, {
                contentType: 'application/json',
                upsert: false
            })

        if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`)
        }

        console.log('Backup uploaded successfully')

        // Log the backup in backup_logs table
        const { error: logError } = await supabase.from('backup_logs').insert({
            filename,
            size_bytes: backupContent.length,
            record_count: totalRecords,
            status: 'success',
        })

        if (logError) {
            console.warn('Failed to log backup:', logError.message)
        }

        // Cleanup old backups (keep last 7)
        console.log('Cleaning up old backups...')
        const { data: allBackups } = await supabase.storage
            .from('backups')
            .list('', {
                limit: 100,
                sortBy: { column: 'created_at', order: 'desc' }
            })

        if (allBackups && allBackups.length > 7) {
            const oldBackups = allBackups.slice(7)
            console.log(`Removing ${oldBackups.length} old backups`)

            for (const oldBackup of oldBackups) {
                const { error: removeError } = await supabase.storage
                    .from('backups')
                    .remove([oldBackup.name])

                if (!removeError) {
                    // Mark as deleted in logs
                    await supabase.from('backup_logs')
                        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
                        .eq('filename', oldBackup.name)
                }
            }
        }

        console.log('Backup completed successfully')

        return new Response(
            JSON.stringify({
                success: true,
                filename,
                recordCount: totalRecords,
                tableCount: Object.keys(tables).length,
                sizeBytes: backupContent.length,
                timestamp: new Date().toISOString()
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Backup failed:', errorMessage)

        // Try to log the error
        try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const supabase = createClient(supabaseUrl, supabaseServiceKey)

            await supabase.from('backup_logs').insert({
                filename: `failed-${new Date().toISOString().replace(/[:.]/g, '-')}`,
                status: 'failed',
                error_message: errorMessage,
            })
        } catch (logError) {
            console.error('Failed to log error:', logError)
        }

        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
