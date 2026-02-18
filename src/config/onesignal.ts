import { LogLevel, OneSignal } from 'react-native-onesignal';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Replace with your OneSignal App ID
const ONESIGNAL_APP_ID = 'e71e2327-736b-4a58-a55f-c3d4f7358018';

type OneSignalWebPushSubscription = {
    id?: string | null;
    token?: string | null;
    optedIn?: boolean;
    optIn?: () => void | Promise<void>;
};

type OneSignalWebSdk = {
    init: (config: Record<string, any>) => void | Promise<void>;
    login?: (externalUserId: string) => void | Promise<void>;
    logout?: () => void | Promise<void>;
    Notifications?: {
        permission?: boolean;
        requestPermission?: () => boolean | Promise<boolean>;
    };
    User?: {
        PushSubscription?: OneSignalWebPushSubscription;
        pushSubscription?: OneSignalWebPushSubscription;
    };
};

type SyncPushIdentityResult = {
    supported: boolean;
    platform: string;
    oneSignalId: string | null;
    pushToken: string | null;
    optedIn: boolean;
    permissionGranted: boolean;
    reason?: string;
};

let oneSignalWebInitPromise: Promise<OneSignalWebSdk> | null = null;
let oneSignalWebInitialized = false;
let oneSignalWebUnsupportedReason: string | null = null;
const ONE_SIGNAL_WEB_INIT_FLAG = '__babypartOneSignalWebInitialized';

const toErrorMessage = (error: unknown) =>
    error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : '';

const isSdkAlreadyInitializedError = (error: unknown) => {
    const message = toErrorMessage(error);
    return message.toLowerCase().includes('already initialized');
};

const isWebPushNotConfiguredError = (error: unknown) => {
    const message = toErrorMessage(error).toLowerCase();
    return message.includes('app not configured for web push');
};

const getWebPushSubscription = (sdk: OneSignalWebSdk): OneSignalWebPushSubscription | undefined =>
    sdk.User?.PushSubscription || sdk.User?.pushSubscription;

const getWebPushUnsupportedReason = (): string | null => {
    if (oneSignalWebUnsupportedReason) return oneSignalWebUnsupportedReason;
    if (Platform.OS !== 'web') return 'Web push hanya tersedia di platform web.';
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'Runtime browser tidak tersedia.';
    if (!('Notification' in window)) return 'Browser tidak mendukung Notification API.';
    if (!('serviceWorker' in navigator)) return 'Browser tidak mendukung Service Worker.';

    const host = window.location?.hostname || '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
        return 'Push web butuh HTTPS (kecuali localhost).';
    }

    return null;
};

const ensureOneSignalWebSdk = async (): Promise<OneSignalWebSdk> => {
    if (Platform.OS !== 'web') {
        throw new Error('OneSignal web SDK hanya tersedia di web.');
    }

    if (oneSignalWebUnsupportedReason) {
        throw new Error(oneSignalWebUnsupportedReason);
    }

    if (oneSignalWebInitPromise) {
        return oneSignalWebInitPromise;
    }

    oneSignalWebInitPromise = new Promise<OneSignalWebSdk>((resolve, reject) => {
        const win = window as any;
        oneSignalWebInitialized = oneSignalWebInitialized || !!win[ONE_SIGNAL_WEB_INIT_FLAG];
        win.OneSignalDeferred = win.OneSignalDeferred || [];
        win.OneSignalDeferred.push(async (oneSignalSdk: OneSignalWebSdk) => {
            try {
                if (!oneSignalWebInitialized) {
                    try {
                        await oneSignalSdk.init({
                            appId: ONESIGNAL_APP_ID,
                            allowLocalhostAsSecureOrigin: true,
                            serviceWorkerPath: '/OneSignalSDKWorker.js',
                            serviceWorkerUpdaterPath: '/OneSignalSDKUpdaterWorker.js',
                            serviceWorkerParam: { scope: '/' },
                        });
                    } catch (error) {
                        if (isWebPushNotConfiguredError(error)) {
                            oneSignalWebUnsupportedReason =
                                'OneSignal App belum dikonfigurasi untuk Web Push di dashboard OneSignal.';
                            throw new Error(oneSignalWebUnsupportedReason);
                        }
                        if (!isSdkAlreadyInitializedError(error)) {
                            throw error;
                        }
                    }
                    oneSignalWebInitialized = true;
                    win[ONE_SIGNAL_WEB_INIT_FLAG] = true;
                }
                resolve(oneSignalSdk);
            } catch (error) {
                reject(error);
            }
        });

        const existingScript = document.getElementById('onesignal-web-sdk');
        if (!existingScript) {
            const script = document.createElement('script');
            script.id = 'onesignal-web-sdk';
            script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
            script.defer = true;
            script.onerror = () => reject(new Error('Gagal memuat OneSignal Web SDK.'));
            document.head.appendChild(script);
        }
    }).catch((error) => {
        oneSignalWebInitPromise = null;
        throw error;
    });

    return oneSignalWebInitPromise;
};

