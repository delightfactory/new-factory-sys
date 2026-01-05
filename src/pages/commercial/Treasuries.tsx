import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TreasuriesService, type Treasury } from "@/services/TreasuriesService";
import { Button } from "@/components/ui/button";
import { Plus, Landmark, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/ui/page-header";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";

export default function Treasuries() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [activeTransaction, setActiveTransaction] = useState<{ type: 'deposit' | 'withdraw' | 'transfer', treasury: Treasury } | null>(null);
    const queryClient = useQueryClient();

    // Fetch Treasuries
    const { data: treasuries, isLoading } = useQuery({
        queryKey: ['treasuries'],
        queryFn: TreasuriesService.getTreasuries
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="الخزائن والحسابات"
                description="إدارة النقدية، الخزائن، والحسابات البنكية"
                icon={Landmark}
                actions={
                    <CreateTreasuryDialog
                        open={isCreateOpen}
                        onOpenChange={setIsCreateOpen}
                        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['treasuries'] })}
                    />
                }
            />

            {isLoading ? (
                <CardGridSkeleton count={3} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {treasuries?.map((t) => (
                        <Card key={t.id} className="relative overflow-hidden">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xl font-bold">{t.name}</CardTitle>
                                {t.type === 'bank' ? <Landmark className="h-5 w-5 text-muted-foreground" /> : <Wallet className="h-5 w-5 text-muted-foreground" />}
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold mt-2 text-primary">
                                    {t.balance.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{t.currency || 'EGP'}</span>
                                </div>
                                <CardDescription className="mt-2">
                                    {t.type === 'bank' ? `حساب: ${t.account_number || '---'}` : 'خزنة نقدية'}
                                </CardDescription>
                            </CardContent>
                            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-primary/10" />
                            <CardFooter className="flex gap-2 justify-end pt-2">
                                <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => setActiveTransaction({ type: 'deposit', treasury: t })}>إيداع</Button>
                                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setActiveTransaction({ type: 'withdraw', treasury: t })}>صرف</Button>
                                <Button variant="outline" size="sm" onClick={() => setActiveTransaction({ type: 'transfer', treasury: t })}>تحويل</Button>
                            </CardFooter>
                        </Card>
                    ))}
                    {treasuries?.length === 0 && (
                        <div className="col-span-full text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                            لا توجد خزائن أو حسابات بنكية مضافة بعد.
                        </div>
                    )}
                </div>
            )}

            {/* Transaction Dialog (Deposit/Withdraw) */}
            <TransactionDialog
                open={activeTransaction?.type === 'deposit' || activeTransaction?.type === 'withdraw'}
                type={activeTransaction?.type as 'deposit' | 'withdraw'}
                treasury={activeTransaction?.treasury}
                onOpenChange={(open: boolean) => !open && setActiveTransaction(null)}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['treasuries'] })}
            />

            {/* Transfer Dialog */}
            <TransferDialog
                open={activeTransaction?.type === 'transfer'}
                sourceTreasury={activeTransaction?.treasury}
                allTreasuries={treasuries || []}
                onOpenChange={(open: boolean) => !open && setActiveTransaction(null)}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['treasuries'] })}
            />
        </div>
    );
}

