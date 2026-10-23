interface NamedItem { name: string }
export interface InvoiceItemDisplay {
    item_type: string; item_name?: string;
    finished_products?: NamedItem | null; semi_finished_products?: NamedItem | null;
    raw_materials?: NamedItem | null; packaging_materials?: NamedItem | null; product_bundles?: NamedItem | null;
}
export function invoiceItemName(item: InvoiceItemDisplay) {
    const reference = item.item_type === 'finished_product' ? item.finished_products :
        item.item_type === 'semi_finished' ? item.semi_finished_products :
        item.item_type === 'raw_material' ? item.raw_materials :
        item.item_type === 'packaging_material' ? item.packaging_materials :
        item.item_type === 'bundle' ? item.product_bundles : null;
    return reference?.name || item.item_name || 'صنف غير متاح';
}
export function invoiceItemTypeLabel(type: string) {
    const labels: Record<string, string> = { finished_product: 'منتج نهائي', semi_finished: 'نصف مصنع',
        raw_material: 'خامة', packaging_material: 'مادة تعبئة', bundle: 'باندل' };
    return labels[type] ?? 'نوع غير معروف';
}
