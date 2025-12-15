import { supabase } from "@/integrations/supabase/client";
import { type RawMaterial, type PackagingMaterial, type SemiFinishedProduct, type FinishedProduct, type ProductionOrder, type PackagingOrder } from "@/types";

export interface SemiFinishedIngredient {
    id: number;
    semi_finished_id: number;
    raw_material_id: number;
    percentage: number;
    raw_material?: RawMaterial; // Joined data
}



export const InventoryService = {
    // ... (Previous Raw/Packaging methods remain) ...

    getNextCode: async (tableName: string, prefix: string) => {
        const { data, error } = await supabase.rpc('get_next_code', { table_name: tableName, prefix: prefix });
        if (error) throw error;
        return data as string;
    },

    // --- Raw Materials ---
    getRawMaterials: async () => {
        const { data, error } = await supabase.from('raw_materials').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data as RawMaterial[];
    },
    createRawMaterial: async (item: Omit<RawMaterial, 'id' | 'created_at' | 'updated_at'>) => {
        const { data, error } = await supabase.from('raw_materials').insert(item).select().single();
        if (error) throw error;
        return data as RawMaterial;
    },
    updateRawMaterial: async (id: number, updates: Partial<RawMaterial>) => {
        const { data, error } = await supabase.from('raw_materials').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data as RawMaterial;
    },
    deleteRawMaterial: async (id: number) => {
        const { error } = await supabase.from('raw_materials').delete().eq('id', id);
        if (error) throw error;
    },

    // --- Packaging Materials ---
    getPackagingMaterials: async () => {
        const { data, error } = await supabase.from('packaging_materials').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data as PackagingMaterial[];
    },
    createPackagingMaterial: async (item: Omit<PackagingMaterial, 'id' | 'created_at' | 'updated_at'>) => {
        const { data, error } = await supabase.from('packaging_materials').insert(item).select().single();
        if (error) throw error;
        return data as PackagingMaterial;
    },
    updatePackagingMaterial: async (id: number, updates: Partial<PackagingMaterial>) => {
        const { data, error } = await supabase.from('packaging_materials').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data as PackagingMaterial;
    },
    deletePackagingMaterial: async (id: number) => {
        const { error } = await supabase.from('packaging_materials').delete().eq('id', id);
        if (error) throw error;
    },

    // --- Semi Finished Products ---
    getSemiFinishedProducts: async () => {
        const { data, error } = await supabase.from('semi_finished_products').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data as SemiFinishedProduct[];
    },

    // Create Product WITH Ingredients (Transaction)
    createSemiFinishedProductWithRecipe: async (
        product: Omit<SemiFinishedProduct, 'id' | 'created_at' | 'updated_at'>,
        ingredients: { raw_material_id: number; quantity: number; percentage: number }[]
    ) => {
        // 1. Create Product
        const { data: newProduct, error: prodError } = await supabase
            .from('semi_finished_products')
            .insert(product)
            .select()
            .single();

        if (prodError) throw prodError;

        // 2. Add Ingredients
        if (ingredients.length > 0) {
            const ingredientsData = ingredients.map(ing => ({
                semi_finished_id: newProduct.id,
                raw_material_id: ing.raw_material_id,
                quantity: ing.quantity,
                percentage: ing.percentage
            }));

            const { error: ingError } = await supabase
                .from('semi_finished_ingredients')
                .insert(ingredientsData);

            if (ingError) {
                await supabase.from('semi_finished_products').delete().eq('id', newProduct.id);
                throw ingError;
            }
        }

        return newProduct;
    },

    // Update Product WITH Ingredients
    updateSemiFinishedProductWithRecipe: async (
        id: number,
        product: Partial<SemiFinishedProduct>,
        ingredients: { raw_material_id: number; quantity: number; percentage: number }[]
    ) => {
        // 1. Update Product Details
        const { data: updatedProduct, error: prodError } = await supabase
            .from('semi_finished_products')
            .update(product)
            .eq('id', id)
            .select()
            .single();

        if (prodError) throw prodError;

        // 2. Update Ingredients (Delete all and re-insert)
        // A. Delete existing
        const { error: delError } = await supabase
            .from('semi_finished_ingredients')
            .delete()
            .eq('semi_finished_id', id);

        if (delError) throw delError;

        // B. Insert new
        if (ingredients.length > 0) {
            const ingredientsData = ingredients.map(ing => ({
                semi_finished_id: id,
                raw_material_id: ing.raw_material_id,
                quantity: ing.quantity,
                percentage: ing.percentage
            }));

            const { error: ingError } = await supabase
                .from('semi_finished_ingredients')
                .insert(ingredientsData);

            if (ingError) throw ingError;
        }

        return updatedProduct;
    },

    getSemiFinishedIngredients: async (semiFinishedId: number) => {
        const { data, error } = await supabase
            .from('semi_finished_ingredients')
            .select('*, raw_materials(name, unit, unit_cost)')
            .eq('semi_finished_id', semiFinishedId);

        if (error) throw error;
        return data;
    },

    // Enhanced: Get ingredients WITH current stock availability
    getSemiFinishedIngredientsWithStock: async (semiFinishedId: number) => {
        // Get product batch size
        const { data: product, error: productError } = await supabase
            .from('semi_finished_products')
            .select('recipe_batch_size')
            .eq('id', semiFinishedId)
            .single();

        if (productError) throw productError;

        // Get ingredients with full raw material info (including quantity)
        const { data, error } = await supabase
            .from('semi_finished_ingredients')
            .select('*, raw_materials(id, name, unit, unit_cost, quantity)')
            .eq('semi_finished_id', semiFinishedId);

        if (error) throw error;

        return {
            batchSize: product?.recipe_batch_size || 100,
            ingredients: data?.map(ing => ({
                id: ing.raw_material_id,
                name: (ing.raw_materials as any)?.name || '',
                unit: (ing.raw_materials as any)?.unit || '',
                unitCost: (ing.raw_materials as any)?.unit_cost || 0,
                quantityPerBatch: ing.quantity || 0,
                percentage: ing.percentage || 0,
                availableStock: (ing.raw_materials as any)?.quantity || 0
            })) || []
        };
    },

    // Enhanced: Get finished product requirements WITH stock availability
    getFinishedProductRequirementsWithStock: async (finishedProductId: number) => {
        // Get finished product details (semi-finished link)
        const { data: product, error: productError } = await supabase
            .from('finished_products')
            .select('semi_finished_id, semi_finished_quantity, semi_finished_products(id, name, unit, quantity, unit_cost)')
            .eq('id', finishedProductId)
            .single();

        if (productError) throw productError;

        // Get packaging materials with stock
        const { data: packaging, error: packagingError } = await supabase
            .from('finished_product_packaging')
            .select('*, packaging_materials(id, name, unit, quantity, unit_cost)')
            .eq('finished_product_id', finishedProductId);

        if (packagingError) throw packagingError;

        return {
            semiFinished: product?.semi_finished_id ? {
                id: product.semi_finished_id,
                name: (product.semi_finished_products as any)?.name || '',
                unit: (product.semi_finished_products as any)?.unit || '',
                quantityPerUnit: product.semi_finished_quantity || 0,
                availableStock: (product.semi_finished_products as any)?.quantity || 0,
                unitCost: (product.semi_finished_products as any)?.unit_cost || 0
            } : null,
            packagingMaterials: packaging?.map(pkg => ({
                id: pkg.packaging_material_id,
                name: (pkg.packaging_materials as any)?.name || '',
                unit: (pkg.packaging_materials as any)?.unit || '',
                quantityPerUnit: pkg.quantity || 0,
                availableStock: (pkg.packaging_materials as any)?.quantity || 0,
                unitCost: (pkg.packaging_materials as any)?.unit_cost || 0
            })) || []
        };
    },

    deleteSemiFinishedProduct: async (id: number) => {
        const { error } = await supabase.from('semi_finished_products').delete().eq('id', id);
        if (error) throw error;
    },

    // --- Finished Products ---
    getFinishedProducts: async () => {
        const { data, error } = await supabase.from('finished_products').select('*, semi_finished_products(name)').order('created_at', { ascending: false });
        if (error) throw error;
        return data as FinishedProduct[];
    },
    createFinishedProduct: async (item: Omit<FinishedProduct, 'id' | 'created_at' | 'updated_at'>) => {
        const { data, error } = await supabase.from('finished_products').insert(item).select().single();
        if (error) throw error;
        return data as FinishedProduct;
    },

    createFinishedProductWithPackaging: async (
        product: Omit<FinishedProduct, 'id' | 'created_at' | 'updated_at'>,
        packaging: { packaging_material_id: number; quantity: number }[]
    ) => {
        // 1. Create Product
        const { data: newProduct, error: prodError } = await supabase
            .from('finished_products')
            .insert(product)
            .select()
            .single();

        if (prodError) throw prodError;

        // 2. Add Packaging Materials
        if (packaging.length > 0) {
            const packagingData = packaging.map(pkg => ({
                finished_product_id: newProduct.id,
                packaging_material_id: pkg.packaging_material_id,
                quantity: pkg.quantity
            }));

            const { error: pkgError } = await supabase
                .from('finished_product_packaging')
                .insert(packagingData);

            if (pkgError) {
                await supabase.from('finished_products').delete().eq('id', newProduct.id);
                throw pkgError;
            }
        }

        return newProduct;
    },

    getFinishedProductPackaging: async (finishedProductId: number) => {
        const { data, error } = await supabase
            .from('finished_product_packaging')
            .select('*, packaging_materials(name, unit, unit_cost)')
            .eq('finished_product_id', finishedProductId);

        if (error) throw error;
        return data;
    },

    updateFinishedProductWithPackaging: async (
        id: number,
        product: Partial<FinishedProduct>,
        packaging: { packaging_material_id: number; quantity: number }[]
    ) => {
        // 1. Update Product Details
        const { data: updatedProduct, error: prodError } = await supabase
            .from('finished_products')
            .update(product)
            .eq('id', id)
            .select()
            .single();

        if (prodError) throw prodError;

        // 2. Update Packaging (Delete all and re-insert)
        const { error: delError } = await supabase
            .from('finished_product_packaging')
            .delete()
            .eq('finished_product_id', id);

        if (delError) throw delError;

        if (packaging.length > 0) {
            const packagingData = packaging.map(pkg => ({
                finished_product_id: id,
                packaging_material_id: pkg.packaging_material_id,
                quantity: pkg.quantity
            }));

            const { error: pkgError } = await supabase
                .from('finished_product_packaging')
                .insert(packagingData);

            if (pkgError) throw pkgError;
        }

        return updatedProduct;
    },

    deleteFinishedProduct: async (id: number) => {
        const { error } = await supabase.from('finished_products').delete().eq('id', id);
        if (error) throw error;
    },

    // --- Production Orders ---
    getProductionOrders: async () => {
        const { data, error } = await supabase
            .from('production_orders')
            .select('*')
            .order('date', { ascending: false });
        if (error) throw error;
        return data as ProductionOrder[];
    },

    getProductionOrderItems: async (orderId: number) => {
        const { data, error } = await supabase
            .from('production_order_items')
            .select('*, semi_finished_products(name, unit)')
            .eq('production_order_id', orderId);
        if (error) throw error;
        return data; // Returns items with joined product info
    },

    createProductionOrder: async (
        order: Omit<ProductionOrder, 'id' | 'created_at' | 'updated_at'>,
        items: { semi_finished_id: number; quantity: number; unit_cost?: number; total_cost?: number }[]
    ) => {
        // 1. Create Order Header
        const { data: newOrder, error: orderError } = await supabase
            .from('production_orders')
            .insert(order)
            .select()
            .single();

        if (orderError) throw orderError;

        // 2. Add Items
        if (items.length > 0) {
            const itemsData = items.map(item => ({
                production_order_id: newOrder.id,
                semi_finished_id: item.semi_finished_id,
                quantity: item.quantity,
                unit_cost: item.unit_cost || 0,
                total_cost: item.total_cost || 0
            }));

            const { error: itemsError } = await supabase
                .from('production_order_items')
                .insert(itemsData);

            if (itemsError) {
                await supabase.from('production_orders').delete().eq('id', newOrder.id);
                throw itemsError;
            }
        }

        return newOrder;
    },

    updateProductionOrderStatus: async (id: number, status: 'pending' | 'inProgress' | 'completed' | 'cancelled') => {
        // If completing, we might want to run the stock deduction logic here or in a separate specific method.
        // For now, simple status update. The comprehensive stock logic is complex to do purely client-side transactionally without RPC.
        // We will assume "Completed" triggers the stock movement.

        const { data, error } = await supabase
            .from('production_orders')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Special method to Execute Order (Deduct Raw, Add Semi-Finished)
    // Atomic Execution using RPC
    completeProductionOrder: async (orderId: number) => {
        const { error } = await supabase.rpc('complete_production_order_atomic', { p_order_id: orderId });
        if (error) throw error;

        // No manual logging needed, RPC handles it.
    },

    // --- Packaging Orders ---
    getPackagingOrders: async () => {
        const { data, error } = await supabase
            .from('packaging_orders')
            .select('*')
            .order('date', { ascending: false });
        if (error) throw error;
        return data as PackagingOrder[];
    },

    createPackagingOrder: async (
        order: { code: string; date: string; notes: string; status: string; total_cost: number },
        items: { finished_product_id: number; quantity: number; unit_cost?: number; total_cost?: number }[]
    ) => {
        // 1. Create Order Header
        const { data: newOrder, error: orderError } = await supabase
            .from('packaging_orders')
            .insert(order)
            .select()
            .single();

        if (orderError) throw orderError;

        // 2. Add Items
        if (items.length > 0) {
            const itemsData = items.map(item => ({
                packaging_order_id: newOrder.id,
                finished_product_id: item.finished_product_id,
                quantity: item.quantity,
                unit_cost: item.unit_cost || 0,
                total_cost: item.total_cost || 0
            }));

            const { error: itemsError } = await supabase
                .from('packaging_order_items')
                .insert(itemsData);

            if (itemsError) {
                await supabase.from('packaging_orders').delete().eq('id', newOrder.id);
                throw itemsError;
            }
        }
        return newOrder;
    },

    getPackagingOrderItems: async (orderId: number) => {
        const { data, error } = await supabase
            .from('packaging_order_items')
            .select('*, finished_products(name, unit)')
            .eq('packaging_order_id', orderId);
        if (error) throw error;
        return data;
    },

    updatePackagingOrderStatus: async (id: number, status: string) => {
        const { data, error } = await supabase
            .from('packaging_orders')
            .update({ status })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // Atomic Execution using RPC
    completePackagingOrder: async (orderId: number) => {
        const { error } = await supabase.rpc('complete_packaging_order_atomic', { p_order_id: orderId });
        if (error) throw error;

        // No manual logging needed, RPC handles it.
    },


    // Cancel Production Order (Atomic RPC)
    cancelProductionOrder: async (orderId: number) => {
        const { error } = await supabase.rpc('cancel_production_order_atomic', { p_order_id: orderId });
        if (error) throw error;
    },

    createPackagingOrderWithItems: async (
        order: { code: string; date: string; notes: string; status: string; total_cost: number },
        items: { finished_product_id: number; quantity: number }[]
    ) => { return InventoryService.createPackagingOrder(order, items); },

    // Cancel Packaging Order (Atomic RPC)
    cancelPackagingOrder: async (orderId: number) => {
        const { error } = await supabase.rpc('cancel_packaging_order_atomic', { p_order_id: orderId });
        if (error) throw error;
    },

    // --- SMART AVAILABILITY: Calculate pending demands ---

    /**
     * Calculate raw materials reserved by pending/inProgress production orders
     * Returns Map<raw_material_id, reserved_quantity>
     */
    getPendingProductionDemand: async (): Promise<Map<number, number>> => {
        const demandMap = new Map<number, number>();

        // Get all pending/inProgress production orders with their items
        const { data: pendingOrders, error: ordersError } = await supabase
            .from('production_orders')
            .select('id, status')
            .in('status', ['pending', 'inProgress']);

        if (ordersError) throw ordersError;
        if (!pendingOrders || pendingOrders.length === 0) return demandMap;

        // Get all items for these orders
        const orderIds = pendingOrders.map(o => o.id);
        const { data: items, error: itemsError } = await supabase
            .from('production_order_items')
            .select('semi_finished_id, quantity')
            .in('production_order_id', orderIds);

        if (itemsError) throw itemsError;
        if (!items || items.length === 0) return demandMap;

        // For each item, get recipe and calculate raw material needs
        for (const item of items) {
            const { data: recipe, error: recipeError } = await supabase
                .from('semi_finished_products')
                .select('recipe_batch_size, semi_finished_ingredients(raw_material_id, quantity)')
                .eq('id', item.semi_finished_id)
                .single();

            if (recipeError || !recipe) continue;

            const batchSize = recipe.recipe_batch_size || 100;
            const ratio = item.quantity / batchSize;

            if (recipe.semi_finished_ingredients) {
                for (const ing of recipe.semi_finished_ingredients as any[]) {
                    const qtyNeeded = (ing.quantity || 0) * ratio;
                    const currentDemand = demandMap.get(ing.raw_material_id) || 0;
                    demandMap.set(ing.raw_material_id, currentDemand + qtyNeeded);
                }
            }
        }

        return demandMap;
    },

    /**
     * Calculate packaging materials and semi-finished products reserved by pending packaging orders
     * Returns { packagingDemand: Map, semiFinishedDemand: Map }
     */
    getPendingPackagingDemand: async (): Promise<{
        packagingDemand: Map<number, number>;
        semiFinishedDemand: Map<number, number>;
    }> => {
        const packagingDemand = new Map<number, number>();
        const semiFinishedDemand = new Map<number, number>();

        // Get all pending/inProgress packaging orders with their items
        const { data: pendingOrders, error: ordersError } = await supabase
            .from('packaging_orders')
            .select('id, status')
            .in('status', ['pending', 'inProgress']);

        if (ordersError) throw ordersError;
        if (!pendingOrders || pendingOrders.length === 0) {
            return { packagingDemand, semiFinishedDemand };
        }

        // Get all items for these orders
        const orderIds = pendingOrders.map(o => o.id);
        const { data: items, error: itemsError } = await supabase
            .from('packaging_order_items')
            .select('finished_product_id, quantity')
            .in('packaging_order_id', orderIds);

        if (itemsError) throw itemsError;
        if (!items || items.length === 0) {
            return { packagingDemand, semiFinishedDemand };
        }

        // For each item, get finished product requirements
        for (const item of items) {
            const { data: product, error: productError } = await supabase
                .from('finished_products')
                .select('semi_finished_id, semi_finished_quantity, finished_product_packaging(packaging_material_id, quantity)')
                .eq('id', item.finished_product_id)
                .single();

            if (productError || !product) continue;

            // Semi-finished demand
            if (product.semi_finished_id) {
                const sfNeeded = (product.semi_finished_quantity || 0) * item.quantity;
                const currentSF = semiFinishedDemand.get(product.semi_finished_id) || 0;
                semiFinishedDemand.set(product.semi_finished_id, currentSF + sfNeeded);
            }

            // Packaging materials demand
            if (product.finished_product_packaging) {
                for (const pkg of product.finished_product_packaging as any[]) {
                    const pkgNeeded = (pkg.quantity || 0) * item.quantity;
                    const currentPkg = packagingDemand.get(pkg.packaging_material_id) || 0;
                    packagingDemand.set(pkg.packaging_material_id, currentPkg + pkgNeeded);
                }
            }
        }

        return { packagingDemand, semiFinishedDemand };
    },

    /**
     * Calculate true available quantity for a material type
     * available = currentStock - pendingDemand
     */
    calculateAdjustedAvailability: (
        currentStock: number,
        pendingDemand: number,
        currentOrderDemand: number = 0
    ): number => {
        return Math.max(0, currentStock - pendingDemand - currentOrderDemand);
    },
};
