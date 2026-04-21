import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Factory, Package, CheckCircle, Loader2, Edit2 } from "lucide-react";
import { toast } from "sonner";

export interface ShortageItem {
    semi_finished_id: number;
    name: string;
    unit: string;
    required_qty: number;
    available_qty: number;
    shortage_qty: number;
}

export interface SuggestedProductionItem {
    semi_finished_id: number;
    name: string;
    unit: string;
    suggested_qty: number;
    recipe_batch_size: number;
}

export interface ShortageAnalysisResult {
    success: boolean;
    can_complete: boolean;
    order_id: number;
    shortages: ShortageItem[];
    suggested_production: SuggestedProductionItem[];
    shortage_count: number;
    error?: string;
}

interface ShortageAnalysisDialogProps {
    isOpen: boolean;
    onClose: () => void;
    analysisResult: ShortageAnalysisResult | null;
    isLoading: boolean;
    onProceedAnyway: () => void;
    onCreateProductionOrder: (items: { semi_finished_id: number; quantity: number }[]) => Promise<void>;
    isCreatingOrder: boolean;
}

export function ShortageAnalysisDialog({
    isOpen,
    onClose,
    analysisResult,
    isLoading,
    onProceedAnyway,
    onCreateProductionOrder,
    isCreatingOrder
}: ShortageAnalysisDialogProps) {
    // Editable quantities for each suggested item
    const [editableQuantities, setEditableQuantities] = useState<Record<number, number>>({});
    const [isEditing, setIsEditing] = useState(false);

    // Initialize editable quantities when dialog opens or analysis result changes
    useEffect(() => {
        if (isOpen && analysisResult?.suggested_production) {
            const initial: Record<number, number> = {};
            analysisResult.suggested_production.forEach(item => {
                initial[item.semi_finished_id] = item.suggested_qty;
            });
            setEditableQuantities(initial);
        }
        if (!isOpen) {
            setEditableQuantities({});
            setIsEditing(false);
        }
    }, [isOpen, analysisResult]);

    const handleQuantityChange = (id: number, value: number) => {
        setEditableQuantities(prev => ({
            ...prev,
            [id]: Math.max(0, value)
        }));
    };

    const handleCreateOrder = async () => {
        const items = Object.entries(editableQuantities)
            .filter(([_, qty]) => qty > 0)
            .map(([id, qty]) => ({
                semi_finished_id: Number(id),
                quantity: qty
            }));

        if (items.length === 0) {
            toast.error("يجب تحديد كمية لمنتج واحد على الأقل");
            return;
        }

        await onCreateProductionOrder(items);
    };

    const handleClose = () => {
        setEditableQuantities({});
        setIsEditing(false);
        onClose();
    };

    if (isLoading) {
        return (
            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            جاري التحليل
                        </DialogTitle>
                        <DialogDescription>
                            جاري تحليل متطلبات أمر التعبئة...
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-muted-foreground">يرجى الانتظار...</p>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    // Can complete - show success
    if (analysisResult?.can_complete) {
        return (
            <Dialog open={isOpen} onOpenChange={handleClose}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            المخزون كافٍ
                        </DialogTitle>
                        <DialogDescription>
                            جميع المواد المطلوبة متوفرة. يمكنك تنفيذ أمر التعبئة.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={handleClose}>إلغاء</Button>
                        <Button onClick={onProceedAnyway} className="bg-green-600 hover:bg-green-700">
                            <CheckCircle className="mr-2 h-4 w-4" />
                            تنفيذ الأمر
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    // Has shortages - show analysis
    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader className="pb-4 border-b">
                    <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="h-5 w-5" />
                        نقص في المنتجات النصف مصنعة
                    </DialogTitle>
                    <DialogDescription>
                        لإكمال أمر التعبئة، يوجد نقص في بعض المنتجات النصف مصنعة
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Shortages Table */}
                    <div className="border rounded-lg overflow-hidden">
                        <div className="bg-red-50 dark:bg-red-950/30 px-4 py-2 border-b flex items-center gap-2">
                            <Package className="h-4 w-4 text-red-600" />
                            <h3 className="font-medium text-sm text-red-700 dark:text-red-400">تحليل النقص</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30">
                                        <TableHead className="min-w-[120px]">المنتج</TableHead>
                                        <TableHead className="text-center min-w-[80px]">المطلوب</TableHead>
                                        <TableHead className="text-center min-w-[80px]">المتوفر</TableHead>
                                        <TableHead className="text-center min-w-[80px]">النقص</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analysisResult?.shortages.map(item => (
                                        <TableRow key={item.semi_finished_id}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell className="text-center">
                                                {item.required_qty.toLocaleString()} {item.unit}
                                            </TableCell>
                                            <TableCell className="text-center text-muted-foreground">
                                                {item.available_qty.toLocaleString()} {item.unit}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="destructive">
                                                    {item.shortage_qty.toLocaleString()} {item.unit}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Suggested Production */}
                    <div className="border rounded-lg overflow-hidden">
                        <div className="bg-blue-50 dark:bg-blue-950/30 px-4 py-2 border-b flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Factory className="h-4 w-4 text-blue-600" />
                                <h3 className="font-medium text-sm text-blue-700 dark:text-blue-400">
                                    اقتراح: إنشاء أمر إنتاج
                                </h3>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsEditing(!isEditing)}
                                className="text-blue-600 hover:text-blue-700"
                            >
                                <Edit2 className="h-4 w-4 mr-1" />
                                {isEditing ? "إيقاف التعديل" : "تعديل الكميات"}
                            </Button>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/30">
                                    <TableHead>المنتج النصف مصنع</TableHead>
                                    <TableHead className="text-center">الكمية المقترحة</TableHead>
                                    <TableHead className="text-center">الوحدة</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {analysisResult?.suggested_production.map(item => (
                                    <TableRow key={item.semi_finished_id}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-center">
                                            {isEditing ? (
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={editableQuantities[item.semi_finished_id] ?? item.suggested_qty}
                                                    onChange={(e) => handleQuantityChange(item.semi_finished_id, Number(e.target.value))}
                                                    className="w-24 mx-auto text-center"
                                                />
                                            ) : (
                                                <span className="font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                                                    {(editableQuantities[item.semi_finished_id] ?? item.suggested_qty).toLocaleString()}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center text-muted-foreground">
                                            {item.unit}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Info Note */}
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
                        <p className="text-amber-800 dark:text-amber-200">
                            💡 يمكنك تعديل الكميات المقترحة قبل إنشاء أمر الإنتاج، أو التنفيذ رغم النقص (سيؤدي لأرصدة سالبة).
                        </p>
                    </div>
                </div>

                <DialogFooter className="pt-4 border-t gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleClose}>
                        إلغاء
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={onProceedAnyway}
                        className="bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                    >
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        تنفيذ رغم النقص
                    </Button>
                    <Button
                        onClick={handleCreateOrder}
                        disabled={isCreatingOrder}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {isCreatingOrder ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                جاري الإنشاء...
                            </>
                        ) : (
                            <>
                                <Factory className="mr-2 h-4 w-4" />
                                إنشاء أمر إنتاج
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
