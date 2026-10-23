import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export function AccessNotice({ title, description, retryLabel }: { title: string; description: string; retryLabel: string }) {
    const { signOut } = useAuth();
    const [signingOut, setSigningOut] = useState(false);
    const [error, setError] = useState(false);
    const exit = async () => {
        setError(false);
        setSigningOut(true);
        try { await signOut(); } catch { setError(true); } finally { setSigningOut(false); }
    };
    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 bg-background px-6 text-center" dir="rtl">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
            <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" disabled={signingOut} onClick={() => window.location.reload()}>{retryLabel}</Button>
                <Button disabled={signingOut} onClick={() => void exit()}>{signingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}</Button>
            </div>
            {error && <p role="alert" className="text-destructive">تعذر تسجيل الخروج. تحقق من الاتصال وأعد المحاولة.</p>}
        </div>
    );
}
