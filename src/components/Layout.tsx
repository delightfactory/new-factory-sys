import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    Package,
    Archive,
    Factory,
    Settings,
    ShoppingCart,
    Menu,
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
    FileText,
    Sparkles,
    Database,
    ArrowRightLeft
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { GlobalSearch } from "@/components/ui/global-search";

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
    // Best Practice: No auto-scroll - let user control their view position
    // Best Practice: Minimal, non-distracting animations
    // Best Practice: Clear visual feedback for active/hover states

    if (children) {
        return (
            <div className="space-y-0.5">
                <button
                    onClick={onToggle}
                    className={cn(
                        "relative flex items-center justify-between w-full px-3 py-2.5 rounded-lg transition-colors duration-150",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                >
                    {/* Active Indicator */}
                    {active && (
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-l-full" />
                    )}

                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-1.5 rounded-lg",
                            active ? "bg-primary/20" : "bg-muted/50"
                        )}>
                            <Icon className="w-4 h-4" />
                        </div>
                        {sidebarOpen && <span className="text-sm">{label}</span>}
                    </div>
                    {sidebarOpen && (
                        <ChevronDown className={cn(
                            "w-4 h-4 transition-transform duration-200",
                            expanded ? "rotate-0" : "-rotate-90"
                        )} />
                    )}
                </button>

                {/* Submenu - Simple CSS transition, no JS animation */}
                {sidebarOpen && expanded && (
                    <div className="mr-4 pr-3 border-r border-muted space-y-0.5 py-1 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                        {children.map((child) => (
                            <Link
                                key={child.path}
                                to={child.path}
                                onClick={onNavigate}
                                className={cn(
                                    "flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors duration-150",
                                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                    (location.pathname === child.path)
                                        ? "bg-primary text-primary-foreground font-medium"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                )}
                            >
                                <child.icon className="w-3.5 h-3.5" />
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
                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
        >
            {/* Active Indicator */}
            {active && !children && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary-foreground/30 rounded-l-full" />
            )}

            <div className={cn(
                "p-1.5 rounded-lg",
                active ? "bg-white/20" : "bg-muted/50"
            )}>
                <Icon className="w-4 h-4" />
            </div>
            {sidebarOpen && <span className="text-sm">{label}</span>}
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
    }, [location.pathname]);

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
                    { label: "سجل الحركات", path: "/inventory/movements", icon: ArrowRightLeft },
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
                    { label: "النسخ الاحتياطي", path: "/settings/system", icon: Database },
                ]
            },
        ];
        return items.filter(item => item.show);
    }, [profile]);

    const toggleTheme = () => {
        const effectiveTheme = theme === "system"
            ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
            : theme;

        setTheme(effectiveTheme === "dark" ? "light" : "dark");
    };

    const handleSignOut = async () => {
        await signOut();
        navigate("/login");
    };

    const SidebarContent = ({ isMobile = false, closeSheet }: { isMobile?: boolean, closeSheet?: () => void }) => (
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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

            {/* Divider */}
            <div className="my-4 border-t border-border/50" />

            {/* Sign Out Button */}
            <button
                onClick={handleSignOut}
                className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 w-full group",
                    "text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20"
                )}
            >
                <div className="p-1.5 rounded-lg bg-red-500/10 group-hover:bg-red-500/20 transition-colors">
                    <LogOut className="w-4 h-4" />
                </div>
                {(isOpen || isMobile) && <span className="text-sm font-medium">تسجيل الخروج</span>}
            </button>
        </nav>
    );

    return (
        <div className="flex h-screen w-full bg-background" dir="rtl">
            {/* Desktop Sidebar */}
            <aside
                className={cn(
                    "hidden md:flex h-full border-l transition-all duration-300 flex-col",
                    "bg-gradient-to-b from-card via-card to-card/95",
                    "dark:from-slate-900 dark:via-slate-900 dark:to-slate-950",
                    "shadow-xl shadow-black/5 dark:shadow-black/20",
                    isOpen ? "w-64" : "w-20"
                )}
            >
                {/* Header */}
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                    {isOpen && (
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/30">
                                <Sparkles className="w-5 h-5 text-primary-foreground" />
                            </div>
                            <h1 className="font-bold text-lg bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">
                                DELIGHT FACTORY
                            </h1>
                        </div>
                    )}
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className={cn(
                            "p-2 hover:bg-accent rounded-xl transition-all duration-200",
                            !isOpen && "mx-auto"
                        )}
                    >
                        {isOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>

                {/* User Profile Section */}
                {profile && (
                    <div className={cn(
                        "border-b border-border/50 transition-all duration-300",
                        isOpen ? "p-4" : "p-2"
                    )}>
                        <div className={cn(
                            "flex items-center gap-3",
                            !isOpen && "justify-center"
                        )}>
                            {/* Avatar */}
                            <div className={cn(
                                "rounded-xl bg-gradient-to-br from-primary/20 to-accent flex items-center justify-center font-bold text-primary shrink-0",
                                isOpen ? "w-10 h-10" : "w-9 h-9 text-sm"
                            )}>
                                {profile.full_name?.charAt(0) || "م"}
                            </div>

                            {isOpen && (
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{profile.full_name || "مستخدم"}</p>
                                    <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        {profile.role === 'admin' ? 'مدير النظام' :
                                            profile.role === 'manager' ? 'مدير' :
                                                profile.role === 'accountant' ? 'محاسب' :
                                                    profile.role === 'inventory_officer' ? 'أمين مخزن' :
                                                        profile.role === 'production_officer' ? 'مسؤول إنتاج' : 'مستخدم'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <SidebarContent />

                {/* Footer */}
                {isOpen && (
                    <div className="p-4 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground/60 text-center">
                            نظام إدارة المصانع المتكامل
                        </p>
                    </div>
                )}
            </aside>

            {/* Mobile Sidebar & Header */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 border-b bg-card/95 backdrop-blur-sm flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
                    <div className="flex items-center gap-3 md:hidden">
                        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-xl">
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent
                                side="right"
                                className="w-[85%] sm:w-[320px] p-0 flex flex-col h-full bg-gradient-to-b from-card via-card to-card/95"
                            >
                                <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
                                <SheetDescription className="sr-only">قائمة التنقل الرئيسية للتطبيق</SheetDescription>

                                {/* Mobile Header */}
                                <div className="p-4 border-b border-border/50 flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/30">
                                        <Sparkles className="w-5 h-5 text-primary-foreground" />
                                    </div>
                                    <h1 className="font-bold text-lg bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent">
                                        DELIGHT FACTORY
                                    </h1>
                                </div>

                                {/* Mobile User Profile */}
                                {profile && (
                                    <div className="p-4 border-b border-border/50 bg-accent/30">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent flex items-center justify-center font-bold text-primary text-lg">
                                                {profile.full_name?.charAt(0) || "م"}
                                            </div>
                                            <div>
                                                <p className="font-semibold">{profile.full_name || "مستخدم"}</p>
                                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                    متصل الآن
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <SidebarContent isMobile={true} closeSheet={() => setIsMobileOpen(false)} />
                            </SheetContent>
                        </Sheet>
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-primary/70">
                                <Sparkles className="w-4 h-4 text-primary-foreground" />
                            </div>
                            <h1 className="font-bold text-base">DELIGHT FACTORY</h1>
                        </div>
                    </div>
                    <div className="flex-1 md:flex-none"></div>

                    {/* Right Side Header Items */}
                    <div className="flex items-center gap-2">
                        {/* Global Search */}
                        <GlobalSearch />

                        {/* Date Display */}
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent/50 text-sm text-muted-foreground">
                            <span>📅</span>
                            <span>
                                {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </span>
                        </div>

                        {/* Theme Toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleTheme}
                            title="تغيير المظهر"
                            className="rounded-xl hover:bg-accent"
                        >
                            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                            <span className="sr-only">Toggle theme</span>
                        </Button>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 via-slate-100/50 to-slate-50 dark:from-slate-950 dark:via-slate-900/50 dark:to-slate-950 p-4 md:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
