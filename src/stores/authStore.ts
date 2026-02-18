import { create } from 'zustand';
import { supabase } from '../config/supabase';
import { Profile, UserRole } from '../types';
import { normalizeArea } from '../utils/normalizeArea';
import { syncPushIdentity, logoutPushIdentity } from '../config/onesignal';
import { Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';

type SignUpResult = {
    requiresEmailConfirmation: boolean;
};

type ProfileSeed = {
    name?: string;
    email?: string;
    employeeId?: string | null;
    location?: string | null;
    role?: UserRole;
};

const FALLBACK_CALLBACK_BASE_URL = 'https://babypartinv.pages.dev';

const getCallbackBaseUrl = () => {
    if (Platform.OS !== 'web') return FALLBACK_CALLBACK_BASE_URL;
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    return origin || FALLBACK_CALLBACK_BASE_URL;
};

const normalizeOptionalText = (value?: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const buildProfilePayload = (
    authUser: User,
    seed: ProfileSeed = {},
): Omit<Profile, 'created_at' | 'updated_at' | 'fcm_token'> => {
    const metadata = (authUser.user_metadata || {}) as Record<string, unknown>;
    const seedName = normalizeOptionalText(seed.name);
    const metadataName = typeof metadata.name === 'string' ? normalizeOptionalText(metadata.name) : null;
    const fallbackName = (authUser.email || 'Engineer').split('@')[0];
    const name = seedName || metadataName || fallbackName;

    const seedEmail = normalizeOptionalText(seed.email)?.toLowerCase();
    const userEmail = normalizeOptionalText(authUser.email)?.toLowerCase();
    const email = seedEmail || userEmail;
    if (!email) {
        throw new Error('Email akun tidak ditemukan untuk membuat profil.');
    }

    const metadataRole = metadata.role === 'admin' ? 'admin' : 'engineer';
    const role = seed.role || (metadataRole as UserRole);

    const seedEmployeeId = normalizeOptionalText(seed.employeeId);
    const metadataEmployeeId =
        typeof metadata.employee_id === 'string' ? normalizeOptionalText(metadata.employee_id) : null;
    const employee_id = seedEmployeeId || metadataEmployeeId;

    const seedLocation = normalizeOptionalText(seed.location);
    const metadataLocation =
        typeof metadata.location === 'string' ? normalizeOptionalText(metadata.location) : null;
    const locationValue = seedLocation || metadataLocation;
    const location = locationValue ? normalizeArea(locationValue) : null;

    const metadataIsActive = typeof metadata.is_active === 'boolean' ? metadata.is_active : true;

    return {
        id: authUser.id,
        name,
        email,
        role,
        employee_id,
        location,
        is_active: metadataIsActive,
    };
};

const fetchProfileByUserId = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw error;
    return data;
};

const ensureProfileForUser = async (authUser: User, seed?: ProfileSeed): Promise<Profile> => {
    const existingProfile = await fetchProfileByUserId(authUser.id);
    if (existingProfile) return existingProfile;

    const payload = buildProfilePayload(authUser, seed);
    const { data, error } = await supabase
        .from('profiles')
        .upsert(payload)
        .select('*')
        .single();
    if (error) throw error;
    return data;
};

interface AuthState {
    user: Profile | null;
    session: any | null;
    loading: boolean;
    initialized: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, name: string, employeeId?: string, location?: string) => Promise<SignUpResult>;
    signOut: () => Promise<void>;
    init: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    updateUserPassword: (password: string) => Promise<void>;
    isRecovery: boolean;
}

type AuthSubscription = ReturnType<typeof supabase.auth.onAuthStateChange>['data']['subscription'];