// Sub-Components
function TransactionDialog({ open, type, treasury, onOpenChange, onSuccess }: any) {
    const { register, handleSubmit, reset } = useForm();
    const mutation = useMutation({
        mutationFn: type === 'deposit' ? TreasuriesService.deposit : TreasuriesService.withdraw,
        onSuccess: () => {
            toast.success(type === 'deposit' ? "تم الإيداع بنجاح" : "تم الصرف بنجاح");
            onOpenChange(false);
            reset();
            onSuccess();
        },
        onError: (e) => toast.error("فشل العملية: " + e.message)
    });

    const onSubmit = (data: any) => {
        mutation.mutate({
            treasury_id: treasury.id,
            amount: parseFloat(data.amount),
            description: data.description
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{type === 'deposit' ? 'إيداع نقدية' : 'صرف نقدية'}</DialogTitle>
                    <DialogDescription>
                        {type === 'deposit' ? `إضافة أموال إلى: ${treasury?.name}` : `سحب أموال من: ${treasury?.name}`}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <FormField label="المبلغ" required>
                        <Input type="number" step="0.01" {...register('amount', { required: "مطلوب", min: 0.01 })} placeholder="0.00" />
                    </FormField>
                    <FormField label="الملاحظات / السبب" required>
                        <Input {...register('description', { required: "مطلوب" })} placeholder="سبب العملية" />
                    </FormField>
                    <Button type="submit" variant={type === 'deposit' ? 'default' : 'destructive'} className="w-full" disabled={mutation.isPending}>
                        {type === 'deposit' ? 'تأكيد الإيداع' : 'تأكيد الصرف'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function TransferDialog({ open, sourceTreasury, allTreasuries, onOpenChange, onSuccess }: any) {
    const { register, handleSubmit, reset, setValue } = useForm();
    const mutation = useMutation({
        mutationFn: TreasuriesService.transfer,
        onSuccess: () => {
            toast.success("تم التحويل بنجاح");
            onOpenChange(false);
            reset();
            onSuccess();
        },
        onError: (e) => toast.error("فشل التحويل: " + e.message)
    });

    const onSubmit = (data: any) => {
        mutation.mutate({
            from_id: sourceTreasury.id,
            to_id: parseInt(data.to_id),
            amount: parseFloat(data.amount),
            description: data.description
        });
    };

    const targets = allTreasuries.filter((t: any) => t.id !== sourceTreasury?.id);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>تحويل أموال</DialogTitle>
                    <DialogDescription>تحويل من: {sourceTreasury?.name}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <FormField label="تحويل إلى" required>
                        <Select onValueChange={(val: string) => setValue('to_id', val)}>
                            <SelectTrigger>
                                <SelectValue placeholder="اختر الخزنة المستلمة" />
                            </SelectTrigger>
                            <SelectContent>
                                {targets.map((t: any) => (
                                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
                    <FormField label="المبلغ" required>
                        <Input type="number" step="0.01" {...register('amount', { required: "مطلوب", min: 0.01 })} placeholder="0.00" />
                    </FormField>
                    <FormField label="ملاحظات">
                        <Input {...register('description')} placeholder="سبب التحويل" />
                    </FormField>
                    <Button type="submit" className="w-full" disabled={mutation.isPending}>
                        تأكيد التحويل
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function CreateTreasuryDialog({ open, onOpenChange, onSuccess }: any) {
    const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<Treasury>({
        defaultValues: {
            type: 'cash',
            currency: 'EGP',
            balance: 0
        }
    });
    const createMutation = useMutation({
        mutationFn: TreasuriesService.createTreasury,
        onSuccess: () => {
            toast.success("تم إضافة الخزنة/الحساب بنجاح");
            onOpenChange(false);
            reset();
            onSuccess();
        },
        onError: (e) => toast.error("فشل الإضافة: " + e.message)
    });

    const onSubmit = (data: Treasury) => {
        createMutation.mutate(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> إضافة جديد</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>إضافة خزنة أو حساب بنكي</DialogTitle>
                    <DialogDescription>أدخل تفاصيل الحساب المالي الجديد.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <FormField label="الاسم" required error={errors.name?.message}>
                        <Input {...register('name', { required: "مطلوب" })} placeholder="مثال: الخزنة الرئيسية" />
                    </FormField>

                    <FormField label="النوع" required>
                        <Select onValueChange={(val: string) => setValue('type', val as 'cash' | 'bank')} defaultValue="cash">
                            <SelectTrigger>
                                <SelectValue placeholder="اختر النوع" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cash">خزنة نقدية (Cash)</SelectItem>
                                <SelectItem value="bank">حساب بنكي (Bank Account)</SelectItem>
                            </SelectContent>
                        </Select>
                    </FormField>

                    <FormGrid className="grid-cols-2">
                        <FormField label="الرصيد الافتتاحي">
                            <Input type="number" step="0.01" {...register('balance', { valueAsNumber: true })} />
                        </FormField>
                        <FormField label="العملة">
                            <Input {...register('currency')} defaultValue="EGP" />
                        </FormField>
                    </FormGrid>

                    <FormField label="رقم الحساب (للبنوك فقط)">
                        <Input {...register('account_number')} placeholder="XXXX-XXXX" />
                    </FormField>

                    <FormField label="ملاحظات">
                        <Input {...register('description')} />
                    </FormField>

                    <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
