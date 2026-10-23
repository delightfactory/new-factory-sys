import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../types/index.ts';
export interface AuthState { session: Session | null; generation: number; workspaceEpoch: number }
export type ProfileLoad =
    | { userId: string; generation: number; workspaceEpoch: number; status: 'loading'; profile: null; previousProfile: Profile | null }
    | { userId: string; generation: number; workspaceEpoch: number; status: 'error'; profile: null }
    | { userId: string; generation: number; workspaceEpoch: number; status: 'ready'; profile: Profile };
export function advanceAuthState(previous: AuthState, update: { session: Session | null; event: string }): AuthState {
    const identityChanged = previous.session?.user.id !== update.session?.user.id;
    const recheck = identityChanged || ['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'POLICY_INVALIDATED', 'PROFILE_RECHECK'].includes(update.event);
    return { session: update.session, generation: previous.generation + (recheck ? 1 : 0),
        workspaceEpoch: previous.workspaceEpoch + (identityChanged || update.event === 'SIGNED_OUT' ? 1 : 0) };
}
export function continuityProfile(state: AuthState, load: ProfileLoad | null): Profile | null {
    if (!state.session || !load || load.userId !== state.session.user.id || load.workspaceEpoch !== state.workspaceEpoch || load.status === 'error') return null;
    const profile = load.status === 'ready' ? load.profile : load.previousProfile;
    return profile?.id === state.session.user.id && profile.is_active === true ? profile : null;
}
export function startProfileCheck(identity: { userId: string; generation: number; workspaceEpoch: number }, previous: ProfileLoad | null): ProfileLoad {
    const matches = previous?.userId === identity.userId && previous.workspaceEpoch === identity.workspaceEpoch;
    const candidate = matches && previous.status === 'ready' ? previous.profile : matches && previous.status === 'loading' ? previous.previousProfile : null;
    return { ...identity, status: 'loading', profile: null,
        previousProfile: candidate?.id === identity.userId && candidate.is_active === true ? candidate : null };
}
