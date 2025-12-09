
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { session } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (session) {
            navigate("/", { replace: true });
        }
    }, [session, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                toast.error("خطأ في تسجيل الدخول", {
                    description: error.message === "Invalid login credentials" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : error.message
                });
            } else {
                toast.success("تم تسجيل الدخول بنجاح");
                navigate("/");
            }
        } catch (err) {
            toast.error("حدث خطأ غير متوقع");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4" dir="rtl">
            <Card className="w-full max-w-md shadow-lg border-primary/20">
                <CardHeader className="text-center space-y-2">
                    <CardTitle className="text-3xl font-bold text-primary">المصنع الذكي</CardTitle>
                    <CardDescription>تسجيل الدخول للنظام</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="email">البريد الإلكتروني</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="name@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="h-11 text-right"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">كلمة المرور</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="h-11 text-right"
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full h-11 text-lg"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                    جاري التسجيل...
                                </>
                            ) : (
                                "دخول"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
