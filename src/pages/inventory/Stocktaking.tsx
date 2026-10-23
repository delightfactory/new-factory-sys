import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { factoryBusinessDay } from "@/platform/date/factory-business-day";
import { countStatus } from "@/features/stocktaking/count-workspace";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StocktakingService, type InventorySession } from "@/services/StocktakingService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";


export default function Stocktaking() {
    const navigate = useNavigate();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [draftDay] = useState(factoryBusinessDay);
    const queryClient = useQueryClient();

    // Fetch Sessions
    const { data: sessions, isPending, isError, refetch } = useQuery({
        queryKey: ['stocktakingSessions'],
        queryFn: StocktakingService.getSessions, retry:false
    });

    // Create Session Logic


    const createMutation = useMutation({
        mutationFn: async () => {
            // 1. Create Header
            const session = await StocktakingService.createSession({
                type: 'partial', // We can derive this if all checked
                status: 'draft',
                date: draftDay
            });
            return session;
        },
        onSuccess: (session) => {
            queryClient.invalidateQueries({ queryKey: ['stocktakingSessions'] });
            setIsCreateOpen(false);
            toast.success("أُنشئت المسودة. اختر الأقسام وابدأ العد من ورقة الجرد.");
            navigate(`/inventory/stocktaking/${session.id}`);
        },
        onError: (e) => toast.error(e.message)
    });

    const columns: ColumnDef<InventorySession>[] = [
        { accessorKey: "code", header: "رقم الجلسة" },
        {
            accessorKey: "date",
            header: "التاريخ",
            cell: ({ row }) => format(new Date(row.getValue('date')), 'dd/MM/yyyy')
        },
        {
            accessorKey: "status",
            header: "الحالة",
            cell: ({ row }) => {
                const s = row.getValue('status') as string;
                return <Badge variant={s === 'completed' ? 'default' : s === 'in_progress' ? 'secondary' : 'outline'}>
                    {countStatus(s)}
                </Badge>
            }
        },
        {
            id: 'actions',
            cell: ({ row }) => (
                <Button variant="ghost" size="sm" onClick={() => navigate(`/inventory/stocktaking/${row.original.id}`)}>
                    <ArrowRight className="w-4 h-4 mr-1" /> فتح
                </Button>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="جرد المخزون"
                description="إدارة جلسات الجرد ومطابقة الأرصدة"
                icon={ClipboardList}
                actions={
                    <Button onClick={() => setIsCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" /> مسودة جرد جديدة
                    </Button>
                }
            />

            {isPending ? <p role="status">جارٍ تحميل جلسات الجرد…</p> : isError ? <div role="alert"><p>تعذر تحميل جلسات الجرد كاملة.</p><Button onClick={()=>void refetch()}>إعادة المحاولة</Button></div> : sessions && sessions.length > 0 ? (
                <DataTable
                    columns={columns}
                    data={sessions}
                    onRowClick={(session) => navigate(`/inventory/stocktaking/${session.id}`)}
                />
            ) : (
                <EmptyState
                    icon={ClipboardList}
                    title="لا توجد جلسات جرد"
                    description="ابدأ بإنشاء جلسة جرد جديدة"
                    action={
                        <Button onClick={() => setIsCreateOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" /> مسودة جرد جديدة
                        </Button>
                    }
                />
            )}

            <Dialog open={isCreateOpen} onOpenChange={open=>{if(!createMutation.isPending)setIsCreateOpen(open);}}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>إنشاء مسودة جرد</DialogTitle>
                        <DialogDescription>
                            احفظ المسودة أولًا، ثم اختر الأقسام وابدأ العد داخل ورقة الجرد. لن تؤخذ لقطة المخزون قبل بدء العد.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end pt-4 border-t">
                        <Button className="w-full sm:w-auto" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                            {createMutation.isPending ? "جاري التحضير..." : "إنشاء المسودة"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
