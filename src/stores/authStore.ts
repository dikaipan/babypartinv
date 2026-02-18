import { create } from 'zustand';
import { supabase } from '../config/supabase';
import { Profile, UserRole } from '../types';
import { normalizeArea } from '../utils/normalizeArea';
import { OneSignal } from 'react-native-onesignal';
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

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    session: null,
    loading: false,
    initialized: false,
    isRecovery: false,

    init: async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const profile = await ensureProfileForUser(session.user);
                set({ session, user: profile, initialized: true });
                if (Platform.OS !== 'web') {
                    OneSignal.login(session.user.id);
                }
            } else {
                set({ session: null, user: null, initialized: true });
            }
        } catch (error) {
            console.error('[auth.init] Failed to initialize auth session:', error);
            set({ session: null, user: null, initialized: true });
        }

        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                set({ isRecovery: true });
            }

            if (session?.user) {
                try {
                    const profile = await ensureProfileForUser(session.user);
                    set({ session, user: profile });
                } catch (error) {
                    console.error('[auth.onAuthStateChange] Failed to sync profile:', error);
                    set({ session, user: null });
                }
            } else {
                set({ session: null, user: null });
            }
        });
    },

    refreshProfile: async () => {
        const session = get().session;
        if (!session?.user) return;
        const profile = await ensureProfileForUser(session.user);
        set({ user: profile });
    },

    signIn: async (email, password) => {
        set({ loading: true });
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
            });
            if (error) throw error;
            const profile = await ensureProfileForUser(data.user);
            set({ session: data.session, user: profile, loading: false });
            if (Platform.OS !== 'web') {
                OneSignal.login(data.user.id);
            }
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
        if (Platform.OS !== 'web') {
            OneSignal.logout();
        }
    },
}));
