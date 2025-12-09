import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StocktakingService, type InventorySession } from "@/services/StocktakingService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import StocktakingSession from "./StocktakingSession"; // We will create this next

export default function Stocktaking() {
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const queryClient = useQueryClient();

    // Fetch Sessions
    const { data: sessions } = useQuery({
        queryKey: ['stocktakingSessions'],
        queryFn: StocktakingService.getSessions
    });

    // Create Session Logic
    const [filters, setFilters] = useState({
        raw: true,
        packaging: true,
        semi: false,
        finished: false
    });

    const createMutation = useMutation({
        mutationFn: async () => {
            // 1. Create Header
            const session = await StocktakingService.createSession({
                type: 'partial', // We can derive this if all checked
                status: 'draft',
                date: new Date().toISOString()
            });
            // 2. Generate Snapshot
            await StocktakingService.startSession(session.id, filters);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stocktakingSessions'] });
            setIsCreateOpen(false);
            toast.success("تم بدء جلسة الجرد بنجاح");
        },
        onError: (e) => toast.error(e.message)
    });

    // If active session selected, show Detail View
    if (activeSessionId) {
        return <StocktakingSession sessionId={activeSessionId} onBack={() => setActiveSessionId(null)} />;
    }

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
                    {s === 'completed' ? 'مكتمل' : s === 'in_progress' ? 'جاري' : s}
                </Badge>
            }
        },
        {
            id: 'actions',
            cell: ({ row }) => (
                <Button variant="ghost" size="sm" onClick={() => setActiveSessionId(row.original.id)}>
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

            {sessions && sessions.length > 0 ? (
                <DataTable columns={columns} data={sessions} />
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

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>بدء جلسة جرد جديدة</DialogTitle>
                        <DialogDescription>
                            اختر الأقسام التي تريد جردها لبدء جلسة جديدة. سيتم أخذ نسخة لحظية من الأرصدة الحالية.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Label>ماذا تريد أن تجرد؟</Label>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                <Checkbox id="raw" checked={filters.raw} onCheckedChange={(c: boolean) => setFilters(f => ({ ...f, raw: !!c }))} />
                                <label htmlFor="raw">المواد الخام</label>
                            </div>
                            <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                <Checkbox id="pkg" checked={filters.packaging} onCheckedChange={(c: boolean) => setFilters(f => ({ ...f, packaging: !!c }))} />
                                <label htmlFor="pkg">مواد التعبئة</label>
                            </div>
                            <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                <Checkbox id="semi" checked={filters.semi} onCheckedChange={(c: boolean) => setFilters(f => ({ ...f, semi: !!c }))} />
                                <label htmlFor="semi">منتجات نصف مصنعة</label>
                            </div>
                            <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                <Checkbox id="fin" checked={filters.finished} onCheckedChange={(c: boolean) => setFilters(f => ({ ...f, finished: !!c }))} />
                                <label htmlFor="fin">منتجات نهائية</label>
                            </div>
                        </div>
                        <Button className="w-full mt-4" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                            {createMutation.isPending ? "جاري التحضير..." : "بدء الجرد"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
