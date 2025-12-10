import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FinancialService } from "@/services/FinancialService";
import { TreasuriesService } from "@/services/TreasuriesService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { useForm } from "react-hook-form";
import { Plus, Trash2, TrendingDown, Wallet, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CategoriesManager } from "@/components/financial/CategoriesManager";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";

export default function FinancialLog() {
    const [isOpen, setIsOpen] = useState(false);
    const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
    const queryClient = useQueryClient();

    const { data: transactions, isLoading } = useQuery({
        queryKey: ['financial_transactions', typeFilter],
        queryFn: () => FinancialService.getTransactions(typeFilter === 'all' ? undefined : typeFilter)
    });

    const deleteMutation = useMutation({
        mutationFn: FinancialService.deleteTransaction,
        onSuccess: () => {
            toast.success("تم حذف المعاملة وعكس الأثر المالي");
            queryClient.invalidateQueries({ queryKey: ['financial_transactions'] });
            queryClient.invalidateQueries({ queryKey: ['treasuries'] });
        },
        onError: (e) => toast.error(e.message)
    });

    // Calculate totals
    const totalExpenses = transactions?.filter((t: any) => t.transaction_type === 'expense').reduce((sum: number, e: any) => sum + e.amount, 0) || 0;
    const totalIncome = transactions?.filter((t: any) => t.transaction_type === 'income').reduce((sum: number, e: any) => sum + e.amount, 0) || 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title="السجل المالي"
                description="تسجيل ومتابعة المصروفات والإيرادات المتنوعة"
                icon={Wallet}
                actions={
                    <>
                        <CategoriesManager />
                        <Dialog open={isOpen} onOpenChange={setIsOpen}>
                            <DialogTrigger asChild>
                                <Button><Plus className="mr-2 h-4 w-4" /> تسجيل عملية جديدة</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>تسجيل معاملة مالية</DialogTitle>
                                    <DialogDescription>أدخل تفاصيل العملية المالية الجديدة أدناه.</DialogDescription>
                                </DialogHeader>
                                <CreateTransactionForm onSuccess={() => setIsOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    </>
                }
            />

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">إجمالي المصروفات (فترة العرض)</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{totalExpenses.toLocaleString()} ج.م</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">إجمالي الإيرادات (فترة العرض)</CardTitle>
                        <TrendingDown className="h-4 w-4 text-emerald-500 rotate-180" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">{totalIncome.toLocaleString()} ج.م</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>سجل المعاملات</CardTitle>
                        <div className="flex gap-2 text-sm">
                            <Button variant={typeFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setTypeFilter('all')}>الكل</Button>
                            <Button variant={typeFilter === 'expense' ? 'default' : 'outline'} size="sm" onClick={() => setTypeFilter('expense')}>مصروفات</Button>
                            <Button variant={typeFilter === 'income' ? 'default' : 'outline'} size="sm" onClick={() => setTypeFilter('income')}>إيرادات</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <TableSkeleton rows={5} columns={7} />
                    ) : transactions && transactions.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>التاريخ</TableHead>
                                    <TableHead>النوع</TableHead>
                                    <TableHead>البند / الفئة</TableHead>
                                    <TableHead>الوصف</TableHead>
                                    <TableHead>المبلغ</TableHead>
                                    <TableHead>الخزينة</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.map((trx: any) => (
                                    <TableRow key={trx.id} className="hover:bg-muted/50">
                                        <TableCell>{format(new Date(trx.transaction_date), 'yyyy-MM-dd')}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${trx.transaction_type === 'income' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                {trx.transaction_type === 'income' ? 'إيراد' : 'مصروف'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-medium">{trx.category}</TableCell>
                                        <TableCell className="text-muted-foreground max-w-[200px] truncate">{trx.description}</TableCell>
                                        <TableCell className={`font-bold ${trx.transaction_type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {trx.transaction_type === 'income' ? '+' : '-'}{trx.amount.toLocaleString()} ج.م
                                        </TableCell>
                                        <TableCell>{trx.treasury?.name}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" className="hover:bg-destructive/10" onClick={() => {
                                                if (confirm("هل أنت متأكد من الحذف؟ سيتم عكس الأثر المالي."))
                                                    deleteMutation.mutate(trx.id);
                                            }}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <EmptyState
                            icon={FileText}
                            title="لا توجد معاملات"
                            description="ابدأ بتسجيل أول معاملة مالية"
                            action={
                                <Button onClick={() => setIsOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" /> تسجيل عملية
                                </Button>
                            }
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function CreateTransactionForm({ onSuccess }: { onSuccess: () => void }) {
    const queryClient = useQueryClient();
    const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
        defaultValues: {
            transaction_type: 'expense' as 'income' | 'expense',
            amount: 0,
            category: '',
            description: '',
            treasury_id: '',
            transaction_date: new Date().toISOString().split('T')[0]
        }
    });

    const type = watch('transaction_type');

    const { data: treasuries } = useQuery({
        queryKey: ['treasuries'],
        queryFn: TreasuriesService.getTreasuries
    });

    const { data: categories } = useQuery({
        queryKey: ['financial_categories', type],
        queryFn: () => FinancialService.getCategories(type)
    });

    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            return FinancialService.createTransaction({
                ...data,
                amount: parseFloat(data.amount),
                treasury_id: parseInt(data.treasury_id)
            });
        },
        onSuccess: () => {
            toast.success("تم تسجيل العملية");
            queryClient.invalidateQueries({ queryKey: ['financial_transactions'] });
            queryClient.invalidateQueries({ queryKey: ['treasuries'] });
            onSuccess();
        },
        onError: (e) => toast.error(e.message)
    });

    return (
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <div className="flex gap-4 mb-4">
                <Button
                    type="button"
                    variant={type === 'expense' ? 'default' : 'outline'}
                    className={type === 'expense' ? 'bg-red-600 hover:bg-red-700' : ''}
                    onClick={() => setValue('transaction_type', 'expense')}
                >
                    تسجيل مصروف
                </Button>
                <Button
                    type="button"
                    variant={type === 'income' ? 'default' : 'outline'}
                    className={type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                    onClick={() => setValue('transaction_type', 'income')}
                >
                    تسجيل إيراد
                </Button>
            </div>

            <FormField label={`الخزينة (${type === 'income' ? 'جهة الإيداع' : 'مصدر الدفع'})`} required error={errors.treasury_id?.message}>
                <SearchableSelect
                    options={treasuries?.map((t: any) => ({
                        value: t.id.toString(),
                        label: t.name,
                        description: `رصيد: ${t.balance}`
                    })) || []}
                    value={watch('treasury_id')?.toString()}
                    onValueChange={(val) => setValue('treasury_id', val, { shouldValidate: true })}
                    placeholder="اختر الخزينة"
                    searchPlaceholder="ابحث عن خزينة..."
                />
            </FormField>

            <FormGrid>
                <FormField label="المبلغ" required error={errors.amount?.message}>
                    <Input type="number" step="0.01" {...register('amount', { required: "مطلوب" })} />
                </FormField>
                <FormField label="التاريخ" required error={errors.transaction_date?.message}>
                    <Input type="date" {...register('transaction_date', { required: "مطلوب" })} />
                </FormField>
            </FormGrid>

            <FormField label="البند / الفئة" required error={errors.category?.message}>
                <SearchableSelect
                    options={categories?.map((cat: any) => ({
                        value: cat.name,
                        label: cat.name
                    })) || []}
                    value={watch('category')}
                    onValueChange={(val) => setValue('category', val, { shouldValidate: true })}
                    placeholder="اختر البند"
                    searchPlaceholder="ابحث عن بند..."
                />
            </FormField>

            <FormField label="الوصف" required error={errors.description?.message}>
                <Input {...register('description', { required: "مطلوب" })} placeholder="تفاصيل..." />
            </FormField>

            {/* Check required fields for button disabled state */}
            {(() => {
                const treasuryId = watch('treasury_id');
                const category = watch('category');
                const amount = watch('amount');
                const isFormValid = !!treasuryId && !!category && amount > 0;

                return (
                    <Button
                        type="submit"
                        className={`w-full ${type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                        disabled={createMutation.isPending || !isFormValid}
                    >
                        {createMutation.isPending ? "جاري التسجيل..." : !isFormValid ? "أكمل البيانات المطلوبة" : "حفظ العملية"}
                    </Button>
                );
            })()}
        </form>
    );
}
