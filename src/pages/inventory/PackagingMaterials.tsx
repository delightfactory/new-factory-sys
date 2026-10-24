import { useMaterialEditor } from "@/hooks/use-material-editor";
import { MaterialEditorDialog } from "@/components/inventory/MaterialEditorDialog";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type PackagingMaterial } from "@/types";
import { formatInventoryCost, formatInventoryQuantity } from "@/lib/inventory-format";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Box } from "lucide-react";
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
} from "@/components/ui/alert-dialog"

export default function PackagingMaterials() {
    const queryClient = useQueryClient();
    const editor = useMaterialEditor("packaging");
    const navigate = useNavigate();

    // Fetch Data
    const catalog = useQuery({
        queryKey: ['packagingMaterials'],
        queryFn: InventoryService.getPackagingMaterials,
        retry: false,
    });
    const { data: packagingMaterials } = catalog;

    const deleteMutation = useMutation({
        mutationFn: InventoryService.deletePackagingMaterial,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packagingMaterials'] });
            toast.success("تم الحذف بنجاح");
        },
        onError: (error) => toast.error("فشل الحذف: " + error.message)
    });

    const handleDelete = (id: number) => {
        deleteMutation.mutate(id);
    };

    const handleAddNew = editor.create;
    const handleEdit = (item: PackagingMaterial) => editor.edit(item.id);

    const columns: ColumnDef<PackagingMaterial>[] = [
        { accessorKey: "code", header: "الكود", enableSorting: true },
        { accessorKey: "name", header: "الاسم", enableSorting: true },
        { accessorKey: "quantity", header: "الكمية الحالية", enableSorting: true, cell: ({ row }) => <span dir="ltr">{formatInventoryQuantity(row.getValue("quantity"))}</span> },
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
                                        سيتم حذف "{item.name}" نهائياً.
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
                title="مواد التعبئة والتغليف"
                description="إدارة مخزون مواد التعبئة كالعبوات والكراتين"
                icon={Box}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={catalog.isFetching} onClick={() => void catalog.refetch()}>تحديث القائمة</Button>
                        <Button onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> إضافة مادة تعبئة
                        </Button>
                    </div>
                }
            />

            <CatalogReadState query={catalog} entity="قائمة مواد التعبئة" onRetry={() => void catalog.refetch()}>
                {packagingMaterials && packagingMaterials.length > 0 ? (
                    <DataTable
                        columns={columns}
                        data={packagingMaterials}
                        onRowClick={(item) => navigate(`/inventory/packaging/${item.id}`)}
                    />
                ) : (
                    <EmptyState
                        icon={Box}
                        title="لا توجد مواد تعبئة"
                        description="ابدأ بإضافة أول مادة تعبئة إلى المخزون"
                        action={
                            <Button onClick={handleAddNew}>
                                <Plus className="mr-2 h-4 w-4" /> إضافة مادة تعبئة
                            </Button>
                        }
                    />
                )}

            </CatalogReadState>

            <MaterialEditorDialog editor={editor} />
        </div>
    );
}
