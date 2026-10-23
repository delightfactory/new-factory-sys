import { useState, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DocumentEditingService, type EditableDocument } from '@/services/DocumentEditingService';
import InvoiceForm from '@/components/commercial/InvoiceForm';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function EditInvoice() {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { hasRole } = useAuth();
    const [generation, setGeneration] = useState(0);
    const [entry] = useState(() => crypto.randomUUID());
    const opened=useRef<{key:string;document:EditableDocument}|null>(null);
    const sale = location.pathname.includes('/selling/');
    const canEdit = hasRole(['admin', 'manager', 'accountant']);
    const validId = Number.isSafeInteger(Number(id)) && Number(id) > 0;
    const query = useQuery({ queryKey: ['document-editor', sale, id, entry, generation], gcTime: 0,
        queryFn: async () => {const key=String(sale)+':'+id+':'+generation;if(opened.current?.key===key)return opened.current.document;const document=await DocumentEditingService.get(sale?'sales_invoice':'purchase_invoice',Number(id));opened.current={key,document};return document;},
        enabled: canEdit && validId, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
    const detail = `/commercial/${sale ? 'selling' : 'buying'}/${id}`;
    let content: ReactNode;
    if (!canEdit) content = <p role="alert">صلاحيات حسابك لا تسمح بتعديل الفواتير.</p>;
    else if (!validId) content = <p role="alert">رقم الفاتورة غير صحيح.</p>;
    else if (query.isPending) content = <p role="status" className="rounded-lg border bg-card p-6">جارٍ تحميل الفاتورة للتعديل…</p>;
    else if (query.isError) content = <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-card p-4"><p>تعذر تحميل المسودة. تحقق من الاتصال وأعد المحاولة.</p><Button variant="outline" onClick={() => void query.refetch()}>إعادة المحاولة</Button></div>;
    else if (query.data.header.status !== 'draft') content = <div role="alert" className="rounded-lg border bg-card p-4">يمكن تعديل المسودة فقط. هذه الفاتورة {query.data.header.status === 'posted' ? 'معتمدة' : 'ملغاة'}.</div>;
    else content = <InvoiceForm key={`${sale}:${id}:${generation}`} sale={sale} document={query.data}
        onSuccess={() => navigate(detail)} onReload={() => setGeneration(value => value + 1)} />;
    return <div className="space-y-4">
        <PageHeader title={sale ? 'تعديل مسودة فاتورة بيع' : 'تعديل مسودة فاتورة شراء'}
            description="راجع البنود ثم احفظ التعديلات قبل اعتماد الفاتورة."
            actions={<Button variant="outline" onClick={() => navigate(validId ? detail : `/commercial/${sale ? 'selling' : 'buying'}`)}>{validId ? 'العودة للفاتورة' : 'العودة للفواتير'}</Button>} />
        {content}
    </div>;
}
