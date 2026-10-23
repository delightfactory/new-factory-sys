import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BackupService, BACKUP_MAINTENANCE_NOTICE } from "@/services/BackupService";
import type { BackupProgress } from "@/services/BackupService";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Download,
    Upload,
    CheckCircle2,
    Loader2,
    Shield,
    Database,
    FileJson,
    Clock,
    Cloud,
    CloudDownload,
    RefreshCw,
    XCircle
} from "lucide-react";
import { toast } from "sonner";

export default function SystemSettings() {
    const { isAdmin } = useAuth();
    const navigate = useNavigate();

    const [progress, setProgress] = useState<BackupProgress | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState<Record<string, number> | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    // Cloud Backup State
    interface BackupLog {
        id: number;
        filename: string;
        size_bytes: number | null;
        record_count: number | null;
        status: string;
        created_at: string;
    }
    const [cloudBackups, setCloudBackups] = useState<BackupLog[]>([]);
    const [loadingCloud, setLoadingCloud] = useState(false);
    const [cloudError, setCloudError] = useState<string | null>(null);
    const [lastBackup, setLastBackup] = useState<BackupLog | null>(null);
    const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

    // Redirect non-admins
    useEffect(() => {
        if (!isAdmin) {
            navigate("/");
            toast.error("غير مصرح بالوصول");
        }
    }, [isAdmin, navigate]);

    const loadStats = useCallback(async () => {
        setLoadingStats(true);
        try {
            const data = await BackupService.getBackupStats();
            setStats(data);
        } catch (e) {
            console.error("Failed to load stats:", e);
        }
        setLoadingStats(false);
    }, []);

    // Load cloud backups from backup_logs table
    const loadCloudBackups = useCallback(async () => {
        setLoadingCloud(true);
        setCloudError(null);
        try {
            const { data, error } = await supabase
                .from('backup_logs')
                .select('*')
                .eq('status', 'success')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setCloudBackups(data || []);
            setLastBackup(data?.[0] ?? null);
        } catch {
            setCloudBackups([]);
            setLastBackup(null);
            setCloudError('تعذر تحميل سجل الملفات المحفوظة. أعد المحاولة للتحقق من حالته.');
        }
        setLoadingCloud(false);
    }, []);

    useEffect(() => {
        void loadStats();
        void loadCloudBackups();
    }, [loadStats, loadCloudBackups]);

    // Download cloud backup from storage
    const downloadCloudBackup = async (filename: string) => {
        setDownloadingFile(filename);
        try {
            const { data, error } = await supabase.storage
                .from('backups')
                .download(filename);

            if (error) {
                toast.error("فشل تحميل النسخة: " + error.message);
                return;
            }

            // Create download link
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success("تم تحميل النسخة بنجاح");
        } catch (e: unknown) {
            toast.error("تعذر تنزيل الملف: " + (e instanceof Error ? e.message : "حاول مرة أخرى"));
        } finally {
            setDownloadingFile(null);
        }
    };

    const totalRecords = stats ? Object.values(stats).reduce((a, b) => a + b, 0) : 0;

    // === BACKUP ===
    const handleCreateBackup = async () => {
        setIsProcessing(true);
        setProgress(null);

        try {
            await BackupService.downloadBackup((p) => setProgress(p));
            toast.success("تم تنزيل ملف بيانات الأعمال بنجاح");
        } catch (e: unknown) {
            toast.error("تعذر تصدير البيانات: " + (e instanceof Error ? e.message : "حاول مرة أخرى"));
        }

        setIsProcessing(false);
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
                    <p className="text-muted-foreground">تصدير بيانات الأعمال ومتابعة النسخ المحفوظة</p>
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
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-purple-600">
                                <Cloud className="w-5 h-5" />
                                الملفات المحفوظة في السحابة
                            </CardTitle>
                            <CardDescription>
                                سجل الملفات التي أعلن النظام حفظها. ظهور ملف هنا لا يؤكد صلاحية الاستعادة الكاملة.
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadCloudBackups}
                            aria-label="تحديث سجل الملفات المحفوظة"
                            disabled={loadingCloud}
                        >
                            {loadingCloud ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {cloudError && <Alert variant="destructive" role="alert">
                        <AlertTitle>تعذر تحميل سجل الملفات</AlertTitle>
                        <AlertDescription className="space-y-2">
                            <p>{cloudError}</p>
                            <Button variant="outline" onClick={loadCloudBackups} disabled={loadingCloud}>إعادة المحاولة</Button>
                        </AlertDescription>
                    </Alert>}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`flex items-center gap-3 p-3 rounded-lg ${lastBackup ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                            {lastBackup ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                                <XCircle className="w-5 h-5 text-yellow-600" />
                            )}
                            <div>
                                <p className="text-sm font-medium">الحالة</p>
                                <p className="text-xs text-muted-foreground">
                                    {loadingCloud ? 'جارٍ قراءة السجل…' : cloudError ? 'تعذر التحقق' : lastBackup ? 'يوجد ملف محفوظ' : 'لا توجد ملفات محفوظة'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Clock className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">آخر نسخة</p>
                                <p className="text-xs text-muted-foreground">
                                    {cloudError ? 'غير متاح' : lastBackup ? new Date(lastBackup.created_at).toLocaleString('ar-EG') : 'لا يوجد'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Database className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">عدد النسخ</p>
                                <p className="text-xs text-muted-foreground">{cloudError ? 'غير متاح' : `${cloudBackups.length} ملف`}</p>
                            </div>
                        </div>
                    </div>

                    {/* Cloud Backups List */}
                    {cloudBackups.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 px-4 py-2 border-b">
                                <p className="text-sm font-medium">النسخ المحفوظة في السحابة</p>
                            </div>
                            <div className="divide-y max-h-60 overflow-y-auto">
                                {cloudBackups.map((backup) => (
                                    <div key={backup.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                                        <div className="flex items-center gap-3">
                                            <FileJson className="w-4 h-4 text-blue-500" />
                                            <div>
                                                <p className="text-sm font-medium">{backup.filename}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(backup.created_at).toLocaleString('ar-EG')}
                                                    {backup.size_bytes && ` • ${(backup.size_bytes / 1024).toFixed(0)} KB`}
                                                    {backup.record_count && ` • ${backup.record_count} سجل`}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => downloadCloudBackup(backup.filename)}
                                            disabled={downloadingFile === backup.filename}
                                        >
                                            {downloadingFile === backup.filename ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <CloudDownload className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {loadingCloud && cloudBackups.length === 0 && (
                        <div className="flex items-center justify-center py-4 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            جاري تحميل النسخ السحابية...
                        </div>
                    )}

                    {!loadingCloud && !cloudError && cloudBackups.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            لا توجد ملفات محفوظة في هذا السجل حتى الآن.
                        </p>
                    )}
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
            <div className="grid md:grid-cols-2 gap-6">
                {/* Backup Card */}
                <Card className="border-green-500/20 hover:border-green-500/40 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-600">
                            <Download className="w-5 h-5" />
                            تصدير بيانات الأعمال
                        </CardTitle>
                        <CardDescription>
                            تنزيل الجداول التشغيلية المتاحة في ملف JSON للمراجعة والأرشفة. لا يشمل الحسابات والمرفقات وسجلات التنفيذ الداخلية، ولا يُستخدم وحده لاستعادة النظام.
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
                            تنزيل ملف البيانات
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Upload className="w-5 h-5" />
                            استعادة البيانات أثناء الصيانة
                        </CardTitle>
                        <CardDescription id="maintenance-recovery-notice">
                            {BACKUP_MAINTENANCE_NOTICE}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Button disabled variant="outline" className="w-full" aria-describedby="maintenance-recovery-notice">
                            الاستعادة من التطبيق متوقفة
                        </Button>
                        <Button disabled variant="outline" className="w-full" aria-describedby="maintenance-recovery-notice">
                            إعادة ضبط البيانات متوقفة
                        </Button>
                        <p className="text-sm text-muted-foreground">يستمر التشغيل اليومي كما هو. قبل الاستعادة، يوقف مسؤول النظام الكتابة مؤقتًا ويتحقق من النسخة الكاملة وخطة الرجوع.</p>
                    </CardContent>
                </Card>
            </div>

            {/* Info Alert */}
            <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>نصيحة</AlertTitle>
                <AlertDescription>
                    احتفظ بملفات التصدير في مكان آمن. التعافي الكامل يحتاج نسخة متسقة من قاعدة البيانات والحسابات والمرفقات، واختبار استعادة ناجحًا قبل استخدامها.
                </AlertDescription>
            </Alert>
        </div>
    );
}
