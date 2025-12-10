import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, Users, FileText, X, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SearchResult {
    id: string;
    type: 'raw_material' | 'packaging' | 'semi_finished' | 'finished' | 'party' | 'invoice';
    name: string;
    code?: string;
    description?: string;
    path: string;
}

const TYPE_LABELS: Record<string, string> = {
    raw_material: 'مادة خام',
    packaging: 'تعبئة',
    semi_finished: 'نصف مصنع',
    finished: 'منتج نهائي',
    party: 'عميل/مورد',
    invoice: 'فاتورة'
};

const TYPE_ICONS: Record<string, typeof Package> = {
    raw_material: Package,
    packaging: Package,
    semi_finished: Package,
    finished: Package,
    party: Users,
    invoice: FileText
};

export function GlobalSearch() {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Keyboard shortcut to open search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Search logic
    useEffect(() => {
        const searchItems = async () => {
            if (query.length < 2) {
                setResults([]);
                return;
            }

            setIsLoading(true);
            const allResults: SearchResult[] = [];

            try {
                // Search raw materials
                const { data: rawMats } = await supabase
                    .from('raw_materials')
                    .select('id, name, code')
                    .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
                    .limit(5);

                rawMats?.forEach(item => allResults.push({
                    id: String(item.id),
                    type: 'raw_material',
                    name: item.name,
                    code: item.code,
                    path: `/inventory/raw-materials/${item.id}`
                }));

                // Search packaging materials
                const { data: packMats } = await supabase
                    .from('packaging_materials')
                    .select('id, name, code')
                    .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
                    .limit(5);

                packMats?.forEach(item => allResults.push({
                    id: String(item.id),
                    type: 'packaging',
                    name: item.name,
                    code: item.code,
                    path: `/inventory/packaging/${item.id}`
                }));

                // Search semi-finished products
                const { data: semiFinished } = await supabase
                    .from('semi_finished_products')
                    .select('id, name, code')
                    .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
                    .limit(5);

                semiFinished?.forEach(item => allResults.push({
                    id: String(item.id),
                    type: 'semi_finished',
                    name: item.name,
                    code: item.code,
                    path: `/inventory/semi-finished/${item.id}`
                }));

                // Search finished products
                const { data: finished } = await supabase
                    .from('finished_products')
                    .select('id, name, code')
                    .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
                    .limit(5);

                finished?.forEach(item => allResults.push({
                    id: String(item.id),
                    type: 'finished',
                    name: item.name,
                    code: item.code,
                    path: `/inventory/finished/${item.id}`
                }));

                // Search parties
                const { data: parties } = await supabase
                    .from('parties')
                    .select('id, name, type')
                    .ilike('name', `%${query}%`)
                    .limit(5);

                parties?.forEach(item => allResults.push({
                    id: item.id,
                    type: 'party',
                    name: item.name,
                    description: item.type === 'customer' ? 'عميل' : 'مورد',
                    path: `/commercial/parties/${item.id}`
                }));

                // Search sales invoices
                try {
                    const { data: salesInvoices } = await supabase
                        .from('sales_invoices')
                        .select('id, invoice_number, total_amount')
                        .ilike('invoice_number', `%${query}%`)
                        .limit(3);

                    salesInvoices?.forEach(item => allResults.push({
                        id: String(item.id),
                        type: 'invoice',
                        name: item.invoice_number || `S-${item.id}`,
                        description: `بيع - ${item.total_amount?.toLocaleString()} ج.م`,
                        path: `/commercial/selling/${item.id}`
                    }));
                } catch {
                    // Sales invoice search failed silently
                }

                // Search purchase invoices
                try {
                    const { data: purchaseInvoices } = await supabase
                        .from('purchase_invoices')
                        .select('id, invoice_number, total_amount')
                        .ilike('invoice_number', `%${query}%`)
                        .limit(3);

                    purchaseInvoices?.forEach(item => allResults.push({
                        id: String(item.id),
                        type: 'invoice',
                        name: item.invoice_number || `P-${item.id}`,
                        description: `شراء - ${item.total_amount?.toLocaleString()} ج.م`,
                        path: `/commercial/buying/${item.id}`
                    }));
                } catch {
                    // Purchase invoice search failed silently
                }

                setResults(allResults.slice(0, 10));
                setSelectedIndex(0);
            } catch (error) {
                console.error('Search error:', error);
            } finally {
                setIsLoading(false);
            }
        };

        const debounce = setTimeout(searchItems, 300);
        return () => clearTimeout(debounce);
    }, [query]);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
        }
    };

    const handleSelect = (result: SearchResult) => {
        navigate(result.path);
        setIsOpen(false);
        setQuery('');
    };

    const handleClose = () => {
        setIsOpen(false);
        setQuery('');
    };

    return (
        <>
            {/* Search Trigger Button */}
            <Button
                variant="outline"
                className="relative h-9 w-9 p-0 xl:h-9 xl:w-60 xl:justify-start xl:px-3"
                onClick={() => setIsOpen(true)}
            >
                <Search className="h-4 w-4 xl:mr-2" />
                <span className="hidden xl:inline-flex">بحث...</span>
                <kbd className="pointer-events-none absolute left-1.5 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 xl:flex">
                    <span className="text-xs">Ctrl</span>K
                </kbd>
            </Button>

            {/* Search Modal */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={handleClose}
                    />

                    {/* Search Container */}
                    <div
                        ref={containerRef}
                        className="relative w-full max-w-lg bg-background rounded-xl shadow-2xl border overflow-hidden"
                    >
                        {/* Input */}
                        <div className="flex items-center border-b px-4">
                            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="ابحث عن صنف، عميل، فاتورة..."
                                className="border-0 focus-visible:ring-0 h-12 text-base"
                            />
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            <Button variant="ghost" size="icon" onClick={handleClose} className="shrink-0">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Results */}
                        {results.length > 0 && (
                            <div className="max-h-80 overflow-y-auto p-2">
                                {results.map((result, index) => {
                                    const Icon = TYPE_ICONS[result.type] || Package;
                                    return (
                                        <button
                                            key={`${result.type}-${result.id}`}
                                            className={cn(
                                                "w-full flex items-center gap-3 p-3 rounded-lg text-right transition-colors",
                                                index === selectedIndex
                                                    ? "bg-primary/10 text-primary"
                                                    : "hover:bg-muted"
                                            )}
                                            onClick={() => handleSelect(result)}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                        >
                                            <div className="p-2 rounded-lg bg-muted">
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate">{result.name}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                    <span>{TYPE_LABELS[result.type]}</span>
                                                    {result.code && <span className="font-mono">#{result.code}</span>}
                                                    {result.description && <span>• {result.description}</span>}
                                                </div>
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* No Results */}
                        {query.length >= 2 && results.length === 0 && !isLoading && (
                            <div className="p-8 text-center text-muted-foreground">
                                <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p>لا توجد نتائج لـ "{query}"</p>
                            </div>
                        )}

                        {/* Hints */}
                        {query.length < 2 && (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                <p>اكتب حرفين على الأقل للبحث</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
