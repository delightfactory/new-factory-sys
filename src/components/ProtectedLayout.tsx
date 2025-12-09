
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import Layout from "@/components/Layout";

export default function ProtectedLayout() {
    const { session, isLoading, profile } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Optional: Check if user is active (blocked check)
    if (profile && profile.is_active === false) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-background space-y-4">
                <h1 className="text-2xl font-bold text-destructive">تم إيقاف الحساب</h1>
                <p className="text-muted-foreground">برجاء مراجعة مدير النظام.</p>
                <button
                    onClick={() => window.location.reload()}
                    className="text-primary hover:underline"
                >
                    تحديث
                </button>
            </div>
        );
    }

    // Render the main Layout (Sidebar + Content)
    return <Layout />;
}
