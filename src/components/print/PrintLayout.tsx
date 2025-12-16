import { format } from 'date-fns';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PrintLayoutProps {
    title: string;
    subtitle?: string;
    partyName?: string;
    partyInfo?: string;
    date?: string;
    children: React.ReactNode;
    showSignatures?: boolean;
    signatureLabels?: string[];
}

/**
 * PrintLayout - Wrapper component for printable documents
 * 
 * Usage:
 * <PrintLayout title="فاتورة بيع" partyName="شركة الامل" date="2024-01-15">
 *   <table>...</table>
 * </PrintLayout>
 */
export function PrintLayout({
    title,
    subtitle,
    partyName,
    partyInfo,
    date,
    children,
    showSignatures = false,
    signatureLabels = ['المستلم', 'المحاسب', 'المدير']
}: PrintLayoutProps) {
    const printDate = date || format(new Date(), 'yyyy-MM-dd');

    return (
        <div className="print-document">
            {/* Print Header - Only visible when printing */}
            <header className="print-header print-only">
                <div className="text-right">
                    <h2 className="text-lg font-bold">ديلايت لمستحضرات التجميل</h2>
                    <p className="text-xs text-muted-foreground">نظام إدارة المصنع</p>
                </div>
                <div className="document-title">
                    <h1>{title}</h1>
                    {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
                </div>
                <div className="company-info">
                    <p>التاريخ: {printDate}</p>
                    {partyName && <p>{partyName}</p>}
                    {partyInfo && <p className="text-xs">{partyInfo}</p>}
                </div>
            </header>

            {/* Main Content */}
            <main className="print-content">
                {children}
            </main>

            {/* Signatures Section */}
            {showSignatures && (
                <div className="print-signatures print-only">
                    {signatureLabels.map((label, index) => (
                        <div key={index} className="print-signature-box">
                            <div className="print-signature-line">{label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Print Footer - Only visible when printing */}
            <footer className="print-footer print-only">
                <p>تم الطباعة بتاريخ {format(new Date(), 'yyyy-MM-dd HH:mm')} | نظام إدارة المصنع</p>
            </footer>
        </div>
    );
}

interface PrintButtonProps {
    label?: string;
    className?: string;
    variant?: 'default' | 'outline' | 'ghost' | 'secondary';
    size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * PrintButton - Consistent print button component
 */
export function PrintButton({
    label = 'طباعة',
    className = '',
    variant = 'outline',
    size = 'sm'
}: PrintButtonProps) {
    const handlePrint = () => {
        window.print();
    };

    return (
        <Button
            variant={variant}
            size={size}
            onClick={handlePrint}
            className={`no-print gap-2 ${className}`}
        >
            <Printer className="h-4 w-4" />
            {label}
        </Button>
    );
}

/**
 * PrintSection - Wrapper for sections that should stay together when printing
 */
export function PrintSection({
    title,
    children,
    className = ''
}: {
    title?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={`print-section print-no-break ${className}`}>
            {title && <h3 className="print-section-title">{title}</h3>}
            {children}
        </section>
    );
}

/**
 * PrintInfoGrid - Two-column grid for displaying info pairs
 */
export function PrintInfoGrid({
    items
}: {
    items: Array<{ label: string; value: string | number | null | undefined }>;
}) {
    return (
        <div className="print-info-grid grid grid-cols-2 gap-4 text-sm mb-4">
            {items.map((item, index) => (
                <div key={index} className="print-info-item flex gap-2">
                    <span className="print-info-label font-semibold text-muted-foreground">{item.label}:</span>
                    <span className="print-info-value">{item.value || '-'}</span>
                </div>
            ))}
        </div>
    );
}
