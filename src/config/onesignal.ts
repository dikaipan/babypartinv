import { LogLevel, OneSignal } from 'react-native-onesignal';
import { Platform } from 'react-native';

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
const ONE_SIGNAL_WEB_INIT_FLAG = '__babypartOneSignalWebInitialized';

const isSdkAlreadyInitializedError = (error: unknown) => {
    const message =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
                ? error
                : '';
    return message.toLowerCase().includes('already initialized');
};

const getWebPushSubscription = (sdk: OneSignalWebSdk): OneSignalWebPushSubscription | undefined =>
    sdk.User?.PushSubscription || sdk.User?.pushSubscription;

const isWebPushRuntimeSupported = (): boolean => {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (!window.isSecureContext) return false;
    if (!('Notification' in window)) return false;
    if (!('serviceWorker' in navigator)) return false;
    return true;
};

const ensureOneSignalWebSdk = async (): Promise<OneSignalWebSdk> => {
    if (Platform.OS !== 'web') {
        throw new Error('OneSignal web SDK hanya tersedia di web.');
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
                        });
                    } catch (error) {
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
        if (!isWebPushRuntimeSupported()) return;
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
        if (!isWebPushRuntimeSupported()) {
            return {
                supported: false,
                platform: 'web',
                oneSignalId: null,
                pushToken: null,
                optedIn: false,
                permissionGranted: false,
                reason: 'Web push tidak didukung di environment ini.',
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
                reason: error instanceof Error ? error.message : 'Sinkronisasi OneSignal web gagal.',
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
const ONESIGNAL_REST_API_KEY = 'os_v2_app_44pcgj3tnnffrjk7ypkponmaddojnejae2neejnhpjymisc4252ylnzkx2gmmun6n7xskoegtuwg6pwhmf3hnhd2vrfng2fostbd76y';
const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications?c=push';

interface NotificationPayload {
    headings: { en: string };
    contents: { en: string };
    include_player_ids?: string[];
    include_external_user_ids?: string[]; // Deprecated but might simpler if using external IDs
    include_aliases?: { external_id: string[] }; // New way for external IDs
    target_channel?: 'push';
    included_segments?: string[];
    data?: any;
    app_id: string;
}

export const sendNotification = async (
    title: string,
    body: string,
    target: { externalIds?: string[]; playerIds?: string[]; segments?: string[] },
    data?: any
) => {
    const payload: NotificationPayload = {
        app_id: ONESIGNAL_APP_ID,
        headings: { en: title },
        contents: { en: body },
        data: data,
    };

    // Target specific users by External ID (Supabase User ID)
    if (target.externalIds && target.externalIds.length > 0) {
        // OneSignal v5+ recommends using `include_aliases` for external_id
        payload.include_aliases = { external_id: target.externalIds };
        payload.target_channel = 'push';
    }
    // Target specific devices
    else if (target.playerIds && target.playerIds.length > 0) {
        payload.include_player_ids = target.playerIds;
    }
    // Target segments (Active Users, etc.)
    else if (target.segments && target.segments.length > 0) {
        payload.included_segments = target.segments;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    console.log('[OneSignal] Sending Notification Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(ONESIGNAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const text = await response.text();
        let json: any = {};
        try {
            json = text ? JSON.parse(text) : {};
        } catch {
            json = { raw: text };
        }

        if (!response.ok) {
            throw new Error(`[OneSignal ${response.status}] ${JSON.stringify(json)}`);
        }

        console.log('OneSignal Response:', json);
        return json;
    } catch (error) {
        console.error('OneSignal Send Error:', error);
        throw error;
    }
};
