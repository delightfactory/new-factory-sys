import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDocumentExitGuard } from './use-document-exit-guard';
import { useConfirmation } from './use-confirmation';
import { isDefinitiveCommandFailure } from '@/platform/data/command-failure';

interface LoadedRecipe<T> { values: T; hasRecipe: boolean; legacy?: boolean }
interface Options<T> {
    dirty: boolean;
    reset: (values: T) => void;
    load: (id: number) => Promise<LoadedRecipe<T>>;
    save: (values: T, id: number | null, overrideCost: boolean) => Promise<unknown>;
    afterSave: () => void;
    isEmpty: (values: T) => boolean;
    successMessage?: string;
    rejectedMessage?: string;
}

// Each opening owns its reads. An uncertain write retains the exact submitted
// values and callback until its result is confirmed; inputs cannot change it.
export function useRecipeWorkspace<T>(options: Options<T>) {
    const [open, setOpen] = useState(false);
    const [id, setId] = useState<number | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('ready');
    const [saving, setSaving] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [overrideCost, setOverrideCost] = useState(false);
    const [legacy, setLegacy] = useState(false);
    const generation = useRef(0), busy = useRef(false), originalRecipe = useRef(false);
    const retry = useRef<(() => Promise<unknown>) | null>(null);
    const exit = useDocumentExitGuard(open && state === 'ready' && (options.dirty || overrideCost || uncertain), saving || uncertain);
    const confirmation = useConfirmation();
    useEffect(() => () => { generation.current++; }, []);

    function begin(nextId: number | null) {
        generation.current++;
        setId(nextId); setOpen(true); setUncertain(false); setOverrideCost(false); setLegacy(false);
        retry.current = null; originalRecipe.current = false; exit.protect();
        return generation.current;
    }
    async function edit(nextId: number) {
        if (busy.current || uncertain) return;
        const entry = begin(nextId);
        setState('loading');
        try {
            const loaded = await options.load(nextId);
            if (entry !== generation.current) return;
            options.reset(loaded.values); originalRecipe.current = loaded.hasRecipe;
            setLegacy(!!loaded.legacy); setState('ready');
        } catch {
            if (entry === generation.current) setState('error');
        }
    }
    function create(values: T) {
        if (busy.current || uncertain) return;
        const entry = begin(null);
        options.reset(values); setState('ready');
        return entry;
    }
    async function close() {
        if (busy.current || uncertain || !(await exit.confirmDiscard())) return;
        generation.current++; setOpen(false);
    }
    async function send() {
        if (busy.current || !retry.current) return;
        busy.current = true; setSaving(true);
        try {
            await retry.current();
            retry.current = null; setUncertain(false); generation.current++;
            exit.permitExit(); setOpen(false); options.afterSave();
            toast.success(options.successMessage ?? 'تم حفظ المنتج والوصفة');
        } catch (error) {
            const definitive = isDefinitiveCommandFailure(error, uncertain);
            setUncertain(!definitive);
            if (definitive) retry.current = null;
            const databaseCode = error instanceof Error && 'databaseCode' in error ? error.databaseCode : undefined;
            toast.error(databaseCode === '23505' ? 'الكود مستخدم بالفعل؛ اختر كودًا آخر. لم يُحفظ التعديل.' :
                definitive ? options.rejectedMessage ?? 'لم يُحفظ التعديل. راجع المكونات والكميات والصلاحيات ثم أعد المحاولة.' :
                    error instanceof Error ? error.message : 'تعذر تأكيد الحفظ. أعد الحفظ بنفس البيانات.');
        } finally { busy.current = false; setSaving(false); }
    }
    async function submit(values: T) {
        if (busy.current || uncertain || state !== 'ready') return;
        // Reserve before awaiting confirmation to prevent duplicate submissions.
        busy.current = true; setSaving(true);
        const snapshot = structuredClone(values), snapshotId = id, cost = overrideCost;
        const save = options.save;
        const accepted = !originalRecipe.current || !options.isEmpty(snapshot) || await confirmation.ask({
            title: 'حذف كل مكونات الوصفة؟',
            description: 'ستصبح الوصفة بلا مكونات. الأوامر الجديدة لن تستهلك هذه المواد. راجع التغيير قبل الحفظ.',
            acceptLabel: 'حفظ الوصفة الفارغة',
        });
        busy.current = false; setSaving(false);
        if (!accepted) return;
        retry.current = () => save(snapshot, snapshotId, cost);
        await send();
    }
    return { open, id, state, saving, uncertain, overrideCost, setOverrideCost, legacy,
        locked: saving || uncertain || state !== 'ready', create, edit, close, submit, retrySave: send,
        currentGeneration: () => generation.current,
        confirmations: [exit.confirmation, confirmation.confirmation],
    };
}
