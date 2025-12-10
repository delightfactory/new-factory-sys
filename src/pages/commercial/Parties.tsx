import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartiesService, type Party } from "@/services/PartiesService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/ui/page-header";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Parties() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedParty, setSelectedParty] = useState<Party | null>(null);
    const [selectedType, setSelectedType] = useState<'supplier' | 'customer'>('supplier');
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Fetch Parties
    const { data: parties } = useQuery({
        queryKey: ['parties', selectedType],
        queryFn: () => PartiesService.getParties(selectedType)
    });

    const deleteMutation = useMutation({
        mutationFn: PartiesService.deleteParty,
        onSuccess: () => {
            toast.success("تم حذف الجهة بنجاح");
            queryClient.invalidateQueries({ queryKey: ['parties'] });
        },
        onError: () => toast.error("لا يمكن الحذف: قد توجد فواتير مرتبطة بهذه الجهة.")
    });

    const columns: ColumnDef<Party>[] = [
        { accessorKey: "name", header: "الاسم" },
        { accessorKey: "phone", header: "الهاتف" },
        {
            accessorKey: "balance", header: "الرصيد", cell: ({ row }) => {
                const bal = parseFloat(row.getValue('balance'));
                return <span className={bal > 0 ? "text-green-600 font-bold" : bal < 0 ? "text-red-600 font-bold" : ""}>
                    {bal.toLocaleString()} ج.م
                </span>
            }
        },
        { accessorKey: "tax_number", header: "رقم ضريبي" },
        {
            id: "actions",
            cell: ({ row }) => {
                const party = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>إجراءات</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => { setSelectedParty(party); setIsEditOpen(true); }}>
                                <Pencil className="mr-2 h-4 w-4" /> تعديل البيانات
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => {
                                    if (confirm("هل أنت متأكد من حذف هذه الجهة؟")) {
                                        deleteMutation.mutate(party.id);
                                    }
                                }}
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> حذف
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            }
        }
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="العملاء والموردين"
                description="إدارة بيانات الجهات التجارية وأرصدتها الحالية"
                icon={Users}
                actions={
                    <Button onClick={() => { setSelectedParty(null); setIsCreateOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" /> إضافة جديد
                    </Button>
                }
            />

            <Tabs defaultValue="supplier" onValueChange={(v: string) => setSelectedType(v as 'supplier' | 'customer')}>
                <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                    <TabsTrigger value="supplier">الموردين</TabsTrigger>
                    <TabsTrigger value="customer">العملاء</TabsTrigger>
                </TabsList>

                <TabsContent value="supplier" className="space-y-4">
                    <DataTable
                        columns={columns}
                        data={parties || []}
                        onRowClick={(party) => navigate(`/commercial/parties/${party.id}`)}
                    />
                </TabsContent>

                <TabsContent value="customer" className="space-y-4">
                    <DataTable
                        columns={columns}
                        data={parties || []}
                        onRowClick={(party) => navigate(`/commercial/parties/${party.id}`)}
                    />
                </TabsContent>
            </Tabs>

            {/* Create Dialog */}
            <PartyDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                defaultType={selectedType}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['parties'] })}
            />

            {/* Edit Dialog */}
            {selectedParty && (
                <PartyDialog
                    open={isEditOpen}
                    onOpenChange={(open: boolean) => { setIsEditOpen(open); if (!open) setSelectedParty(null); }}
                    defaultType={selectedParty.type}
                    initialData={selectedParty}
                    onSuccess={() => queryClient.invalidateQueries({ queryKey: ['parties'] })}
                />
            )}
        </div>
    );
}

function PartyDialog({ open, onOpenChange, defaultType, initialData, onSuccess }: any) {
    const { register, handleSubmit, reset, formState: { errors } } = useForm<Party>({
        defaultValues: initialData || { balance: 0 }
    });

    // Reset form when dialog opens/closes or initialData changes
    // (In a real app, use useEffect to reset form values when initialData changes)

    const mutation = useMutation({
        mutationFn: (data: Party) => {
            if (initialData) {
                return PartiesService.updateParty(initialData.id, data);
            } else {
                return PartiesService.createParty(data);
            }
        },
        onSuccess: () => {
            toast.success(initialData ? "تم التعديل بنجاح" : "تم الإضافة بنجاح");
            onOpenChange(false);
            if (!initialData) reset();
            onSuccess();
        },
        onError: (e) => toast.error("حدث خطأ: " + e.message)
    });

    const onSubmit = (data: Party) => {
        mutation.mutate({ ...data, type: defaultType });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{initialData ? 'تعديل بيانات' : 'إضافة'} {defaultType === 'supplier' ? 'مورد' : 'عميل'}</DialogTitle>
                    <DialogDescription>{initialData ? 'تعديل بيانات الجهة الحالية.' : 'أدخل بيانات الجهة الجديدة.'}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <FormField label="الاسم" required error={errors.name?.message}>
                        <Input {...register('name', { required: "مطلوب" })} placeholder="اسم الشركة / الشخص" defaultValue={initialData?.name} />
                    </FormField>

                    <FormGrid className="grid-cols-2">
                        <FormField label="الهاتف">
                            <Input {...register('phone')} defaultValue={initialData?.phone} />
                        </FormField>
                        <FormField label="البريد الإلكتروني">
                            <Input {...register('email')} defaultValue={initialData?.email} />
                        </FormField>
                    </FormGrid>

                    <FormField label="العنوان">
                        <Input {...register('address')} defaultValue={initialData?.address} />
                    </FormField>

                    <FormGrid className="grid-cols-2">
                        <FormField label="رقم التسجيل الضريبي">
                            <Input {...register('tax_number')} defaultValue={initialData?.tax_number} />
                        </FormField>
                        <FormField label="السجل التجاري">
                            <Input {...register('commercial_record')} defaultValue={initialData?.commercial_record} />
                        </FormField>
                    </FormGrid>

                    {!initialData && (
                        <FormField label="الرصيد الافتتاحي (دائن/مدين)">
                            <Input type="number" step="0.01" {...register('balance')} defaultValue={0} />
                            <p className="text-xs text-muted-foreground mt-1">
                                {defaultType === 'supplier' ? 'سالب = علينا (دائن)، موجب = لنا (مدين/مقدم)' : 'موجب = علينا (مدين)، سالب = له (دائن/مقدم)'}
                            </p>
                        </FormField>
                    )}

                    {initialData && (
                        <Alert>
                            <AlertTitle>تنبيه</AlertTitle>
                            <AlertDescription>
                                تعديل الرصيد يدوياً غير متاح هنا. الرصيد يتم تحديثه تلقائياً عبر الفواتير والسندات. لتصحيح الرصيد قم بعمل سند قبض/صرف.
                            </AlertDescription>
                        </Alert>
                    )}

                    <Button type="submit" className="w-full" disabled={mutation.isPending}>
                        {mutation.isPending ? "جاري الحفظ..." : "حفظ"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
