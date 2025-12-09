
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { type Profile, type AppRole } from "@/types";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, Ban, CheckCircle, UserCog, Trash2, Plus, PenSquare } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

export default function UsersManager() {
    const { isAdmin } = useAuth();
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false); // For Edit User
    const [isAddUserOpen, setIsAddUserOpen] = useState(false); // For Add User

    // Edit State
    const [editName, setEditName] = useState("");
    const [editRole, setEditRole] = useState<AppRole>('viewer');
    const [resetPassword, setResetPassword] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Add User State
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserName, setNewUserName] = useState("");
    const [newUserRole, setNewUserRole] = useState<AppRole>('viewer');
    const [isAddingUser, setIsAddingUser] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data as Profile[]);
        } catch (error) {
            console.error("Error fetching users:", error);
            toast.error("فشل تحميل المستخدمين");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;
        setIsSaving(true);
        
        try {
            const promises = [];

            // 1. Update Name if changed
            if (editName !== selectedUser.full_name) {
                promises.push(supabase.rpc('update_user_details_by_admin', {
                    target_user_id: selectedUser.id,
                    new_name: editName
                }));
            }

            // 2. Update Role if changed
            if (editRole !== selectedUser.role) {
                promises.push(supabase.rpc('update_user_role', {
                    target_user_id: selectedUser.id,
                    new_role: editRole
                }));
            }

            // 3. Reset Password if provided
            if (resetPassword && resetPassword.length >= 6) {
                promises.push(supabase.rpc('reset_user_password_by_admin', {
                    target_user_id: selectedUser.id,
                    new_password: resetPassword
                }));
            }

            if (promises.length === 0) {
                toast.info("لم يتم إجراء أي تغييرات");
                setIsDialogOpen(false);
                setIsSaving(false);
                return;
            }

            const results = await Promise.all(promises);
            const errors = results.filter(r => r.error);

            if (errors.length > 0) {
                console.error(errors);
                throw new Error("فشل تحديث بعض البيانات");
            }

            toast.success("تم تحديث بيانات المستخدم بنجاح");
            setIsDialogOpen(false);
            setResetPassword(""); // Clear password field
            fetchUsers();
        } catch (error) {
            console.error(error);
            toast.error("حدث خطأ أثناء التحديث");
        } finally {
            setIsSaving(false);
        }
    };

    const toggleStatus = async (user: Profile) => {
        try {
            const { error } = await supabase.rpc('toggle_user_active', {
                target_user_id: user.id,
                status: !user.is_active
            });

            if (error) throw error;

            toast.success(user.is_active ? "تم إيقاف المستخدم" : "تم تفعيل المستخدم");
            fetchUsers();
        } catch (error) {
            console.error(error);
            toast.error("حدث خطأ");
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAddingUser(true);

        try {
            const { error } = await supabase.rpc('create_user_by_admin', {
                new_email: newUserEmail,
                new_password: newUserPassword,
                new_name: newUserName,
                new_role: newUserRole
            });

            if (error) throw error;

            toast.success("تم إنشاء المستخدم بنجاح");
            setIsAddUserOpen(false);
            // Reset form
            setNewUserEmail("");
            setNewUserPassword("");
            setNewUserName("");
            setNewUserRole('viewer');
            fetchUsers();
        } catch (error: any) {
            console.error(error);
            toast.error("فشل إنشاء المستخدم: " + (error.message || ""));
        } finally {
            setIsAddingUser(false);
        }
    };

    const handleDeleteUser = async (user: Profile) => {
        try {
            const { error } = await supabase.rpc('delete_user_by_admin', {
                target_user_id: user.id
            });

            if (error) throw error;

            toast.success("تم حذف المستخدم بنجاح");
            fetchUsers();
        } catch (error: any) {
            console.error(error);
            toast.error("فشل حذف المستخدم: " + (error.message || ""));
        }
    };

    if (!isAdmin) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
                <Shield className="h-20 w-20 text-muted-foreground/50" />
                <h2 className="text-2xl font-bold">غير مصرح لك بالوصول</h2>
                <p className="text-muted-foreground">هذه الصفحة خاصة بمديري النظام فقط.</p>
            </div>
        );
    }

    const getRoleBadge = (role: AppRole) => {
        const styles: Record<AppRole, string> = {
            admin: "bg-red-500 hover:bg-red-600",
            manager: "bg-orange-500 hover:bg-orange-600",
            accountant: "bg-blue-500 hover:bg-blue-600",
            inventory_officer: "bg-green-500 hover:bg-green-600",
            production_officer: "bg-purple-500 hover:bg-purple-600",
            viewer: "bg-slate-500 hover:bg-slate-600",
        };

        const labels: Record<AppRole, string> = {
            admin: "مدير نظام",
            manager: "مدير عام",
            accountant: "محاسب",
            inventory_officer: "مسؤول مخازن",
            production_officer: "مسؤول إنتاج",
            viewer: "مستخدم",
        };

        return <Badge className={styles[role]}>{labels[role]}</Badge>;
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="إدارة المستخدمين"
                icon={UserCog}
                description="إدارة حسابات وصلاحيات مستخدمي النظام"
                actions={
                    <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2">
                                <Plus className="w-4 h-4" /> إضافة مستخدم جديد
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>إضافة مستخدم جديد</DialogTitle>
                                <DialogDescription>
                                    أدخل بيانات المستخدم الجديد. سيتمكن من تسجيل الدخول فوراً.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleAddUser} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>الاسم الكامل</Label>
                                    <Input 
                                        required 
                                        value={newUserName} 
                                        onChange={e => setNewUserName(e.target.value)} 
                                        placeholder="مثال: أحمد محمد"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>البريد الإلكتروني</Label>
                                    <Input 
                                        required 
                                        type="email" 
                                        value={newUserEmail} 
                                        onChange={e => setNewUserEmail(e.target.value)}
                                        placeholder="name@example.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>كلمة المرور</Label>
                                    <Input 
                                        required 
                                        type="password"
                                        minLength={6}
                                        value={newUserPassword} 
                                        onChange={e => setNewUserPassword(e.target.value)}
                                        placeholder="******"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>الصلاحية</Label>
                                    <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">مدير نظام (Admin)</SelectItem>
                                            <SelectItem value="manager">مدير عام (Manager)</SelectItem>
                                            <SelectItem value="accountant">محاسب (Accountant)</SelectItem>
                                            <SelectItem value="inventory_officer">مسؤول مخازن</SelectItem>
                                            <SelectItem value="production_officer">مسؤول إنتاج</SelectItem>
                                            <SelectItem value="viewer">مستخدم (Viewer)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setIsAddUserOpen(false)}>إلغاء</Button>
                                    <Button type="submit" disabled={isAddingUser}>
                                        {isAddingUser && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                                        إنشاء المستخدم
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle>قائمة المستخدمين</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-right">الاسم</TableHead>
                                    <TableHead className="text-right">الدور (الصلاحية)</TableHead>
                                    <TableHead className="text-right">الحالة</TableHead>
                                    <TableHead className="text-right">تاريخ التسجيل</TableHead>
                                    <TableHead className="text-right">إجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.full_name || "بدون اسم"}</TableCell>
                                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                                        <TableCell>
                                            {user.is_active ? (
                                                <Badge variant="outline" className="border-green-500 text-green-500 flex w-fit items-center gap-1">
                                                    <CheckCircle className="h-3 w-3" /> نشط
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="border-destructive text-destructive flex w-fit items-center gap-1">
                                                    <Ban className="h-3 w-3" /> محظور
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>{new Date(user.created_at).toLocaleDateString('ar-EG')}</TableCell>
                                        <TableCell className="flex gap-2">
                                            <Dialog open={isDialogOpen && selectedUser?.id === user.id} onOpenChange={(open) => {
                                                setIsDialogOpen(open);
                                                if (open) {
                                                    setSelectedUser(user);
                                                    setEditName(user.full_name || "");
                                                    setEditRole(user.role);
                                                    setResetPassword("");
                                                }
                                            }}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" size="sm" title="تعديل المستخدم">
                                                        <PenSquare className="w-4 h-4" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>تعديل بيانات {user.full_name}</DialogTitle>
                                                        <DialogDescription>
                                                            يمكنك تعديل الاسم، الصلاحية، أو إعادة تعيين كلمة المرور.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <form onSubmit={handleUpdateUser} className="space-y-4 py-4">
                                                        <div className="space-y-2">
                                                            <Label>الاسم الكامل</Label>
                                                            <Input 
                                                                value={editName} 
                                                                onChange={e => setEditName(e.target.value)} 
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>الصلاحية</Label>
                                                            <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                                                                <SelectTrigger>
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="admin">مدير نظام (Admin)</SelectItem>
                                                                    <SelectItem value="manager">مدير عام (Manager)</SelectItem>
                                                                    <SelectItem value="accountant">محاسب (Accountant)</SelectItem>
                                                                    <SelectItem value="inventory_officer">مسؤول مخازن</SelectItem>
                                                                    <SelectItem value="production_officer">مسؤول إنتاج</SelectItem>
                                                                    <SelectItem value="viewer">مستخدم (Viewer)</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-2 pt-2 border-t">
                                                            <Label className="text-destructive">إعادة تعيين كلمة المرور (اختياري)</Label>
                                                            <Input 
                                                                type="password"
                                                                minLength={6}
                                                                placeholder="اتركه فارغاً إذا لم ترد التغيير"
                                                                value={resetPassword} 
                                                                onChange={e => setResetPassword(e.target.value)}
                                                            />
                                                            <p className="text-xs text-muted-foreground">أدخل كلمة مرور جديدة فقط إذا طلب المستخدم ذلك.</p>
                                                        </div>
                                                        <DialogFooter>
                                                            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>إلغاء</Button>
                                                            <Button type="submit" disabled={isSaving}>
                                                                {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                                                                حفظ التغييرات
                                                            </Button>
                                                        </DialogFooter>
                                                    </form>
                                                </DialogContent>
                                            </Dialog>

                                            <Button
                                                variant={user.is_active ? "destructive" : "default"}
                                                size="sm"
                                                onClick={() => toggleStatus(user)}
                                                title={user.is_active ? "حظر المستخدم" : "تفعيل المستخدم"}
                                            >
                                                {user.is_active ? "حظر" : "تفعيل"}
                                            </Button>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" title="حذف نهائي">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>هل أنت متأكد من الحذف؟</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            سيتم حذف حساب المستخدم "{user.full_name}" نهائياً من النظام. لا يمكن التراجع عن هذا الإجراء.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteUser(user)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                            حذف
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
