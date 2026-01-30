import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { BundlesService } from "@/services/BundlesService";
import { toast } from "sonner";
import { Plus, Play, X, Eye, Package, Search, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { BundleAssemblyOrder, ProductBundle } from "@/types";

interface OrderFormData {
    code: string;
    date: string;
    notes?: string;
    items: {
        bundle_id: number;
        quantity: number;
    }[];
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "قيد الانتظار", variant: "outline" },
    inProgress: { label: "قيد التنفيذ", variant: "secondary" },
    completed: { label: "مكتمل", variant: "default" },
    cancelled: { label: "ملغي", variant: "destructive" },
};

export default function BundleAssemblyOrders() {
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [viewOrder, setViewOrder] = useState<BundleAssemblyOrder | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ type: "complete" | "cancel"; orderId: number } | null>(null);
    const [shortages, setShortages] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const form = useForm<OrderFormData>({
        defaultValues: {
            code: "",
            date: new Date().toISOString().split("T")[0],
            notes: "",
            items: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    // Fetch orders
    const { data: orders = [], isLoading } = useQuery({
        queryKey: ["bundle-assembly-orders"],
        queryFn: () => BundlesService.getAssemblyOrders(),
    });

    // Fetch bundles for dropdown
    const { data: bundles = [] } = useQuery({
        queryKey: ["bundles-active"],
        queryFn: () => BundlesService.getBundles(true),
    });

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async (data: OrderFormData) => {
            return BundlesService.createAssemblyOrder(
                { code: data.code, date: data.date, notes: data.notes },
                data.items
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bundle-assembly-orders"] });
            toast.success("تم إنشاء أمر التجميع بنجاح");
            handleClose();
        },
        onError: (error: any) => {
            toast.error(error.message || "حدث خطأ أثناء إنشاء الأمر");
        },
    });

    // Complete mutation
    const completeMutation = useMutation({
        mutationFn: (orderId: number) => BundlesService.completeAssemblyOrder(orderId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bundle-assembly-orders"] });
            queryClient.invalidateQueries({ queryKey: ["bundles"] });
            toast.success("تم تنفيذ أمر التجميع بنجاح");
            setConfirmAction(null);
        },
        onError: (error: any) => {
            toast.error(error.message || "حدث خطأ أثناء تنفيذ الأمر");
        },
    });

    // Cancel mutation
    const cancelMutation = useMutation({
        mutationFn: (orderId: number) => BundlesService.cancelAssemblyOrder(orderId),
        onSuccess: (result) => {
            if (result.success) {
                queryClient.invalidateQueries({ queryKey: ["bundle-assembly-orders"] });
                toast.success(result.message);
            } else {
                toast.error(result.message);
            }
            setConfirmAction(null);
        },
        onError: (error: any) => {
            toast.error(error.message || "حدث خطأ أثناء إلغاء الأمر");
        },
    });

    const handleClose = () => {
        setIsOpen(false);
        setShortages([]);
        form.reset();
    };

    const handleNew = async () => {
        const code = await BundlesService.generateAssemblyCode();
        form.reset({
            code,
            date: new Date().toISOString().split("T")[0],
            notes: "",
            items: [],
        });
        setShortages([]);
        setIsOpen(true);
    };

    const handleView = async (order: BundleAssemblyOrder) => {
        try {
            const fullOrder = await BundlesService.getAssemblyOrder(order.id);
            setViewOrder(fullOrder);
        } catch (error) {
            toast.error("حدث خطأ أثناء تحميل بيانات الأمر");
        }
    };

    const checkAvailability = async () => {
        const items = form.getValues("items");

        if (items.length === 0 || !items.some(item => item.bundle_id && item.quantity > 0)) {
            toast.error("أضف باندل واحد على الأقل للتحقق من المخزون");
            return false;
        }

        try {
            const allShortages: any[] = [];

            for (const item of items) {
                if (item.bundle_id && item.quantity > 0) {
                    const result = await BundlesService.checkAvailability(item.bundle_id, item.quantity);
                    if (!result.available) {
                        allShortages.push(...result.shortages);
                    }
                }
            }

            setShortages(allShortages);

            if (allShortages.length === 0) {
                toast.success("المخزون متوفر بالكامل ✓");
            } else {
                toast.warning("يوجد نقص في بعض المكونات");
            }

            return allShortages.length === 0;
        } catch (error) {
            console.error("Error checking availability:", error);
            toast.error("حدث خطأ أثناء التحقق من المخزون");
            return false;
        }
    };

    const onSubmit = async (data: OrderFormData) => {
        if (data.items.length === 0) {
            toast.error("يجب إضافة باندل واحد على الأقل");
            return;
        }

        const isAvailable = await checkAvailability();
        if (!isAvailable) {
            toast.error("المخزون غير كافٍ لتنفيذ الأمر");
            return;
        }

        createMutation.mutate(data);
    };

    const addItem = () => {
        append({ bundle_id: 0, quantity: 1 });
    };

    const filteredOrders = orders.filter((o) => {
        const matchesSearch =
            o.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (o.notes || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "all" || o.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    const completedOrders = orders.filter((o) => o.status === "completed").length;

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">أوامر تجميع الباندلات</h1>
                    <p className="text-muted-foreground">إدارة أوامر تجميع حزم المنتجات</p>
                </div>
                <Button onClick={handleNew} className="gap-2">
                    <Plus className="h-4 w-4" />
                    أمر تجميع جديد
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{orders.length}</div>
                        <p className="text-sm text-muted-foreground">إجمالي الأوامر</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-amber-600">{pendingOrders}</div>
                        <p className="text-sm text-muted-foreground">قيد الانتظار</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-green-600">{completedOrders}</div>
                        <p className="text-sm text-muted-foreground">مكتمل</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold">
                            {orders.reduce((sum, o) => sum + (o.total_cost || 0), 0).toFixed(2)}
                        </div>
                        <p className="text-sm text-muted-foreground">إجمالي التكلفة</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="بحث بالكود أو الملاحظات..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pr-10"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        {Object.entries(STATUS_BADGES).map(([value, { label }]) => (
                            <SelectItem key={value} value={value}>
                                {label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Orders Table */}
            {isLoading ? (
                <Card className="animate-pulse h-64" />
            ) : filteredOrders.length === 0 ? (
                <Card className="p-8 text-center">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">لا توجد أوامر تجميع</p>
                </Card>
            ) : (
                <>
                    {/* Mobile Cards View */}
                    <div className="block md:hidden space-y-3">
                        {filteredOrders.map((order) => (
                            <Card key={order.id} className="p-4">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <span className="font-bold text-lg">{order.code}</span>
                                        <p className="text-sm text-muted-foreground">{order.date}</p>
                                    </div>
                                    <Badge variant={STATUS_BADGES[order.status]?.variant || "outline"}>
                                        {STATUS_BADGES[order.status]?.label || order.status}
                                    </Badge>
                                </div>
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-sm text-muted-foreground">التكلفة:</span>
                                    <span className="font-bold">{order.total_cost?.toFixed(2) || "-"} ج.م</span>
                                </div>
                                {order.notes && (
                                    <p className="text-sm text-muted-foreground mb-3 truncate">{order.notes}</p>
                                )}
                                <div className="flex gap-2 justify-end">
                                    <Button size="sm" variant="outline" onClick={() => handleView(order)}>
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                    {order.status === "pending" && (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-green-600"
                                                onClick={() => setConfirmAction({ type: "complete", orderId: order.id })}
                                            >
                                                <Play className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-destructive"
                                                onClick={() => setConfirmAction({ type: "cancel", orderId: order.id })}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                    {/* Desktop Table View */}
                    <Card className="hidden md:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>الكود</TableHead>
                                    <TableHead>التاريخ</TableHead>
                                    <TableHead>الحالة</TableHead>
                                    <TableHead>التكلفة</TableHead>
                                    <TableHead>الملاحظات</TableHead>
                                    <TableHead>الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOrders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-medium">{order.code}</TableCell>
                                        <TableCell>{order.date}</TableCell>
                                        <TableCell>
                                            <Badge variant={STATUS_BADGES[order.status]?.variant || "outline"}>
                                                {STATUS_BADGES[order.status]?.label || order.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{order.total_cost?.toFixed(2) || "-"}</TableCell>
                                        <TableCell className="max-w-[200px] truncate">
                                            {order.notes || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                <Button size="icon" variant="ghost" onClick={() => handleView(order)}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                {order.status === "pending" && (
                                                    <>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="text-green-600"
                                                            onClick={() => setConfirmAction({ type: "complete", orderId: order.id })}
                                                        >
                                                            <Play className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="text-destructive"
                                                            onClick={() => setConfirmAction({ type: "cancel", orderId: order.id })}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                </>
            )}

            {/* Create Dialog */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>أمر تجميع جديد</DialogTitle>
                        <DialogDescription>
                            أضف الباندلات المراد تجميعها وحدد الكميات
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium">الكود</label>
                                <Input {...form.register("code")} readOnly />
                            </div>
                            <div>
                                <label className="text-sm font-medium">التاريخ</label>
                                <Input type="date" {...form.register("date")} />
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium">ملاحظات</label>
                            <Textarea {...form.register("notes")} rows={2} />
                        </div>

                        {/* Items Section */}
                        <div className="border rounded-lg p-3 sm:p-4 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-medium">الباندلات</h3>
                                <Button type="button" size="sm" onClick={addItem}>
                                    <Plus className="h-4 w-4 ml-1" />
                                    إضافة
                                </Button>
                            </div>

                            {fields.length === 0 ? (
                                <div className="text-center py-8 bg-muted/30 rounded-lg">
                                    <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        لم تتم إضافة أي باندلات
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        اضغط "إضافة" لإضافة باندل
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {fields.map((field, index) => {
                                        const bundleId = form.watch(`items.${index}.bundle_id`);
                                        const selectedBundle = bundles.find((b: ProductBundle) => b.id === bundleId);

                                        return (
                                            <div key={field.id} className="bg-muted/30 p-3 rounded-lg">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-medium">باندل #{index + 1}</span>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7"
                                                        onClick={() => remove(index)}
                                                    >
                                                        <X className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    <div className="sm:col-span-2">
                                                        <Select
                                                            value={String(bundleId || "")}
                                                            onValueChange={(v) =>
                                                                form.setValue(`items.${index}.bundle_id`, Number(v))
                                                            }
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="اختر الباندل..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {bundles.map((b: ProductBundle) => (
                                                                    <SelectItem key={b.id} value={String(b.id)}>
                                                                        {b.name} ({b.code})
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            placeholder="الكمية"
                                                            {...form.register(`items.${index}.quantity`, {
                                                                valueAsNumber: true,
                                                            })}
                                                        />
                                                    </div>
                                                </div>
                                                {selectedBundle && (
                                                    <div className="mt-2 text-xs text-muted-foreground">
                                                        التكلفة: {selectedBundle.unit_cost?.toFixed(2) || 0} ج.م × {form.watch(`items.${index}.quantity`) || 1} =
                                                        <span className="font-bold text-blue-600 mr-1">
                                                            {((selectedBundle.unit_cost || 0) * (form.watch(`items.${index}.quantity`) || 1)).toFixed(2)} ج.م
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Shortages Warning */}
                        {shortages.length > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                                    <AlertTriangle className="h-5 w-5" />
                                    <span className="font-medium">نقص في المخزون</span>
                                </div>
                                <ul className="text-sm space-y-1">
                                    {shortages.map((s, i) => (
                                        <li key={i}>
                                            {s.name}: المطلوب {s.required}، المتاح {s.available}، النقص {s.shortage}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={checkAvailability}>
                                <CheckCircle className="h-4 w-4 ml-1" />
                                التحقق من المخزون
                            </Button>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleClose}>
                                إلغاء
                            </Button>
                            <Button type="submit" disabled={createMutation.isPending}>
                                إنشاء الأمر
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* View Dialog */}
            <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
                <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>تفاصيل أمر التجميع</DialogTitle>
                        <DialogDescription>عرض بيانات أمر التجميع والباندلات</DialogDescription>
                    </DialogHeader>
                    {viewOrder && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-muted/30 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">الكود</span>
                                    <span className="font-bold">{viewOrder.code}</span>
                                </div>
                                <div className="bg-muted/30 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">التاريخ</span>
                                    <span className="font-medium">{viewOrder.date}</span>
                                </div>
                                <div className="bg-muted/30 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">الحالة</span>
                                    <Badge variant={STATUS_BADGES[viewOrder.status]?.variant || "outline"} className="mt-1">
                                        {STATUS_BADGES[viewOrder.status]?.label || viewOrder.status}
                                    </Badge>
                                </div>
                                <div className="bg-muted/30 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">التكلفة</span>
                                    <span className="font-bold text-blue-600">{viewOrder.total_cost?.toFixed(2) || "-"} ج.م</span>
                                </div>
                            </div>
                            {viewOrder.notes && (
                                <div className="bg-muted/30 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">الملاحظات</span>
                                    <p className="text-sm mt-1">{viewOrder.notes}</p>
                                </div>
                            )}
                            <div className="border-t pt-4">
                                <h4 className="font-medium mb-3">الباندلات ({viewOrder.items?.length || 0})</h4>
                                <div className="space-y-2">
                                    {viewOrder.items?.map((item) => (
                                        <div key={item.id} className="bg-muted/30 p-3 rounded-lg flex justify-between items-center">
                                            <div>
                                                <span className="font-medium">{item.bundle?.name || `#${item.bundle_id}`}</span>
                                                <span className="text-sm text-muted-foreground mr-2">× {item.quantity}</span>
                                            </div>
                                            <span className="font-bold text-blue-600">{item.total_cost?.toFixed(2) || "-"} ج.م</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Confirm Action Dialog */}
            <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmAction?.type === "complete" ? "تأكيد التنفيذ" : "تأكيد الإلغاء"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmAction?.type === "complete"
                                ? "هل أنت متأكد من تنفيذ أمر التجميع؟ سيتم خصم المكونات من المخزون وإضافة الباندلات."
                                : "هل أنت متأكد من إلغاء أمر التجميع؟"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>رجوع</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (confirmAction?.type === "complete") {
                                    completeMutation.mutate(confirmAction.orderId);
                                } else if (confirmAction?.type === "cancel") {
                                    cancelMutation.mutate(confirmAction.orderId);
                                }
                            }}
                            className={confirmAction?.type === "cancel" ? "bg-destructive hover:bg-destructive/90" : ""}
                        >
                            {confirmAction?.type === "complete" ? "تنفيذ" : "إلغاء الأمر"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
