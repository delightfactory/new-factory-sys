import { useEffect, useRef } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { useConfirmation } from './use-confirmation';
import { toast } from 'sonner';

const discard = {
    title: 'تجاهل التعديلات غير المحفوظة؟',
    description: 'ستفقد التعديلات التي أدخلتها في هذا النموذج. يمكنك متابعة التعديل وحفظها أولًا.',
    acceptLabel: 'تجاهل التعديلات',
};

export function useDocumentExitGuard(dirty: boolean, pending: boolean) {
    const permit = useRef(false);
    const wasDirty = useRef(false);
    const navigationPrompt = useRef(false);
    const alive = useRef(true);
    const { ask, confirmation } = useConfirmation();
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        if (dirty && !wasDirty.current) permit.current = false;
        wasDirty.current = dirty;
    }, [dirty]);
    useBeforeUnload(event => { if (dirty || pending) { event.preventDefault(); event.returnValue = ''; } });
    const blocker = useBlocker(() => !permit.current && (dirty || pending));
    useEffect(() => {
        if (blocker.state !== 'blocked') return;
        if (pending) { toast.info('جارٍ الحفظ. انتظر تأكيد النتيجة قبل المغادرة.'); blocker.reset(); return; }
        // A blocked pending operation may settle before this effect runs.
        // With no dirty form left there is nothing to discard.
        if (!dirty) { blocker.proceed(); return; }
        if (navigationPrompt.current) return;
        navigationPrompt.current = true;
        void ask(discard).then(accepted => {
            navigationPrompt.current = false;
            if (!alive.current) return;
            if (accepted) blocker.proceed(); else blocker.reset();
        });
    }, [blocker, dirty, pending, ask]);
    return {
        confirmation,
        confirmReplacement: () => ask({ title: 'تحميل النسخة الأحدث؟',
            description: 'ستُستبدل تعديلات النموذج بالبيانات المحفوظة حاليًا. التعديلات غير المحفوظة ستُفقد.',
            acceptLabel: 'تحميل النسخة الأحدث' }),
        async confirmDiscard() {
            if (pending) return false;
            if (dirty && !(await ask(discard))) return false;
            permit.current = true;
            return true;
        },
        permitExit() { permit.current = true; },
        protect() { permit.current = false; },
    };
}