export const initOneSignal = () => {
    if (Platform.OS === 'web') {
        const unsupportedReason = getWebPushUnsupportedReason();
        if (unsupportedReason) {
            console.warn('[OneSignal.web] Init skipped:', unsupportedReason);
            return;
        }
        void ensureOneSignalWebSdk().catch((error) => {
            console.warn('[OneSignal.web] Init failed:', error);
        });
        return;
    }

    // Optional - set logging for debugging
    OneSignal.Debug.setLogLevel(LogLevel.Verbose);
    // ... rest of native init

    // OneSignal Initialization
    OneSignal.initialize(ONESIGNAL_APP_ID);

    // Request permission for notifications if not already granted
    OneSignal.Notifications.requestPermission(true);
    OneSignal.User.pushSubscription.optIn();

    // Listen for notification clicks
    OneSignal.Notifications.addEventListener('click', (event: any) => {
        console.log('OneSignal: notification clicked:', event);
    });

    // Listen for foreground notifications
    OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event: any) => {
        console.log('OneSignal: notification received in foreground:', event);
        // By default, notifications are shown. You can prevent this with event.preventDefault()
    });
};

export async function syncPushIdentity(
    externalUserId: string,
    options?: { requestPermission?: boolean },
): Promise<SyncPushIdentityResult> {
    if (!externalUserId) {
        throw new Error('User ID untuk sinkronisasi push tidak valid.');
    }

    const shouldRequestPermission = options?.requestPermission ?? true;

    if (Platform.OS === 'web') {
        const unsupportedReason = getWebPushUnsupportedReason();
        if (unsupportedReason) {
            return {
                supported: false,
                platform: 'web',
                oneSignalId: null,
                pushToken: null,
                optedIn: false,
                permissionGranted: false,
                reason: unsupportedReason,
            };
        }

        try {
            const oneSignalWeb = await ensureOneSignalWebSdk();
            if (typeof oneSignalWeb.login === 'function') {
                await oneSignalWeb.login(externalUserId);
            }

            let permissionGranted = !!oneSignalWeb.Notifications?.permission || Notification.permission === 'granted';
            if (!permissionGranted && shouldRequestPermission && typeof oneSignalWeb.Notifications?.requestPermission === 'function') {
                try {
                    const granted = await oneSignalWeb.Notifications.requestPermission();
                    permissionGranted = !!granted || !!oneSignalWeb.Notifications?.permission || Notification.permission === 'granted';
                } catch (error) {
                    console.warn('[OneSignal.web] requestPermission failed:', error);
                }
            }

            const pushSubscription = getWebPushSubscription(oneSignalWeb);
            if (permissionGranted && typeof pushSubscription?.optIn === 'function') {
                try {
                    await pushSubscription.optIn();
                } catch (error) {
                    console.warn('[OneSignal.web] pushSubscription.optIn failed:', error);
                }
            }

            return {
                supported: true,
                platform: 'web',
                oneSignalId: pushSubscription?.id || null,
                pushToken: pushSubscription?.token || null,
                optedIn: !!pushSubscription?.optedIn,
                permissionGranted: !!permissionGranted,
            };
        } catch (error) {
            console.warn('[OneSignal.web] syncPushIdentity fallback:', error);
            return {
                supported: false,
                platform: 'web',
                oneSignalId: null,
                pushToken: null,
                optedIn: false,
                permissionGranted: false,
                reason: toErrorMessage(error) || 'Sinkronisasi OneSignal web gagal.',
            };
        }
    }

    OneSignal.login(externalUserId);
    let permissionGranted = await OneSignal.Notifications.getPermissionAsync();
    if (!permissionGranted && shouldRequestPermission) {
        const canRequest = await OneSignal.Notifications.canRequestPermission();
        if (canRequest) {
            permissionGranted = await OneSignal.Notifications.requestPermission(true);
        }
    }

    OneSignal.User.pushSubscription.optIn();

    const [oneSignalId, pushToken, optedIn] = await Promise.all([
        OneSignal.User.getOnesignalId(),
        OneSignal.User.pushSubscription.getTokenAsync(),
        OneSignal.User.pushSubscription.getOptedInAsync(),
    ]);

    return {
        supported: true,
        platform: Platform.OS,
        oneSignalId: oneSignalId || null,
        pushToken: pushToken || null,
        optedIn: !!optedIn,
        permissionGranted: !!permissionGranted,
    };
}

