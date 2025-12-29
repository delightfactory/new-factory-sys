import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Archive,
    FileText,
    Plus,
    Menu,
    ShoppingBag,
    Receipt,
    Factory,
    Package,
    X,
    Package2,
    Beaker,
    Box,
} from "lucide-react";

interface BottomNavProps {
    onOpenSidebar: () => void;
}

// FAB Menu Items
const fabMenuItems = [
    { icon: ShoppingBag, label: "فاتورة بيع", path: "/commercial/selling?action=create", color: "bg-emerald-500 dark:bg-emerald-600" },
    { icon: FileText, label: "فاتورة شراء", path: "/commercial/buying?action=create", color: "bg-amber-500 dark:bg-amber-600" },
    { icon: Receipt, label: "تحصيل جديد", path: "/commercial/payments", color: "bg-blue-500 dark:bg-blue-600" },
    { icon: Factory, label: "أمر إنتاج", path: "/production/orders?action=create", color: "bg-orange-500 dark:bg-orange-600" },
    { icon: Package, label: "أمر تعبئة", path: "/packaging/orders?action=create", color: "bg-purple-500 dark:bg-purple-600" },
];

// Inventory Submenu Items
const inventoryItems = [
    { icon: Package, label: "مواد خام", path: "/inventory/raw-materials", color: "bg-amber-500 dark:bg-amber-600" },
    { icon: Box, label: "مواد تعبئة", path: "/inventory/packaging", color: "bg-cyan-500 dark:bg-cyan-600" },
    { icon: Beaker, label: "نصف مصنع", path: "/inventory/semi-finished", color: "bg-indigo-500 dark:bg-indigo-600" },
    { icon: Package2, label: "منتجات نهائية", path: "/inventory/finished", color: "bg-green-500 dark:bg-green-600" },
];

