import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FinancialService } from "@/services/FinancialService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

export function CategoriesManager() {
    const [isOpen, setIsOpen] = useState(false);
    const [newCategory, setNewCategory] = useState("");
    const [activeType, setActiveType] = useState<'income' | 'expense'>('expense');
    const queryClient = useQueryClient();

    const { data: categories, isLoading } = useQuery({
        queryKey: ['financial_categories', activeType],
        queryFn: () => FinancialService.getCategories(activeType)
    });

    const createMutation = useMutation({
        mutationFn: async (name: string) => FinancialService.createCategory({ name, type: activeType }),
        onSuccess: () => {
            toast.success("تم إضافة البند");
            setNewCategory("");
            queryClient.invalidateQueries({ queryKey: ['financial_categories'] });
        },
        onError: (e) => toast.error(e.message)
    });

    const deleteMutation = useMutation({
        mutationFn: FinancialService.deleteCategory,
        onSuccess: () => {
            toast.success("تم حذف البند");
            queryClient.invalidateQueries({ queryKey: ['financial_categories'] });
        },
        onError: (e) => toast.error(e.message)
    });

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCategory.trim()) return;
        createMutation.mutate(newCategory.trim());
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    إدارة البنود
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>إدارة بنود المصروفات والإيرادات</DialogTitle>
                    <DialogDescription>قائمة لإدارة بنود المصروفات والإيرادات في النظام.</DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="expense" value={activeType} onValueChange={(v) => setActiveType(v as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="expense">المصروفات</TabsTrigger>
                        <TabsTrigger value="income">الإيرادات</TabsTrigger>
                    </TabsList>

                    <div className="mt-4">
                        <form onSubmit={handleAdd} className="flex gap-2 items-end mb-4">
                            <div className="grid gap-1.5 flex-1">
                                <Label>اسم البند الجديد ({activeType === 'expense' ? 'مصروف' : 'إيراد'})</Label>
                                <Input
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    placeholder="مثال:..."
                                />
                            </div>
                            <Button type="submit" disabled={createMutation.isPending}>
                                <Plus className="w-4 h-4" />
                            </Button>
                        </form>

                        <div className="border rounded-md max-h-[300px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>اسم البند</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center">جار التحميل...</TableCell>
                                        </TableRow>
                                    ) : categories?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center text-muted-foreground">لا توجد بنود</TableCell>
                                        </TableRow>
                                    ) : categories?.map((cat: any) => (
                                        <TableRow key={cat.id}>
                                            <TableCell>{cat.name}</TableCell>
                                            <TableCell>
                                                {!cat.is_system && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive h-8 w-8"
                                                        onClick={() => {
                                                            if (confirm(`هل أنت متأكد من حذف بند "${cat.name}"؟`)) {
                                                                deleteMutation.mutate(cat.id);
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