export const logoutPushIdentity = async () => {
    if (Platform.OS === 'web') {
        try {
            const oneSignalWeb = await ensureOneSignalWebSdk();
            if (typeof oneSignalWeb.logout === 'function') {
                await oneSignalWeb.logout();
            }
        } catch (error) {
            console.warn('[OneSignal.web] Logout skipped:', error);
        }
        return;
    }

    OneSignal.logout();
};

/* ─── Client-side Notification Sending (Not recommended for public apps, okay for internal admin) ─── */
const normalizePushGatewayUrl = (rawUrl: string): string => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return '';

    try {
        const parsed = new URL(trimmed);
        const plainSupabaseHost = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
        const functionSupabaseHost = parsed.hostname.match(/^([a-z0-9-]+)\.functions\.supabase\.co$/i);
        const normalizedPath = (parsed.pathname.replace(/\/+$/, '') || '/');

        if (functionSupabaseHost && normalizedPath === '/push-gateway') {
            parsed.hostname = `${functionSupabaseHost[1]}.supabase.co`;
            parsed.pathname = '/functions/v1/push-gateway';
            parsed.search = '';
            return parsed.toString().replace(/\/$/, '');
        }

        if (plainSupabaseHost && normalizedPath === '/push-gateway') {
            parsed.pathname = '/functions/v1/push-gateway';
            parsed.search = '';
            return parsed.toString().replace(/\/$/, '');
        }
    } catch {
        // Keep original value for existing validation path.
    }

    return trimmed;
};

const PUSH_GATEWAY_URL = normalizePushGatewayUrl(process.env.EXPO_PUBLIC_PUSH_GATEWAY_URL || '');

interface NotificationPayload {
    title: string;
    body: string;
    appId: string;
    include_player_ids?: string[];
    include_aliases?: { external_id: string[] };
    target_channel?: 'push';
    included_segments?: string[];
    data?: unknown;
}

const parseJsonSafe = (text: string) => {
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
};

export const sendNotification = async (
    title: string,
    body: string,
    target: { externalIds?: string[]; playerIds?: string[]; segments?: string[] },
    data?: unknown
) => {
    if (!PUSH_GATEWAY_URL) {
        throw new Error('Push gateway belum dikonfigurasi. Set EXPO_PUBLIC_PUSH_GATEWAY_URL terlebih dulu.');
    }

    const payload: NotificationPayload = {
        title,
        body,
        appId: ONESIGNAL_APP_ID,
        data,
    };

    if (target.externalIds && target.externalIds.length > 0) {
        payload.include_aliases = { external_id: target.externalIds };
        payload.target_channel = 'push';
    } else if (target.playerIds && target.playerIds.length > 0) {
        payload.include_player_ids = target.playerIds;
    } else if (target.segments && target.segments.length > 0) {
        payload.included_segments = target.segments;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
    };
    if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(PUSH_GATEWAY_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        const text = await response.text();
        const json = parseJsonSafe(text);

        if (!response.ok) {
            throw new Error(`[PushGateway ${response.status}] ${JSON.stringify(json)}`);
        }

        return json;
    } catch (error) {
        console.error('Push gateway error:', error);
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};
