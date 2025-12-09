export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            raw_materials: {
                Row: {
                    id: number
                    code: string
                    name: string
                    unit: string
                    quantity: number
                    min_stock: number
                    unit_cost: number
                    importance: number
                    sales_price: number
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['raw_materials']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['raw_materials']['Insert']>
            }
            packaging_materials: {
                Row: {
                    id: number
                    code: string
                    name: string
                    unit: string
                    quantity: number
                    min_stock: number
                    unit_cost: number
                    sales_price: number
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['packaging_materials']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['packaging_materials']['Insert']>
            }
            semi_finished_products: {
                Row: {
                    id: number
                    code: string
                    name: string
                    unit: string
                    quantity: number
                    min_stock: number
                    unit_cost: number
                    sales_price: number
                    recipe_batch_size: number
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['semi_finished_products']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['semi_finished_products']['Insert']>
            }
            semi_finished_ingredients: {
                Row: {
                    id: number
                    semi_finished_id: number
                    raw_material_id: number
                    percentage: number
                    quantity: number
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['semi_finished_ingredients']['Row'], 'id' | 'created_at'>
                Update: Partial<Database['public']['Tables']['semi_finished_ingredients']['Insert']>
            }
            finished_products: {
                Row: {
                    id: number
                    code: string
                    name: string
                    unit: string
                    quantity: number
                    min_stock: number
                    unit_cost: number
                    sales_price: number
                    semi_finished_id: number
                    semi_finished_quantity: number
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['finished_products']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['finished_products']['Insert']>
            }
            production_orders: {
                Row: {
                    id: number
                    code: string
                    date: string
                    status: 'pending' | 'inProgress' | 'completed' | 'cancelled'
                    notes: string | null
                    total_cost: number
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['production_orders']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['production_orders']['Insert']>
            }
            production_order_items: {
                Row: {
                    id: number
                    production_order_id: number
                    semi_finished_id: number
                    quantity: number
                    unit_cost: number
                    total_cost: number
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['production_order_items']['Row'], 'id' | 'created_at'>
                Update: Partial<Database['public']['Tables']['production_order_items']['Insert']>
            }
            packaging_orders: {
                Row: {
                    id: number
                    code: string
                    date: string
                    status: 'pending' | 'inProgress' | 'completed' | 'cancelled'
                    notes: string | null
                    total_cost: number
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['packaging_orders']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['packaging_orders']['Insert']>
            }
            packaging_order_items: {
                Row: {
                    id: number
                    packaging_order_id: number
                    finished_product_id: number
                    quantity: number
                    unit_cost: number
                    total_cost: number
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['packaging_order_items']['Row'], 'id' | 'created_at'>
                Update: Partial<Database['public']['Tables']['packaging_order_items']['Insert']>
            }
        }
    }
}

export type AppRole = 'admin' | 'manager' | 'accountant' | 'inventory_officer' | 'production_officer' | 'viewer';

export interface Profile {
    id: string;
    full_name: string | null;
    role: AppRole;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// Helper types for Application usage
export type RawMaterial = Database['public']['Tables']['raw_materials']['Row']
export type PackagingMaterial = Database['public']['Tables']['packaging_materials']['Row']
export type SemiFinishedProduct = Database['public']['Tables']['semi_finished_products']['Row']
export type FinishedProduct = Database['public']['Tables']['finished_products']['Row']
export type ProductionOrder = Database['public']['Tables']['production_orders']['Row']
export type ProductionOrderItem = Database['public']['Tables']['production_order_items']['Row']
export type PackagingOrder = Database['public']['Tables']['packaging_orders']['Row']
export type PackagingOrderItem = Database['public']['Tables']['packaging_order_items']['Row']