export function BottomNav({ onOpenSidebar }: BottomNavProps) {
    const location = useLocation();
    const [isFabOpen, setIsFabOpen] = useState(false);
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const inventoryLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inventoryTouchStart = useRef<number>(0);

    // Close menus when route changes
    useEffect(() => {
        setIsFabOpen(false);
        setIsInventoryOpen(false);
    }, [location.pathname]);

    // Close menus on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsFabOpen(false);
                setIsInventoryOpen(false);
            }
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, []);

    // Long press handlers for inventory
    const handleInventoryTouchStart = useCallback(() => {
        inventoryTouchStart.current = Date.now();
        inventoryLongPressTimer.current = setTimeout(() => {
            setIsInventoryOpen(true);
            setIsFabOpen(false);
        }, 500);
    }, []);

    const handleInventoryTouchEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (inventoryLongPressTimer.current) {
            clearTimeout(inventoryLongPressTimer.current);
        }
        const touchDuration = Date.now() - inventoryTouchStart.current;
        if (touchDuration < 500 && !isInventoryOpen) {
            // Let the Link handle navigation
        } else {
            e.preventDefault();
        }
    }, [isInventoryOpen]);

    const handleInventoryTouchCancel = useCallback(() => {
        if (inventoryLongPressTimer.current) {
            clearTimeout(inventoryLongPressTimer.current);
        }
    }, []);

    const isActive = (path: string) => {
        if (path === "/") return location.pathname === "/";
        return location.pathname.startsWith(path);
    };

    const closeAllMenus = () => {
        setIsFabOpen(false);
        setIsInventoryOpen(false);
    };

    return (
        <>
            {/* Overlay */}
            {(isFabOpen || isInventoryOpen) && (
                <div
                    className="fixed inset-0 bg-black/25 dark:bg-black/40 z-[60] md:hidden"
                    onClick={closeAllMenus}
                />
            )}

            {/* FAB Menu - Centered dropdown */}
            <div
                className={cn(
                    "fixed z-[70] md:hidden",
                    "bottom-[88px] left-1/2 -translate-x-1/2",
                    "transition-all duration-300 ease-out origin-bottom",
                    isFabOpen
                        ? "opacity-100 scale-100 translate-y-0"
                        : "opacity-0 scale-90 translate-y-4 pointer-events-none"
                )}
            >
                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl dark:shadow-black/50 border border-gray-100 dark:border-slate-700 p-3 min-w-[220px]">
                    <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 font-semibold">
                        إنشاء جديد
                    </div>
                    {fabMenuItems.map((item, index) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={closeAllMenus}
                            className={cn(
                                "flex items-center gap-3 px-3 py-3 rounded-2xl",
                                "transition-all duration-200",
                                "hover:bg-gray-50 dark:hover:bg-slate-700/50",
                                "active:scale-[0.98] active:bg-gray-100 dark:active:bg-slate-700"
                            )}
                            style={{
                                transitionDelay: `${index * 30}ms`,
                            }}
                        >
                            <div className={cn("p-2.5 rounded-xl shadow-sm", item.color)}>
                                <item.icon className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-medium text-sm text-gray-700 dark:text-gray-200">{item.label}</span>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Inventory Submenu - Positioned above Inventory button (4th item from left = ~75% from left) */}
            <div
                className={cn(
                    "fixed z-[70] md:hidden",
                    "bottom-[88px]",
                    "transition-all duration-300 ease-out origin-bottom",
                    isInventoryOpen
                        ? "opacity-100 scale-100 translate-y-0"
                        : "opacity-0 scale-90 translate-y-4 pointer-events-none"
                )}
                style={{ right: 'calc(50% - 90px)', transform: isInventoryOpen ? 'translateX(50%)' : 'translateX(50%) scale(0.9)' }}
            >
                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl dark:shadow-black/50 border border-gray-100 dark:border-slate-700 p-3 min-w-[200px]">
                    <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 font-semibold">
                        أقسام المخزون
                    </div>
                    {inventoryItems.map((item, index) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={closeAllMenus}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-2xl",
                                "transition-all duration-200",
                                "hover:bg-gray-50 dark:hover:bg-slate-700/50",
                                "active:scale-[0.98]",
                                isActive(item.path) && "bg-primary/10 dark:bg-primary/20"
                            )}
                            style={{
                                transitionDelay: `${index * 30}ms`,
                            }}
                        >
                            <div className={cn("p-2 rounded-xl shadow-sm", item.color)}>
                                <item.icon className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="font-medium text-sm text-gray-700 dark:text-gray-200">{item.label}</span>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Bottom Navigation Bar - Rounded corners, smooth design */}
            <nav
                className={cn(
                    "fixed bottom-0 left-0 right-0 z-[100] md:hidden",
                    "px-3 pb-[env(safe-area-inset-bottom)]"
                )}
            >
                <div
                    className={cn(
                        "bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl",
                        "rounded-t-3xl",
                        "border-t border-x border-gray-200/50 dark:border-slate-700/50",
                        "shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.4)]"
                    )}
                >
                    <div className="flex items-center justify-around h-[68px] px-2 max-w-lg mx-auto">
                        {/* Menu Button */}
                        <button
                            onClick={() => {
                                closeAllMenus();
                                onOpenSidebar();
                            }}
                            className={cn(
                                "flex flex-col items-center justify-center w-14 h-14",
                                "rounded-2xl transition-all duration-200",
                                "text-gray-500 dark:text-gray-400",
                                "hover:bg-gray-100/80 dark:hover:bg-slate-800/80",
                                "active:scale-95"
                            )}
                        >
                            <Menu className="w-5 h-5" />
                            <span className="text-[10px] mt-1 font-medium">القائمة</span>
                        </button>

                        {/* Home Button */}
                        <Link
                            to="/"
                            onClick={closeAllMenus}
                            className={cn(
                                "flex flex-col items-center justify-center w-14 h-14",
                                "rounded-2xl transition-all duration-200",
                                "active:scale-95",
                                isActive("/") && !isActive("/inventory") && !isActive("/reports")
                                    ? "text-primary bg-primary/10 dark:bg-primary/15"
                                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-slate-800/80"
                            )}
                        >
                            <LayoutDashboard className="w-5 h-5" />
                            <span className="text-[10px] mt-1 font-medium">الرئيسية</span>
                        </Link>

                        {/* FAB - New Action Button (Center) - Improved contrast */}
                        <button
                            onClick={() => {
                                setIsFabOpen(!isFabOpen);
                                setIsInventoryOpen(false);
                            }}
                            className={cn(
                                "flex items-center justify-center w-[56px] h-[56px] -mt-4",
                                "rounded-2xl transition-all duration-300",
                                "active:scale-90",
                                isFabOpen
                                    ? "bg-gray-800 dark:bg-white rotate-45 shadow-xl"
                                    : "bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 shadow-xl shadow-blue-500/40 dark:shadow-blue-400/30"
                            )}
                        >
                            {isFabOpen ? (
                                <X className="w-6 h-6 text-white dark:text-gray-900" />
                            ) : (
                                <Plus className="w-6 h-6 text-white" />
                            )}
                        </button>

                        {/* Inventory Button (with long-press) */}
                        <Link
                            to="/inventory/raw-materials"
                            onTouchStart={handleInventoryTouchStart}
                            onTouchEnd={handleInventoryTouchEnd}
                            onTouchCancel={handleInventoryTouchCancel}
                            onMouseDown={handleInventoryTouchStart}
                            onMouseUp={handleInventoryTouchEnd}
                            onMouseLeave={handleInventoryTouchCancel}
                            onClick={(e) => {
                                if (isInventoryOpen) {
                                    e.preventDefault();
                                } else {
                                    closeAllMenus();
                                }
                            }}
                            className={cn(
                                "flex flex-col items-center justify-center w-14 h-14",
                                "rounded-2xl transition-all duration-200 select-none",
                                "active:scale-95",
                                isActive("/inventory")
                                    ? "text-primary bg-primary/10 dark:bg-primary/15"
                                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-slate-800/80"
                            )}
                        >
                            <Archive className="w-5 h-5" />
                            <span className="text-[10px] mt-1 font-medium">المخزون</span>
                        </Link>

                        {/* Reports Button */}
                        <Link
                            to="/reports"
                            onClick={closeAllMenus}
                            className={cn(
                                "flex flex-col items-center justify-center w-14 h-14",
                                "rounded-2xl transition-all duration-200",
                                "active:scale-95",
                                isActive("/reports")
                                    ? "text-primary bg-primary/10 dark:bg-primary/15"
                                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-slate-800/80"
                            )}
                        >
                            <FileText className="w-5 h-5" />
                            <span className="text-[10px] mt-1 font-medium">التقارير</span>
                        </Link>
                    </div>
                </div>
            </nav>
        </>
    );
}
