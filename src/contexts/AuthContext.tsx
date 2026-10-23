import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { type Profile, type AppRole } from "@/types";
import { parseCacheActor } from '@/platform/pwa/api-cache';
import { installVerifiedCachePolicy } from '@/platform/pwa/verified-policy';
import { resetCacheReadNotice } from '@/platform/pwa/cache-provenance';

import { advanceAuthState, continuityProfile, startProfileCheck, type AuthState, type ProfileLoad } from '@/features/auth/auth-workspace';

interface AuthContextType {
    user: Session["user"] | null;
    session: Session | null;
    profile: Profile | null;
    isLoading: boolean;
    canRetainWorkspace: boolean;
    workspaceEpoch: number;
    authorizationEpoch: number;
    isAdmin: boolean;
    hasRole: (roles: AppRole[]) => boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const WorkspaceContinuityContext = createContext<Profile | null>(null);
const roles: readonly AppRole[] = ["admin", "manager", "accountant", "inventory_officer", "production_officer", "viewer"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [authState, setAuthState] = useState<AuthState>({ session: null, generation: 0, workspaceEpoch: 0 });
    const liveAuth = useRef(authState);
    const lastPolicy = useRef<{ workspaceEpoch: number; role: AppRole; active: boolean } | null>(null);
    const policyChannel = useRef<BroadcastChannel | null>(null);
    const remoteCheckGeneration = useRef(-1);
    const [authorizationEpoch, setAuthorizationEpoch] = useState(0);
    const { session, generation, workspaceEpoch } = authState;
    const [initializing, setInitializing] = useState(true);
    const [profileLoad, setProfileLoad] = useState<ProfileLoad | null>(null);
    const user = session?.user ?? null;
    const userId = user?.id;

    useEffect(() => {
        let mounted = true;
        let authRevision = 0;
        const acceptSession = (next: Session | null, event = "INITIAL_SESSION") => {
            if (!mounted) return;
            const previous = liveAuth.current;
            const updated = advanceAuthState(previous, { session: next, event });
            liveAuth.current = updated;
            if (updated.workspaceEpoch !== previous.workspaceEpoch) resetCacheReadNotice();
            if (event === 'POLICY_INVALIDATED') remoteCheckGeneration.current = updated.generation;
            if (updated.generation !== previous.generation) installVerifiedCachePolicy(null);
            setAuthState(updated);
            // Clear continuity in this transition, including A -> null -> A in one batch.
            setProfileLoad(previous => previous?.userId === next?.user.id ? previous : null);
            setInitializing(false);
        };
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
            authRevision++;
            acceptSession(next, event);
        });
        const initialRevision = authRevision;
        const recheckVisibleProfile = () => {
            if (document.visibilityState === 'visible' && liveAuth.current.session) acceptSession(liveAuth.current.session, 'PROFILE_RECHECK');
        };
        document.addEventListener('visibilitychange', recheckVisibleProfile);
        const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('factory-profile-invalidation-v1');
        policyChannel.current = channel;
        const seenInvalidations = new Set<string>();
        if (channel) channel.onmessage = event => {
            // A message only invalidates: the receiver obtains all permissions from the server.
            const value = event.data;
            if (value?.type === 'profile-invalidated' && typeof value.id === 'string' && value.id.length <= 64 && !seenInvalidations.has(value.id) && typeof value.subject === 'string' && value.subject === liveAuth.current.session?.user.id) {
                seenInvalidations.add(value.id);
                if (seenInvalidations.size > 32) seenInvalidations.delete(seenInvalidations.values().next().value!);
                acceptSession(liveAuth.current.session, 'POLICY_INVALIDATED');
            }
        };
        void supabase.auth.getSession().then(({ data, error }) => {
            // An auth event is newer than this initial snapshot.
            if (!mounted || authRevision !== initialRevision) return;
            acceptSession(error ? null : data.session);
        }).catch(() => {
            if (mounted && authRevision === initialRevision) acceptSession(null);
        });
        return () => { mounted = false; subscription.unsubscribe(); document.removeEventListener('visibilitychange', recheckVisibleProfile); channel?.close(); policyChannel.current = null; installVerifiedCachePolicy(null); };
    }, []);

    useEffect(() => {
        if (!userId) return;
        let active = true;
        const isCurrent = () => active && liveAuth.current.generation === generation && liveAuth.current.workspaceEpoch === workspaceEpoch && liveAuth.current.session?.user.id === userId;
        const fail = () => {
            if (!isCurrent()) return;
            installVerifiedCachePolicy(null);
            setProfileLoad({ userId, generation, workspaceEpoch, status: "error", profile: null });
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
            fail();
        }, 10000);
        setProfileLoad(previous => startProfileCheck({ userId, generation, workspaceEpoch }, previous));
        const fetchProfile = async () => {
            try {
                const { data, error } = await supabase.from("profiles")
                    .select("*").eq("id", userId).abortSignal(controller.signal).single();
                if (!isCurrent() || controller.signal.aborted) return;
                if (error || !data || data.id !== userId || typeof data.is_active !== "boolean" || !roles.includes(data.role)) {
                    fail();
                    return;
                }
                const previous = lastPolicy.current;
                if (previous?.workspaceEpoch === workspaceEpoch && (previous.role !== data.role || previous.active !== data.is_active)) {
                    setAuthorizationEpoch(epoch => epoch + 1);
                    resetCacheReadNotice();
                    if (remoteCheckGeneration.current !== generation) policyChannel.current?.postMessage({ type: 'profile-invalidated', id: crypto.randomUUID(), subject: userId });
                }
                lastPolicy.current = { workspaceEpoch, role: data.role, active: data.is_active };
                const actor = parseCacheActor(`Bearer ${liveAuth.current.session?.access_token}`);
                installVerifiedCachePolicy(actor && data.is_active ? { ...actor, role: data.role } : null);
                setProfileLoad({ userId, generation, workspaceEpoch, status: "ready", profile: data as Profile });
            } catch {
                fail();
            } finally {
                clearTimeout(timeout);
            }
        };
        void fetchProfile();
        return () => { active = false; clearTimeout(timeout); controller.abort(); };
    }, [userId, generation, workspaceEpoch]);

    const profile = profileLoad && profileLoad.userId === userId && profileLoad.generation === generation && profileLoad.status === "ready" ? profileLoad.profile : null;
    const isLoading = initializing || Boolean(userId && (!profileLoad || profileLoad.userId !== userId || profileLoad.generation !== generation || profileLoad.status === "loading"));
    const previousProfile = continuityProfile(authState, profileLoad);
    const canRetainWorkspace = isLoading && !initializing && previousProfile !== null;
    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw new Error("SIGN_OUT_FAILED");
    };
    const isAdmin = profile?.is_active === true && profile.role === "admin";
    const hasRole = (allowedRoles: AppRole[]) => {
        if (!profile?.is_active) return false;
        return profile.role === "admin" || allowedRoles.includes(profile.role);
    };

    return <WorkspaceContinuityContext.Provider value={canRetainWorkspace ? previousProfile : null}>
        <AuthContext.Provider value={{ user, session, profile, isLoading, canRetainWorkspace, workspaceEpoch, authorizationEpoch, isAdmin, hasRole, signOut }}>{children}</AuthContext.Provider>
    </WorkspaceContinuityContext.Provider>;
}

// Preserve the existing provider/hook import API used by the application.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};

// A private presentation snapshot keeps conditional form children mounted while the
// whole workspace is hidden and blocked. It is never an authorization decision;
// the public context and every server write still require fresh verification.
export function AuthWorkspaceBoundary({ children }: { children: React.ReactNode }) {
    const current = useAuth();
    const previousProfile = useContext(WorkspaceContinuityContext);
    const presentation = useMemo<AuthContextType>(() => {
        if (!current.canRetainWorkspace || !previousProfile || current.user?.id !== previousProfile.id) return current;
        return { ...current, profile: previousProfile, isLoading: false,
            isAdmin: previousProfile.role === 'admin',
            hasRole: allowed => previousProfile.role === 'admin' || allowed.includes(previousProfile.role) };
    }, [current, previousProfile]);
    return <AuthContext.Provider value={presentation}>{children}</AuthContext.Provider>;
}
