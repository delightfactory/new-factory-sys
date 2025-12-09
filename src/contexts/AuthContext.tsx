
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { type User, type Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { type Profile, type AppRole } from "@/types";

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: Profile | null;
    isLoading: boolean;
    isAdmin: boolean;
    hasRole: (roles: AppRole[]) => boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Track the last fetched user ID to prevent redundant fetches
    const lastFetchedUserId = useRef<string | null>(null);

    // 1. Handle Auth Session State
    useEffect(() => {
        let mounted = true;

        const getInitialSession = async () => {
            try {
                const { data: { session: initialSession } } = await supabase.auth.getSession();
                if (mounted) {
                    setSession(initialSession);
                    setUser(initialSession?.user ?? null);
                    if (!initialSession) setIsLoading(false); // No user, stop loading
                }
            } catch (error) {
                console.error("AuthContext: Session init error", error);
                if (mounted) setIsLoading(false);
            }
        };

        getInitialSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
            if (mounted) {
                setSession(currentSession);
                setUser(currentSession?.user ?? null);
                if (!currentSession) {
                    setProfile(null);
                    lastFetchedUserId.current = null;
                    setIsLoading(false);
                }
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // 2. Handle Profile Fetching (Decoupled from Auth Events)
    useEffect(() => {
        const userId = user?.id;

        if (!userId) {
            // No user, nothing to fetch. 
            // Either we are already not loading (handled in auth effect) or waiting for auth.
            return;
        }

        // Prevent double fetch for same user
        if (lastFetchedUserId.current === userId) {
            // Already fetched/fetching for this user
            return;
        }

        lastFetchedUserId.current = userId;

        const fetchProfile = async () => {
            try {
                // Timeout promise (10s)
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Profile fetch timeout")), 10000)
                );

                const fetchPromise = supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

                if (error) {
                    console.error("AuthContext: Error fetching profile", error);
                } else {
                    setProfile(data as Profile);
                }
            } catch (err) {
                console.warn("AuthContext: Profile fetch warning", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();

    }, [user?.id]); // Only re-run if user ID changes

    const signOut = async () => {
        await supabase.auth.signOut();
        // State updates will happen via onAuthStateChange
    };

    const isAdmin = profile?.role === 'admin';

    const hasRole = (allowedRoles: AppRole[]) => {
        if (!profile) return false;
        if (profile.role === 'admin') return true;
        return allowedRoles.includes(profile.role);
    };

    return (
        <AuthContext.Provider value={{
            user,
            session,
            profile,
            isLoading,
            isAdmin,
            hasRole,
            signOut
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
