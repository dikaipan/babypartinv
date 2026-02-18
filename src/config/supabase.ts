import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://karhcwuyppywmqmqppev.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthcmhjd3V5cHB5d21xbXFwcGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NjE2MDgsImV4cCI6MjA4NjUzNzYwOH0.4kXfCrcsTtcxpS6IgoOstQXnGxWLrs7jCt00WU6sMTs';

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
