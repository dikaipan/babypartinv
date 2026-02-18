import { create } from 'zustand';
import { supabase } from '../config/supabase';
import { Profile, UserRole } from '../types';
import { normalizeArea } from '../utils/normalizeArea';
import { OneSignal } from 'react-native-onesignal';
import { Platform } from 'react-native';

interface AuthState {
    user: Profile | null;
    session: any | null;
    loading: boolean;
    initialized: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, name: string, employeeId?: string, location?: string) => Promise<void>;
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
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                set({ session, user: profile, initialized: true });
                if (Platform.OS !== 'web') {
                    OneSignal.login(session.user.id);
                }
            } else {
                set({ session: null, user: null, initialized: true });
            }
        } catch {
            set({ initialized: true });
        }

        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                set({ isRecovery: true });
            }

            if (session?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                set({ session, user: profile });
            } else {
                set({ session: null, user: null });
            }
        });
    },

    refreshProfile: async () => {
        const session = get().session;
        if (!session?.user) return;
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
        if (profile) set({ user: profile });
    },

    signIn: async (email, password) => {
        set({ loading: true });
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single();
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
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            if (data.user) {
                await supabase.from('profiles').upsert({
                    id: data.user.id,
                    name,
                    email,
                    role: 'engineer' as UserRole,
                    employee_id: employeeId || null,
                    location: location ? normalizeArea(location) : null,
                    is_active: true,
                });
            }
            set({ loading: false });
        } catch (e) {
            set({ loading: false });
            throw e;
        }
    },

    resetPassword: async (email) => {
        set({ loading: true });
        try {
            const baseUrl = Platform.OS === 'web' ? window.location.origin : 'https://babypartreset.pages.dev';
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
