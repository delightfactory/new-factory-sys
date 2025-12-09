import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StocktakingService, type InventoryCountItem } from "@/services/StocktakingService";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
    sessionId: number;
    onBack: () => void;
}

export default function StocktakingSession({ sessionId, onBack }: Props) {
    const queryClient = useQueryClient();
    const [localItems, setLocalItems] = useState<InventoryCountItem[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Fetch Session Details (to check status)
    const { data: session } = useQuery({
        queryKey: ['session', sessionId],
        queryFn: () => StocktakingService.getSession(sessionId),
    });

    const { data: items, isLoading } = useQuery({
        queryKey: ['sessionItems', sessionId],
        queryFn: () => StocktakingService.getSessionItems(sessionId),
    });

    const isReadOnly = session?.status === 'completed';

    // Sync local state when fetch completes
    useEffect(() => {
        if (items) setLocalItems(items);
    }, [items]);

    // Update Local State Handler
    const handleCountChange = (id: number, value: string) => {
        if (isReadOnly) return;
        const val = parseFloat(value) || 0;
        setLocalItems(prev => prev.map(item =>
            item.id === id
                ? { ...item, counted_quantity: val, difference: val - item.system_quantity }
                : item
        ));
        setHasUnsavedChanges(true);
    };

    // Save Mutation (Batch update ideally, but for now single or loop?)
    // Making it robust: Loop update. In prod, use a bulk Upsert RPC.
    const saveMutation = useMutation({
        mutationFn: async () => {
            // Save all items that changed
            // This is slow if 1000 items. Enhancements: Only dirty items.
            // For MVP: Simple loop
            const promises = localItems.map(item => StocktakingService.updateItemCount(item.id, item.counted_quantity));
            await Promise.all(promises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessionItems', sessionId] });
            setHasUnsavedChanges(false);
            toast.success("تم حفظ التغييرات");
        },
        onError: () => toast.error("فشل الحفظ")
    });

    // Reconcile Mutation
    const reconcileMutation = useMutation({
        mutationFn: () => StocktakingService.reconcileSession(sessionId),
        onSuccess: () => {
            toast.success("تم اعتماد الجرد وتسوية الفروقات بالمخزون!");
            queryClient.invalidateQueries({ queryKey: ['stocktakingSessions'] }); // Update list status
            queryClient.invalidateQueries({ queryKey: ['session', sessionId] }); // Update local status
        },
        onError: (e) => toast.error("فشل الاعتماد: " + e.message)
    });

    const handleReconcile = async () => {
        if (hasUnsavedChanges) {
            await saveMutation.mutateAsync();
        }
        if (confirm("هل أنت متأكد من اعتماد الفروقات وتحديث المخزون الفعلي؟ لا يمكن التراجع عن هذا الإجراء.")) {
            reconcileMutation.mutate();
        }
    };

    // Cancel Mutation
    const cancelMutation = useMutation({
        mutationFn: () => StocktakingService.cancelSession(sessionId),
        onSuccess: () => {
            toast.success("تم إلغاء جلسة الجرد");
            queryClient.invalidateQueries({ queryKey: ['stocktakingSessions'] });
            onBack();
        },
        onError: (e) => toast.error("فشل الإلغاء: " + e.message)
    });

    const handleCancelSession = () => {
        if (confirm("هل تريد إلغاء جلسة الجرد هذه؟ سيتم تجاهل الفروقات ولن يتم تحديث المخزون.")) {
            cancelMutation.mutate();
        }
    }

    if (isLoading) return <div>Loading items...</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-2" /> عودة</Button>
                    <h2 className="text-2xl font-bold">
                        ورقة الجرد {session?.code ? `(${session.code})` : ''}
                        {isReadOnly && <span className="mr-2 text-sm bg-green-100 text-green-800 px-2 py-1 rounded">مكتمل (للعرض فقط)</span>}
                        {session?.status === 'cancelled' && <span className="mr-2 text-sm bg-red-100 text-red-800 px-2 py-1 rounded">ملغي</span>}
                    </h2>
                </div>
                {!isReadOnly && session?.status !== 'cancelled' && (
                    <div className="flex gap-2">
                        <Button variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={handleCancelSession}>
                            إلغاء الجرد
                        </Button>
                        <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={!hasUnsavedChanges || saveMutation.isPending}>
                            <Save className="w-4 h-4 mr-2" /> حفظ مؤقت
                        </Button>
                        <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={handleReconcile}>
                            <CheckCircle className="w-4 h-4 mr-2" /> اعتماد وتسوية
                        </Button>
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-muted p-4 rounded-lg">
                    <div className="text-sm text-muted-foreground">عدد الأصناف</div>
                    <div className="text-2xl font-bold">{localItems.length}</div>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                    <div className="text-sm text-muted-foreground">أصناف بها فروقات</div>
                    <div className="text-2xl font-bold text-amber-600">
                        {localItems.filter(i => i.difference !== 0).length}
                    </div>
                </div>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>النوع</TableHead>
                            <TableHead>الصنف</TableHead>
                            <TableHead>الوحدة</TableHead>
                            <TableHead>الرصيد الدفتري</TableHead>
                            <TableHead className="w-[150px]">العد الفعلي</TableHead>
                            <TableHead>الفرق</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {localItems.map((item) => {
                            const hasDiff = item.difference !== 0;
                            const isNegative = item.difference < 0;
                            return (
                                <TableRow key={item.id} className={cn(
                                    hasDiff ? (isNegative ? "bg-red-50 hover:bg-red-100" : "bg-blue-50 hover:bg-blue-100") : ""
                                )}>
                                    <TableCell className="font-medium">
                                        {item.item_type === 'raw_material' ? 'خام' :
                                            item.item_type === 'packaging_material' ? 'تعبئة' :
                                                item.item_type === 'semi_finished' ? 'نصف مصنع' : 'منتج تام'}
                                    </TableCell>
                                    <TableCell>{item.product_name}</TableCell>
                                    <TableCell>{item.unit}</TableCell>
                                    <TableCell>{item.system_quantity}</TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            value={item.counted_quantity}
                                            onChange={(e) => handleCountChange(item.id, e.target.value)}
                                            className="font-bold text-center"
                                            disabled={isReadOnly}
                                        />
                                    </TableCell>
                                    <TableCell className={cn(
                                        "font-bold",
                                        hasDiff ? (isNegative ? "text-red-600" : "text-blue-600") : "text-gray-400"
                                    )}>
                                        {item.difference > 0 ? "+" : ""}{item.difference}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
