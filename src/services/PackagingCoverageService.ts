import { supabase } from '@/integrations/supabase/client';
import { factoryCommand } from './FactoryCommandsService';
import { advanceCoverage } from '@/features/packaging/coverage-intent';

async function assertActor(actor: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== actor) throw Error('سجّل الدخول بنفس حساب محاولة التغطية لتأكيد نتيجتها.');
}
async function getOrder(actor: string, kind: 'production' | 'packaging', id: number) {
    await assertActor(actor);
    const table = kind === 'production' ? 'production_orders' : 'packaging_orders';
    const { data, error } = await supabase.from(table).select('id,code,status').eq('id', id).single();
    if (error || !data) throw Error('تعذر قراءة حالة الأمر. لم نرسل خطوة جديدة؛ أعد المحاولة.');
    return { id: Number(data.id), code: String(data.code), status: String(data.status) };
}
export const PackagingCoverageService = {
    getOrder,
    async advance(actor: string, packagingOrderId: number) {
        return advanceCoverage({ storage: sessionStorage, actor, packagingOrderId,
            send: async (action, payload, requestId) => {
                await assertActor(actor);
                return factoryCommand(action, payload, requestId);
            },
            readOrder: (kind, id) => getOrder(actor, kind, id),
        });
    },
};
