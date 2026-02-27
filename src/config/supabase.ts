import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
        'Missing Supabase environment variables. ' +
            'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.',
    );
}

const webStorage = {
    getItem: (key: string) => {
        const val = localStorage.getItem(key);
        return val;
    },
    setItem: (key: string, val: string) => {
        localStorage.setItem(key, val);
    },
    removeItem: (key: string) => {
        localStorage.removeItem(key);
    },
};

const nativeStorage = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, val: string) => SecureStore.setItemAsync(key, val),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retryingFetch: typeof fetch = async (input, init) => {
    const maxAttempts = 2;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await fetch(input, init);
        } catch (error) {
            lastError = error;
            if (attempt >= maxAttempts) throw error;
            await sleep(250 * attempt);
        }
    }

    throw lastError;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: {
        // Prevent web queries from hanging indefinitely.
        timeout: 15000,
    },
    global: {
        fetch: retryingFetch,
    },
    auth: {
        storage: Platform.OS === 'web' ? webStorage : nativeStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web', // Must be true on web for password reset/email confirm links
        // Avoid browser Navigator LockManager timeout issues on some web runtimes.
        lock: Platform.OS === 'web' ? processLock : undefined,
    },
});
