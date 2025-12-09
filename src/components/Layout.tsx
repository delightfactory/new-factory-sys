import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    Package,
    Archive,
    Factory,
    Settings,
    ShoppingCart,
    Menu,
    X,
    ChevronDown,
    ChevronLeft,
    Moon,
    Sun,
    ListTodo,
    Users,
    Landmark,
    ShoppingBag,
    RefreshCw,
    DollarSign,
    Wallet,
    TrendingUp,
    LogOut,
    UserCog,
    FileText
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";

interface MenuItemProps {
    icon: any;
    label: string;
    path?: string;
    active?: boolean;
    children?: { label: string; path: string; icon: any }[];
    expanded?: boolean;
    onToggle?: () => void;
    sidebarOpen: boolean;
    onNavigate?: () => void;
}

const SidebarItem = ({ icon: Icon, label, path, active, children, expanded, onToggle, sidebarOpen, onNavigate }: MenuItemProps) => {
    if (children) {
        return (
            <div className="space-y-1">
                <button
                    onClick={onToggle}
                    className={cn(
                        "flex items-center justify-between w-full px-3 py-2 rounded-lg transition-all text-muted-foreground hover:bg-muted hover:text-foreground",
                        active && "text-primary font-medium"
                    )}
                >
                    <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5" />
                        {sidebarOpen && <span>{label}</span>}
                    </div>
                    {sidebarOpen && (
                        expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />
                    )}
                </button>
                {sidebarOpen && expanded && (
                    <div className="mr-6 space-y-1 border-r pr-2">
                        {children.map((child) => (
                            <Link
                                key={child.path}
                                to={child.path}
                                onClick={onNavigate}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all block",
                                    (location.pathname === child.path)
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                            >
                                <child.icon className="w-4 h-4" />
                                <span>{child.label}</span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <Link
            to={path!}
            onClick={onNavigate}
            className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
                active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
            )}
        >
            <Icon className="w-5 h-5" />
            {sidebarOpen && <span>{label}</span>}
        </Link>
    );
};

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Persistent Sidebar State
    const [isOpen, setIsOpen] = useState(() => {
        const saved = localStorage.getItem("sidebarOpen");
        return saved !== null ? JSON.parse(saved) : true;
    });

    const { theme, setTheme } = useTheme();
    const { hasRole, isAdmin, signOut, profile } = useAuth();

    const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

    // Save sidebar state
    useEffect(() => {
        localStorage.setItem("sidebarOpen", JSON.stringify(isOpen));
    }, [isOpen]);

    const toggleMenu = (path: string) => {
        setExpandedMenus(prev => ({ ...prev, [path]: !prev[path] }));
    };

    // Auto-expand based on active route
    useEffect(() => {
        const currentPath = location.pathname;
        const newExpanded: Record<string, boolean> = { ...expandedMenus };
        let hasChanges = false;

        menuItems.forEach(item => {
            if (item.children) {
                // If current path starts with parent path (and isn't just the parent path itself, active child check)
                const isActiveChild = item.children.some(child => currentPath.startsWith(child.path));
                if (isActiveChild && !newExpanded[item.path]) {
                    newExpanded[item.path] = true;
                    hasChanges = true;
                }
            }
        });

        if (hasChanges) {
            setExpandedMenus(newExpanded);
        }
    }, [location.pathname]); // Removed menuItems from dependency to avoid loop, it's memoized anyway but safe practice

    const menuItems = useMemo(() => {
        const items = [
            {
                icon: LayoutDashboard,
                label: "لوحة التحكم",
                path: "/",
                show: true
            },
            {
                icon: Archive,
                label: "المخزون",
                path: "/inventory",
                show: hasRole(['admin', 'manager', 'inventory_officer']),
                children: [
                    { label: "المواد الخام", path: "/inventory/raw-materials", icon: Package },
                    { label: "مواد التعبئة", path: "/inventory/packaging", icon: Package },
                    { label: "نصف مصنع", path: "/inventory/semi-finished", icon: Archive },
                    { label: "منتجات نهائية", path: "/inventory/finished", icon: ShoppingCart },
                    { label: "جرد المخزون", path: "/inventory/stocktaking", icon: ListTodo },
                ]
            },
            {
                icon: Factory,
                label: "الإنتاج",
                path: "/production",
                show: hasRole(['admin', 'manager', 'production_officer']),
                children: [
                    { label: "أوامر التشغيل", path: "/production/orders", icon: Factory },
                ]
            },
            {
                icon: Package,
                label: "التعبئة",
                path: "/packaging",
                show: hasRole(['admin', 'manager', 'production_officer'])
            },
            {
                icon: Users,
                label: "الإدارة التجارية",
                path: "/commercial",
                show: hasRole(['admin', 'manager', 'accountant']),
                children: [
                    { label: "العملاء والموردين", path: "/commercial/parties", icon: Users },
                    { label: "الخزائن والبنوك", path: "/commercial/treasuries", icon: Landmark },
                    { label: "المقبوضات والمدفوعات", path: "/commercial/payments", icon: Landmark },
                    { label: "فواتير الشراء", path: "/commercial/buying", icon: ShoppingCart },
                    { label: "فواتير البيع", path: "/commercial/selling", icon: ShoppingBag },
                    { label: "المرتجعات", path: "/commercial/returns", icon: RefreshCw },
                ]
            },
            {
                icon: DollarSign,
                label: "الإدارة المالية",
                path: "/financial",
                show: hasRole(['admin', 'manager', 'accountant']),
                children: [
                    { label: "المصروفات", path: "/financial/expenses", icon: Wallet },
                    { label: "التقارير المالية (P&L)", path: "/financial/reports", icon: TrendingUp },
                ]
            },
            {
                icon: FileText,
                label: "التقارير والتحليلات",
                path: "/reports",
                show: hasRole(['admin', 'manager', 'accountant', 'production_officer'])
            },
            {
                icon: Settings,
                label: "إعدادات النظام",
                path: "/settings",
                show: isAdmin,
                children: [
                    { label: "إدارة المستخدمين", path: "/settings/users", icon: UserCog },
                ]
            },
        ];
        return items.filter(item => item.show);
    }, [profile]); // Re-calculate when profile changes

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    const handleSignOut = async () => {
        await signOut();
        navigate("/login");
    };

    const SidebarContent = ({ isMobile = false, closeSheet }: { isMobile?: boolean, closeSheet?: () => void }) => (
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto min-h-0">
            {menuItems.map((item) => (
                <SidebarItem
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    path={item.path}
                    sidebarOpen={isMobile ? true : isOpen}
                    active={item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path)}
                    children={item.children}
                    expanded={expandedMenus[item.path]}
                    onToggle={() => toggleMenu(item.path)}
                    onNavigate={closeSheet}
                />
            ))}

            <button
                onClick={handleSignOut}
                className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-all w-full text-red-500 hover:bg-red-50 hover:text-red-600 mt-4",
                )}
            >
                <LogOut className="w-5 h-5" />
                {(isOpen || isMobile) && <span>تسجيل الخروج</span>}
            </button>
        </nav>
    );

    return (
        <div className="flex h-screen w-full bg-background" dir="rtl">
            {/* Desktop Sidebar */}
            <aside
                className={cn(
                    "hidden md:flex h-full border-l bg-card transition-all duration-300 flex-col",
                    isOpen ? "w-64" : "w-16"
                )}
            >
                <div className="p-4 border-b flex items-center justify-between">
                    {isOpen && <h1 className="font-bold text-xl text-primary">المصنع الذكي</h1>}
                    <button onClick={() => setIsOpen(!isOpen)} className="p-1 hover:bg-muted rounded">
                        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>

                {/* User Info (Desktop) */}
                {isOpen && profile && (
                    <div className="p-4 bg-muted/20 border-b">
                        <p className="font-medium text-sm truncate">{profile.full_name || "مستخدم"}</p>
                        <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
                    </div>
                )}

                <SidebarContent />
            </aside>

            {/* Mobile Sidebar & Header */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 border-b bg-card flex items-center justify-between px-4 md:px-8">
                    <div className="flex items-center gap-2 md:hidden">
                        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <Menu className="h-6 w-6" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-[80%] sm:w-[300px] p-0 pt-10 flex flex-col h-full">
                                <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
                                <SheetDescription className="sr-only">قائمة التنقل الرئيسية للتطبيق</SheetDescription>
                                <SidebarContent isMobile={true} closeSheet={() => setIsMobileOpen(false)} />
                            </SheetContent>
                        </Sheet>
                        <h1 className="font-bold text-lg text-primary">المصنع الذكي</h1>
                    </div>
                    <div className="flex-1 md:flex-none"></div>

                    {/* Right Side Header Items */}
                    <div className="flex items-center gap-2">
                        {/* User Info (Mobile Header) */}
                        <div className="hidden md:block text-left mr-4">
                            <span className="text-sm font-medium text-muted-foreground">
                                {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </div>

                        <Button variant="ghost" size="icon" onClick={toggleTheme} title="تغيير المظهر">
                            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                            <span className="sr-only">Toggle theme</span>
                        </Button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50 p-4 md:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
