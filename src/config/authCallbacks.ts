const DEFAULT_SUPABASE_AUTH_CALLBACK_BASE_URL = 'https://babypartinv.pages.dev';

const readConfiguredCallbackBaseUrl = () => {
    if (typeof process === 'undefined') return '';
    const raw = process.env.EXPO_PUBLIC_SUPABASE_AUTH_CALLBACK_BASE_URL;
    return typeof raw === 'string' ? raw.trim() : '';
};

export const getSupabaseAuthCallbackBaseUrl = () => {
    const configured = readConfiguredCallbackBaseUrl();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    return DEFAULT_SUPABASE_AUTH_CALLBACK_BASE_URL;
};