let authSubscription: AuthSubscription | null = null;
let initPromise: Promise<void> | null = null;
let webWakeCleanup: (() => void) | null = null;
let sessionRefreshPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => {
    const syncProfileForSession = async (
        session: any | null,
        seed?: ProfileSeed,
        options?: {
            markInitialized?: boolean;
            clearUserOnError?: boolean;
            adoptSession?: boolean;
        },
    ) => {
        const markInitialized = options?.markInitialized === true;
        const clearUserOnError = options?.clearUserOnError !== false;
        const adoptSession = options?.adoptSession !== false;

        if (!session?.user) {
            set({
                session: null,
                user: null,
                ...(markInitialized ? { initialized: true } : {}),
            });
            return;
        }

        if (adoptSession) {
            set({
                session,
                ...(markInitialized ? { initialized: true } : {}),
            });
        }

        try {
            const profile = await ensureProfileForUser(session.user, seed);
            const currentSessionUserId = get().session?.user?.id;
            if (currentSessionUserId !== session.user.id) return;

            set({
                ...(adoptSession ? { session } : {}),
                user: profile,
                ...(markInitialized ? { initialized: true } : {}),
            });

            void syncPushIdentity(session.user.id, { requestPermission: false }).catch((e) => {
                console.warn('[auth.syncProfileForSession] Auto push identity sync failed:', e);
            });
        } catch (error) {
            console.error('[auth.syncProfileForSession] Failed to sync profile:', error);
            set({
                ...(adoptSession ? { session } : {}),
                ...(clearUserOnError ? { user: null } : {}),
                ...(markInitialized ? { initialized: true } : {}),
            });
        }
    };

    const refreshWebSessionOnWake = async () => {
        if (Platform.OS !== 'web') return;
        if (sessionRefreshPromise) {
            await sessionRefreshPromise;
            return;
        }

        sessionRefreshPromise = (async () => {
            try {
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) throw sessionError;

                const now = Math.floor(Date.now() / 1000);
                const expiresIn = session?.expires_at ? session.expires_at - now : null;
                const needsRefresh = !session || expiresIn === null || expiresIn <= 120;

                if (!needsRefresh) {
                    set({ session });
                    return;
                }

                const { data, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError) {
                    console.warn('[auth.web] Session refresh failed:', refreshError.message);
                    return;
                }

                if (!data.session?.user) return;

                await syncProfileForSession(data.session, undefined, {
                    adoptSession: true,
                    clearUserOnError: false,
                });
            } catch (error) {
                console.error('[auth.web] Failed to recover session:', error);
            }
        })().finally(() => {
            sessionRefreshPromise = null;
        });

        await sessionRefreshPromise;
    };

    const setupAuthSubscription = () => {
        if (authSubscription) return;

        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                set({ isRecovery: true });
            }

            if (!session?.user) {
                // Ignore transient null-session events that can happen on some web runtimes.
                if (event !== 'SIGNED_OUT') {
                    return;
                }
                set({ session: null, user: null });
                return;
            }

            set({ session });

            const currentUserId = get().user?.id;
            const shouldSyncProfile =
                !currentUserId ||
                currentUserId !== session.user.id ||
                event === 'SIGNED_IN' ||
                event === 'INITIAL_SESSION' ||
                event === 'USER_UPDATED';

            if (!shouldSyncProfile) return;

            // Supabase warns against awaiting additional Supabase calls directly in this callback.
            setTimeout(() => {
                void syncProfileForSession(session, undefined, {
                    adoptSession: false,
                    clearUserOnError: false,
                });
            }, 0);
        });

        authSubscription = data.subscription;
    };

    const setupWebWakeListeners = () => {
        if (Platform.OS !== 'web' || webWakeCleanup) return;

        const scope = globalThis as any;
        const doc = scope?.document as Document | undefined;
        const onWake = () => {
            void refreshWebSessionOnWake();
        };
        const onVisibilityChange = () => {
            if (!doc || doc.visibilityState === 'visible') {
                onWake();
            }
        };

        const intervalId = setInterval(onWake, 60000);
        scope?.addEventListener?.('focus', onWake);
        scope?.addEventListener?.('online', onWake);
        doc?.addEventListener?.('visibilitychange', onVisibilityChange);

        webWakeCleanup = () => {
            clearInterval(intervalId);
            scope?.removeEventListener?.('focus', onWake);
            scope?.removeEventListener?.('online', onWake);
            doc?.removeEventListener?.('visibilitychange', onVisibilityChange);
            webWakeCleanup = null;
        };
    };

    return {
        user: null,
        session: null,
        loading: false,
        initialized: false,
        isRecovery: false,

        init: async () => {
            if (get().initialized) {
                setupAuthSubscription();
                setupWebWakeListeners();
                return;
            }

            if (initPromise) {
                await initPromise;
                return;
            }

            initPromise = (async () => {
                try {
                    const { data: { session }, error } = await supabase.auth.getSession();
                    if (error) throw error;

                    await syncProfileForSession(session, undefined, {
                        markInitialized: true,
                        adoptSession: true,
                    });
                } catch (error) {
                    console.error('[auth.init] Failed to initialize auth session:', error);
                    set({ session: null, user: null, initialized: true });
                }

                setupAuthSubscription();
                setupWebWakeListeners();
            })().finally(() => {
                initPromise = null;
            });

            await initPromise;
        },

        refreshProfile: async () => {
            const session = get().session;
            if (!session?.user) return;

            await syncProfileForSession(session, undefined, {
                adoptSession: false,
                clearUserOnError: false,
            });
        },

        signIn: async (email, password) => {
            set({ loading: true });
            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email.trim().toLowerCase(),
                    password,
                });
                if (error) throw error;
                if (!data.session || !data.user) {
                    throw new Error('Session login tidak tersedia.');
                }

                await syncProfileForSession(data.session, undefined, {
                    adoptSession: true,
                    clearUserOnError: true,
                });
                set({ loading: false });
            } catch (e) {
                set({ loading: false });
                throw e;
            }
        },

        signUp: async (email, password, name, employeeId, location) => {
            set({ loading: true });
            try {
                const normalizedEmail = email.trim().toLowerCase();
                const normalizedName = name.trim();
                const normalizedEmployeeId = normalizeOptionalText(employeeId);
                const normalizedLocation = normalizeOptionalText(location);
                const areaGroup = normalizedLocation ? normalizeArea(normalizedLocation) : null;
                const callbackBaseUrl = getCallbackBaseUrl();
                const { data, error } = await supabase.auth.signUp({
                    email: normalizedEmail,
                    password,
                    options: {
                        emailRedirectTo: `${callbackBaseUrl}/confirm.html`,
                        data: {
                            name: normalizedName,
                            employee_id: normalizedEmployeeId,
                            location: areaGroup,
                            role: 'engineer' as UserRole,
                            is_active: true,
                        },
                    },
                });
                if (error) throw error;

                // If session is returned, user is authenticated now and profile can be created immediately.
                if (data.user && data.session) {
                    await ensureProfileForUser(data.user, {
                        name: normalizedName,
                        email: normalizedEmail,
                        employeeId: normalizedEmployeeId,
                        location: areaGroup,
                        role: 'engineer',
                    });
                }
                set({ loading: false });
                return { requiresEmailConfirmation: !data.session };
            } catch (e) {
                set({ loading: false });
                throw e;
            }
        },

        resetPassword: async (email) => {
            set({ loading: true });
            try {
                const baseUrl = getCallbackBaseUrl();
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${baseUrl}/reset-password.html`,
                });
                if (error) throw error;
                set({ loading: false });
            } catch (e) {
                set({ loading: false });
                throw e;
            }
        },

        updateUserPassword: async (password) => {
            set({ loading: true });
            try {
                const { error } = await supabase.auth.updateUser({ password });
                if (error) throw error;
                set({ loading: false, isRecovery: false });
            } catch (e) {
                set({ loading: false });
                throw e;
            }
        },

        signOut: async () => {
            await supabase.auth.signOut();
            set({ session: null, user: null, isRecovery: false });
            await logoutPushIdentity();
        },
    };
});
