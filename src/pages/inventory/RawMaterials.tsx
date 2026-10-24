import { useMaterialEditor } from "@/hooks/use-material-editor";
import { MaterialEditorDialog } from "@/components/inventory/MaterialEditorDialog";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type RawMaterial } from "@/types";
import { formatInventoryCost, formatInventoryQuantity } from "@/lib/inventory-format";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CatalogReadState } from "@/components/ui/catalog-read-state";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function RawMaterials() {
    const queryClient = useQueryClient();
    const editor = useMaterialEditor("raw");
    const navigate = useNavigate();

    // Fetch Data
    const catalog = useQuery({
        queryKey: ['rawMaterials'],
        queryFn: InventoryService.getRawMaterials,
        retry: false,
    });
    const { data: rawMaterials } = catalog;

    const deleteMutation = useMutation({
        mutationFn: InventoryService.deleteRawMaterial,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
            toast.success("تم الحذف بنجاح");
        },
        onError: (error) => toast.error("فشل الحذف: " + error.message)
    });

    const handleDelete = (id: number) => {
        deleteMutation.mutate(id);
    };

    const handleAddNew = editor.create;
    const handleEdit = (item: RawMaterial) => editor.edit(item.id);

    const columns: ColumnDef<RawMaterial>[] = [
        { accessorKey: "code", header: "الكود", enableSorting: true },
        { accessorKey: "name", header: "الاسم", enableSorting: true },
        {
            accessorKey: "quantity",
            header: "الكمية الحالية",
            enableSorting: true,
            cell: ({ row }) => <span dir="ltr">{formatInventoryQuantity(row.getValue("quantity"))}</span>
        },
        { accessorKey: "unit", header: "الوحدة", enableSorting: true },
        {
            accessorKey: "unit_cost",
            header: "سعر الوحدة",
            enableSorting: true,
            cell: ({ row }) => <span>{formatInventoryCost(row.getValue("unit_cost"))}</span>
        },
        { accessorKey: "min_stock", header: "حد الأمان", enableSorting: true, cell: ({ row }) => <span dir="ltr">{formatInventoryQuantity(row.getValue("min_stock"))}</span> },
        {
            id: "actions",
            header: "إجراءات",
            enableSorting: false,
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex gap-2 justify-end" onClick={event => event.stopPropagation()}>
                        <Button aria-label={`تعديل ${item.name}`} variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit(item); }}>
                            <Pencil className="h-4 w-4 text-blue-500" />
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button aria-label={`حذف ${item.name}`} variant="ghost" size="icon">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        سيتم حذف "{item.name}" نهائياً. لا يمكن التراجع عن هذا الإجراء.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        حذف
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                );
            }
        }
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="المواد الخام"
                description="إدارة مخزون المواد الخام ومتابعة الكميات"
                icon={Package}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={catalog.isFetching} onClick={() => void catalog.refetch()}>تحديث القائمة</Button>
                        <Button onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> إضافة مادة خام
                        </Button>
                    </div>
                }
            />

            <CatalogReadState query={catalog} entity="قائمة المواد الخام" onRetry={() => void catalog.refetch()}>
                {rawMaterials && rawMaterials.length > 0 ? (
                    <DataTable
                        columns={columns}
                        data={rawMaterials}
                        onRowClick={(item) => navigate(`/inventory/raw-materials/${item.id}`)}
                    />
                ) : (
                    <EmptyState
                        icon={Package}
                        title="لا توجد مواد خام"
                        description="ابدأ بإضافة أول مادة خام إلى المخزون"
                        action={
                            <Button onClick={handleAddNew}>
                                <Plus className="mr-2 h-4 w-4" /> إضافة مادة خام
                            </Button>
                        }
                    />
                )}

            </CatalogReadState>

            <MaterialEditorDialog editor={editor} />
        </div>
    );
}
