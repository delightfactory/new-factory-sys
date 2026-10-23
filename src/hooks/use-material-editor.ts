import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { InventoryService } from '@/services/InventoryService';
import { useRecipeWorkspace as useItemWorkspace } from '@/hooks/use-recipe-workspace';
import { changedMaterialFields, codeSuggestionCurrent, emptyMaterial, materialLabels, materialPatch, materialValues, type MaterialKind, type MaterialSnapshot, type MaterialValues } from '@/features/inventory/material-editor';

export function useMaterialEditor(kind: MaterialKind) {
    const labels = materialLabels[kind];
    const queryClient = useQueryClient();
    const form = useForm<MaterialValues>({ defaultValues: emptyMaterial() });
    const originalCost = useRef(0), codeRequest = useRef(0);
    const originalValues = useRef(emptyMaterial());
    const [codePending, setCodePending] = useState(false);
    // Reuse the qualified pending-save lifecycle; material editors have no recipe branch.
    const workspace = useItemWorkspace<MaterialSnapshot>({
        dirty: form.formState.isDirty,
        reset: snapshot => { originalCost.current = snapshot.originalCost; originalValues.current = structuredClone(snapshot.values); form.reset(snapshot.values); },
        load: async id => {
            const row = await (kind === 'raw' ? InventoryService.getRawMaterial(id) : InventoryService.getPackagingMaterial(id));
            return { values: { values: materialValues(row), changed: [], originalCost: Number(row.unit_cost) }, hasRecipe: false };
        },
        save: (snapshot, id, explicitCost) => {
            if (id === null) return kind === 'raw' ? InventoryService.createRawMaterial(snapshot.values) : InventoryService.createPackagingMaterial(snapshot.values);
            const patch = materialPatch(snapshot, explicitCost);
            return kind === 'raw' ? InventoryService.updateRawMaterial(id, patch) : InventoryService.updatePackagingMaterial(id, patch);
        },
        afterSave: () => { void queryClient.invalidateQueries(); },
        isEmpty: () => false,
        successMessage: 'تم حفظ بيانات الصنف',
        rejectedMessage: 'لم يُحفظ التعديل. راجع البيانات والصلاحيات ثم أعد المحاولة.',
    });
    async function suggestCode(opening = workspace.currentGeneration()) {
        const request = ++codeRequest.current, previous = form.getValues('code');
        setCodePending(true);
        try {
            const code = await InventoryService.getNextCode(labels.table, labels.prefix);
            if (codeSuggestionCurrent(opening, workspace.currentGeneration(), request, codeRequest.current, previous, form.getValues('code'))) {
                form.setValue('code', code, { shouldDirty: false, shouldValidate: true });
            }
        } catch {
            if (opening === workspace.currentGeneration() && request === codeRequest.current) toast.error('تعذر اقتراح كود. يمكنك إدخاله يدويًا أو إعادة المحاولة.');
        } finally {
            if (opening === workspace.currentGeneration() && request === codeRequest.current) setCodePending(false);
        }
    }
    function create() {
        const opening = workspace.create({ values: emptyMaterial(), changed: [], originalCost: 0 });
        if (opening !== undefined) void suggestCode(opening);
    }
    function edit(id: number) { setCodePending(false); void workspace.edit(id); }
    function submit(values: MaterialValues) {
        const snapshot = { values, changed: changedMaterialFields(values, originalValues.current), originalCost: originalCost.current };
        if (workspace.id !== null && Object.keys(materialPatch(snapshot, workspace.overrideCost)).length === 0) {
            toast.info('لا توجد تغييرات قابلة للحفظ.');
            return;
        }
        // A late code suggestion must not alter a submitted or uncertain snapshot.
        codeRequest.current++;
        setCodePending(false);
        void workspace.submit(snapshot);
    }
    function costChanged(value: number) { workspace.setOverrideCost(Number.isFinite(value) && value !== originalCost.current); }
    return { kind, labels, form, workspace, codePending, suggestCode, create, edit, submit, costChanged };
}
