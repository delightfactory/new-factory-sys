import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BackupService } from "@/services/BackupService";
import type { BackupProgress, BackupData } from "@/services/BackupService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Download,
    Upload,
    RotateCcw,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    Shield,
    Database,
    FileJson,
    Trash2,
    Clock,
    Cloud
} from "lucide-react";
import { toast } from "sonner";

export default function SystemSettings() {
    const { isAdmin } = useAuth();
    const navigate = useNavigate();

    const [progress, setProgress] = useState<BackupProgress | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState<Record<string, number> | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    // Factory Reset
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [resetStep, setResetStep] = useState(1);

    // Redirect non-admins
    useEffect(() => {
        if (!isAdmin) {
            navigate("/");
            toast.error("غير مصرح بالوصول");
        }
    }, [isAdmin, navigate]);

    // Load stats on mount
    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        setLoadingStats(true);
        try {
            const data = await BackupService.getBackupStats();
            setStats(data);
        } catch (e) {
            console.error("Failed to load stats:", e);
        }
        setLoadingStats(false);
    };

    const totalRecords = stats ? Object.values(stats).reduce((a, b) => a + b, 0) : 0;

    // === BACKUP ===
    const handleCreateBackup = async () => {
        setIsProcessing(true);
        setProgress(null);

        try {
            await BackupService.downloadBackup((p) => setProgress(p));
            toast.success("تم إنشاء النسخة الاحتياطية بنجاح");
        } catch (e: any) {
            toast.error("فشل إنشاء النسخة الاحتياطية: " + e.message);
        }

        setIsProcessing(false);
    };

    // === RESTORE ===
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setProgress(null);

        try {
            const text = await file.text();
            const backup: BackupData = JSON.parse(text);

            // Validate
            const validation = BackupService.validateBackup(backup);
            if (!validation.valid) {
                toast.error("ملف غير صالح: " + validation.errors.join(", "));
                setIsProcessing(false);
                return;
            }

            // Confirm
            const confirmed = window.confirm(
                `هل أنت متأكد من استعادة هذه النسخة؟\n` +
                `تاريخ الإنشاء: ${new Date(backup.metadata.createdAt).toLocaleString('ar-EG')}\n` +
                `عدد السجلات: ${backup.metadata.recordCount}\n\n` +
                `⚠️ سيتم استبدال جميع البيانات الحالية!`
            );

            if (!confirmed) {
                setIsProcessing(false);
                return;
            }

            const result = await BackupService.restoreBackup(backup, (p) => setProgress(p));

            if (result.success) {
                toast.success("تم استعادة النسخة الاحتياطية بنجاح");
                loadStats();
            } else {
                toast.error("حدثت أخطاء أثناء الاستعادة");
                console.error(result.errors);
            }
        } catch (e: any) {
            toast.error("فشل قراءة الملف: " + e.message);
        }

        setIsProcessing(false);
        e.target.value = ''; // Reset file input
    };

    // === FACTORY RESET ===
    const handleFactoryReset = async () => {
        if (confirmText !== "FACTORY_RESET") {
            toast.error("رمز التأكيد غير صحيح");
            return;
        }

        setIsProcessing(true);
        setProgress(null);
        setResetDialogOpen(false);

        try {
            const result = await BackupService.factoryReset(
                "FACTORY_RESET_CONFIRM",
                (p) => setProgress(p)
            );

            if (result.success) {
                toast.success("تم إعادة ضبط المصنع بنجاح");
                loadStats();
            } else {
                toast.error("حدثت أخطاء: " + result.errors.join(", "));
            }
        } catch (e: any) {
            toast.error("فشل إعادة الضبط: " + e.message);
        }

        setIsProcessing(false);
        setConfirmText("");
        setResetStep(1);
    };

    if (!isAdmin) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/10">
                    <Shield className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">إعدادات النظام</h1>
                    <p className="text-muted-foreground">إدارة النسخ الاحتياطي واستعادة البيانات</p>
                </div>
            </div>

            {/* Stats Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        إحصائيات قاعدة البيانات
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingStats ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            جاري التحميل...
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 rounded-lg bg-muted/50">
                                <p className="text-sm text-muted-foreground">إجمالي السجلات</p>
                                <p className="text-2xl font-bold">{totalRecords.toLocaleString('ar-EG')}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/50">
                                <p className="text-sm text-muted-foreground">المواد الخام</p>
                                <p className="text-2xl font-bold">{(stats?.raw_materials || 0).toLocaleString('ar-EG')}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/50">
                                <p className="text-sm text-muted-foreground">الفواتير</p>
                                <p className="text-2xl font-bold">
                                    {((stats?.purchase_invoices || 0) + (stats?.sales_invoices || 0)).toLocaleString('ar-EG')}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/50">
                                <p className="text-sm text-muted-foreground">العملاء والموردين</p>
                                <p className="text-2xl font-bold">{(stats?.parties || 0).toLocaleString('ar-EG')}</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Automatic Backup Status */}
            <Card className="border-purple-500/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-600">
                        <Cloud className="w-5 h-5" />
                        النسخ الاحتياطي التلقائي
                    </CardTitle>
                    <CardDescription>
                        يتم إنشاء نسخة احتياطية تلقائية يومياً في الساعة 3 صباحاً وحفظها في السحابة
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <div>
                                <p className="text-sm font-medium">الحالة</p>
                                <p className="text-xs text-muted-foreground">مُفعّل</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Clock className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">الجدولة</p>
                                <p className="text-xs text-muted-foreground">يومياً - 3:00 ص</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Database className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">الاحتفاظ</p>
                                <p className="text-xs text-muted-foreground">آخر 7 نسخ</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                        💡 النسخ التلقائية تُحفظ في Supabase Storage ويمكن استعادتها من لوحة التحكم
                    </p>
                </CardContent>
            </Card>
            {/* Progress */}
            {progress && (
                <Alert className="border-primary/30 bg-primary/5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <AlertTitle>
                        {progress.status === 'exporting' && 'جاري التصدير...'}
                        {progress.status === 'importing' && 'جاري الاستيراد...'}
                        {progress.status === 'resetting' && 'جاري إعادة الضبط...'}
                        {progress.status === 'complete' && 'تم بنجاح!'}
                        {progress.status === 'error' && 'حدث خطأ'}
                    </AlertTitle>
                    <AlertDescription>
                        <div className="mt-2 space-y-2">
                            <p>{progress.message}</p>
                            <Progress
                                value={(progress.currentIndex / progress.totalTables) * 100}
                                className="h-2"
                            />
                            <p className="text-xs text-muted-foreground">
                                {progress.currentIndex} / {progress.totalTables} جدول
                            </p>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {/* Actions Grid */}
            <div className="grid md:grid-cols-3 gap-6">
                {/* Backup Card */}
                <Card className="border-green-500/20 hover:border-green-500/40 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-600">
                            <Download className="w-5 h-5" />
                            نسخة احتياطية
                        </CardTitle>
                        <CardDescription>
                            تصدير جميع البيانات إلى ملف JSON
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            onClick={handleCreateBackup}
                            disabled={isProcessing}
                            className="w-full bg-green-600 hover:bg-green-700"
                        >
                            {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin ml-2" />
                            ) : (
                                <FileJson className="w-4 h-4 ml-2" />
                            )}
                            إنشاء نسخة احتياطية
                        </Button>
                    </CardContent>
                </Card>

                {/* Restore Card */}
                <Card className="border-blue-500/20 hover:border-blue-500/40 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-blue-600">
                            <Upload className="w-5 h-5" />
                            استعادة البيانات
                        </CardTitle>
                        <CardDescription>
                            استيراد نسخة احتياطية سابقة
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Label htmlFor="backup-file" className="cursor-pointer">
                            <div className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-blue-500/30 rounded-lg hover:bg-blue-500/5 transition-colors">
                                <Upload className="w-4 h-4 text-blue-600" />
                                <span className="text-blue-600">اختر ملف النسخة</span>
                            </div>
                        </Label>
                        <Input
                            id="backup-file"
                            type="file"
                            accept=".json"
                            onChange={handleFileUpload}
                            disabled={isProcessing}
                            className="hidden"
                        />
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                            ملفات .json فقط
                        </p>
                    </CardContent>
                </Card>

                {/* Factory Reset Card */}
                <Card className="border-red-500/20 hover:border-red-500/40 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600">
                            <Trash2 className="w-5 h-5" />
                            إعادة ضبط المصنع
                        </CardTitle>
                        <CardDescription>
                            حذف جميع البيانات نهائياً
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                            <DialogTrigger asChild>
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    disabled={isProcessing}
                                >
                                    <RotateCcw className="w-4 h-4 ml-2" />
                                    إعادة ضبط المصنع
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-red-600">
                                        <AlertTriangle className="w-5 h-5" />
                                        تحذير خطير!
                                    </DialogTitle>
                                    <DialogDescription>
                                        هذا الإجراء سيحذف جميع البيانات في النظام بشكل نهائي ولا يمكن التراجع عنه.
                                    </DialogDescription>
                                </DialogHeader>

                                {resetStep === 1 && (
                                    <div className="space-y-4">
                                        <Alert variant="destructive">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertTitle>تنبيه هام</AlertTitle>
                                            <AlertDescription>
                                                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                                                    <li>سيتم حذف جميع المواد الخام والمنتجات</li>
                                                    <li>سيتم حذف جميع الفواتير والمعاملات المالية</li>
                                                    <li>سيتم حذف جميع العملاء والموردين</li>
                                                    <li>سيتم حذف جميع أوامر الإنتاج والتعبئة</li>
                                                </ul>
                                            </AlertDescription>
                                        </Alert>
                                        <Button
                                            variant="destructive"
                                            className="w-full"
                                            onClick={() => setResetStep(2)}
                                        >
                                            أفهم المخاطر، استمر
                                        </Button>
                                    </div>
                                )}

                                {resetStep === 2 && (
                                    <div className="space-y-4">
                                        <p className="text-sm">
                                            للتأكيد، اكتب <strong className="text-red-600">FACTORY_RESET</strong> في الحقل أدناه:
                                        </p>
                                        <Input
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            placeholder="اكتب رمز التأكيد"
                                            className="font-mono"
                                        />
                                        <DialogFooter className="gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setResetStep(1);
                                                    setConfirmText("");
                                                    setResetDialogOpen(false);
                                                }}
                                            >
                                                إلغاء
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                onClick={handleFactoryReset}
                                                disabled={confirmText !== "FACTORY_RESET"}
                                            >
                                                تأكيد الحذف النهائي
                                            </Button>
                                        </DialogFooter>
                                    </div>
                                )}
                            </DialogContent>
                        </Dialog>
                    </CardContent>
                </Card>
            </div>

            {/* Info Alert */}
            <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>نصيحة</AlertTitle>
                <AlertDescription>
                    يُنصح بإنشاء نسخة احتياطية بشكل دوري وحفظها في مكان آمن خارج الجهاز.
                </AlertDescription>
            </Alert>
        </div>
    );
}
