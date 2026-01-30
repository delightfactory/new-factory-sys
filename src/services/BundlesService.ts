import { supabase } from "@/integrations/supabase/client";
import type { ProductBundle, BundleItem, BundleAssemblyOrder, BundleItemType } from "@/types";

/**
 * Bundles Service - Handles all bundle-related operations
 * Supports multi-type bundles (finished, semi-finished, raw, packaging)
 */
export const BundlesService = {
    // ============================================================================
    // BUNDLES CRUD
    // ============================================================================

    /**
     * Get all bundles with optional filtering
     */
    getBundles: async (activeOnly = false): Promise<ProductBundle[]> => {
        let query = supabase
            .from('product_bundles')
            .select('*')
            .order('created_at', { ascending: false });

        if (activeOnly) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as ProductBundle[];
    },

    /**
     * Get single bundle with its items and item details
     */
    getBundle: async (id: number): Promise<ProductBundle & { items: BundleItem[] }> => {
        // Get bundle
        const { data: bundle, error: bundleError } = await supabase
            .from('product_bundles')
            .select('*')
            .eq('id', id)
            .single();

        if (bundleError) throw bundleError;

        // Get items with joined data
        const { data: items, error: itemsError } = await supabase
            .from('bundle_items')
            .select('*')
            .eq('bundle_id', id);

        if (itemsError) throw itemsError;

        // Enrich items with product details
        const enrichedItems = await Promise.all(
            (items || []).map(async (item: any) => {
                let itemDetails = { name: '', code: '', unit: '', quantity: 0 };

                if (item.item_type === 'finished_product' && item.finished_product_id) {
                    const { data } = await supabase
                        .from('finished_products')
                        .select('name, code, unit, quantity')
                        .eq('id', item.finished_product_id)
                        .single();
                    if (data) itemDetails = data;
                } else if (item.item_type === 'semi_finished' && item.semi_finished_product_id) {
                    const { data } = await supabase
                        .from('semi_finished_products')
                        .select('name, code, unit, quantity')
                        .eq('id', item.semi_finished_product_id)
                        .single();
                    if (data) itemDetails = data;
                } else if (item.item_type === 'raw_material' && item.raw_material_id) {
                    const { data } = await supabase
                        .from('raw_materials')
                        .select('name, code, unit, quantity')
                        .eq('id', item.raw_material_id)
                        .single();
                    if (data) itemDetails = data;
                } else if (item.item_type === 'packaging_material' && item.packaging_material_id) {
                    const { data } = await supabase
                        .from('packaging_materials')
                        .select('name, code, unit, quantity')
                        .eq('id', item.packaging_material_id)
                        .single();
                    if (data) itemDetails = data;
                }

                return {
                    ...item,
                    item_name: itemDetails.name,
                    item_code: itemDetails.code,
                    item_unit: itemDetails.unit,
                    available_stock: itemDetails.quantity,
                } as BundleItem;
            })
        );

        return { ...bundle, items: enrichedItems } as ProductBundle & { items: BundleItem[] };
    },

    /**
     * Create new bundle with items
     */
    createBundle: async (
        bundle: {
            code: string;
            name: string;
            description?: string;
            min_stock?: number;
            bundle_price: number;
            is_active?: boolean;
        },
        items: {
            item_type: BundleItemType;
            finished_product_id?: number;
            semi_finished_product_id?: number;
            raw_material_id?: number;
            packaging_material_id?: number;
            quantity: number;
        }[]
    ): Promise<ProductBundle> => {
        // Create bundle
        const { data: newBundle, error: bundleError } = await supabase
            .from('product_bundles')
            .insert({
                ...bundle,
                quantity: 0,
                unit_cost: 0,
            })
            .select()
            .single();

        if (bundleError) throw bundleError;

        // Create items
        if (items.length > 0) {
            const itemsToInsert = items.map(item => ({
                bundle_id: newBundle.id,
                ...item,
            }));

            const { error: itemsError } = await supabase
                .from('bundle_items')
                .insert(itemsToInsert);

            if (itemsError) {
                // Rollback: delete the bundle if items failed
                await supabase.from('product_bundles').delete().eq('id', newBundle.id);
                throw itemsError;
            }
        }

        // Calculate cost
        await supabase.rpc('calculate_bundle_cost', { p_bundle_id: newBundle.id });

        return newBundle as ProductBundle;
    },

    /**
     * Update bundle and its items
     */
    updateBundle: async (
        id: number,
        bundle: Partial<ProductBundle>,
        items: {
            item_type: BundleItemType;
            finished_product_id?: number;
            semi_finished_product_id?: number;
            raw_material_id?: number;
            packaging_material_id?: number;
            quantity: number;
        }[]
    ): Promise<void> => {
        // Update bundle
        const { error: bundleError } = await supabase
            .from('product_bundles')
            .update({
                name: bundle.name,
                description: bundle.description,
                min_stock: bundle.min_stock,
                bundle_price: bundle.bundle_price,
                is_active: bundle.is_active,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);

        if (bundleError) throw bundleError;

        // Replace items: delete old, insert new
        await supabase.from('bundle_items').delete().eq('bundle_id', id);

        if (items.length > 0) {
            const itemsToInsert = items.map(item => ({
                bundle_id: id,
                ...item,
            }));

            const { error: itemsError } = await supabase
                .from('bundle_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;
        }

        // Recalculate cost
        await supabase.rpc('calculate_bundle_cost', { p_bundle_id: id });
    },

    /**
     * Delete bundle (only if quantity is 0)
     */
    deleteBundle: async (id: number): Promise<void> => {
        // Check if bundle has stock
        const { data } = await supabase
            .from('product_bundles')
            .select('quantity')
            .eq('id', id)
            .single();

        if (data && data.quantity > 0) {
            throw new Error('لا يمكن حذف باندل له رصيد في المخزون');
        }

        const { error } = await supabase
            .from('product_bundles')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // ============================================================================
    // ASSEMBLY ORDERS
    // ============================================================================

    /**
     * Get all assembly orders
     */
    getAssemblyOrders: async (): Promise<BundleAssemblyOrder[]> => {
        const { data: orders, error } = await supabase
            .from('bundle_assembly_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return orders as BundleAssemblyOrder[];
    },

    /**
     * Get assembly order with items
     */
    getAssemblyOrder: async (id: number): Promise<BundleAssemblyOrder> => {
        const { data: order, error: orderError } = await supabase
            .from('bundle_assembly_orders')
            .select('*')
            .eq('id', id)
            .single();

        if (orderError) throw orderError;

        const { data: items, error: itemsError } = await supabase
            .from('bundle_assembly_order_items')
            .select(`
                *,
                bundle:product_bundles(id, code, name, unit_cost, bundle_price)
            `)
            .eq('assembly_order_id', id);

        if (itemsError) throw itemsError;

        return { ...order, items } as BundleAssemblyOrder;
    },

    /**
     * Create assembly order
     */
    createAssemblyOrder: async (
        order: { code: string; date: string; notes?: string },
        items: { bundle_id: number; quantity: number }[]
    ): Promise<BundleAssemblyOrder> => {
        // Create order
        const { data: newOrder, error: orderError } = await supabase
            .from('bundle_assembly_orders')
            .insert(order)
            .select()
            .single();

        if (orderError) throw orderError;

        // Create items
        const itemsToInsert = items.map(item => ({
            assembly_order_id: newOrder.id,
            ...item,
        }));

        const { error: itemsError } = await supabase
            .from('bundle_assembly_order_items')
            .insert(itemsToInsert);

        if (itemsError) {
            await supabase.from('bundle_assembly_orders').delete().eq('id', newOrder.id);
            throw itemsError;
        }

        return newOrder as BundleAssemblyOrder;
    },

    /**
     * Complete assembly order (atomic operation)
     */
    completeAssemblyOrder: async (orderId: number): Promise<void> => {
        const { error } = await supabase.rpc('complete_bundle_assembly_order_atomic', {
            p_order_id: orderId
        });
        if (error) throw error;
    },

    /**
     * Cancel assembly order
     */
    cancelAssemblyOrder: async (orderId: number): Promise<{ success: boolean; message: string }> => {
        const { data, error } = await supabase.rpc('cancel_bundle_assembly_order', {
            p_order_id: orderId
        });
        if (error) throw error;
        return data as { success: boolean; message: string };
    },

    /**
     * Check availability before assembly
     */
    checkAvailability: async (bundleId: number, quantity: number): Promise<{
        available: boolean;
        shortages: Array<{
            item_type: string;
            name: string;
            required: number;
            available: number;
            shortage: number;
        }>;
    }> => {
        const { data, error } = await supabase.rpc('check_bundle_assembly_availability', {
            p_bundle_id: bundleId,
            p_quantity: quantity
        });
        if (error) throw error;
        return data;
    },

    // ============================================================================
    // CODE GENERATION
    // ============================================================================

    /**
     * Generate next bundle code
     */
    generateBundleCode: async (): Promise<string> => {
        const { data, error } = await supabase.rpc('generate_bundle_code');
        if (error) {
            // Fallback to manual generation
            const { data: bundles } = await supabase
                .from('product_bundles')
                .select('code')
                .order('id', { ascending: false })
                .limit(1);

            if (!bundles || bundles.length === 0) return 'BND-001';

            const lastCode = bundles[0].code;
            const num = parseInt(lastCode.replace('BND-', '')) + 1;
            return `BND-${num.toString().padStart(3, '0')}`;
        }
        return data;
    },

    /**
     * Generate next assembly order code
     */
    generateAssemblyCode: async (): Promise<string> => {
        const { data, error } = await supabase.rpc('generate_bundle_assembly_code');
        if (error) {
            // Fallback to manual generation
            const { data: orders } = await supabase
                .from('bundle_assembly_orders')
                .select('code')
                .order('id', { ascending: false })
                .limit(1);

            if (!orders || orders.length === 0) return 'BA-001';

            const lastCode = orders[0].code;
            const num = parseInt(lastCode.replace('BA-', '')) + 1;
            return `BA-${num.toString().padStart(3, '0')}`;
        }
        return data;
    },

    // ============================================================================
    // HELPER: Get items for selection dropdowns
    // ============================================================================

    /**
     * Get all items of a specific type for dropdown selection
     */
    getItemsForType: async (itemType: BundleItemType): Promise<Array<{
        id: number;
        code: string;
        name: string;
        unit: string;
        quantity: number;
        unit_cost: number;
    }>> => {
        let tableName = '';
        switch (itemType) {
            case 'finished_product': tableName = 'finished_products'; break;
            case 'semi_finished': tableName = 'semi_finished_products'; break;
            case 'raw_material': tableName = 'raw_materials'; break;
            case 'packaging_material': tableName = 'packaging_materials'; break;
        }

        const { data, error } = await supabase
            .from(tableName)
            .select('id, code, name, unit, quantity, unit_cost')
            .order('name');

        if (error) throw error;
        return data || [];
    },
};
