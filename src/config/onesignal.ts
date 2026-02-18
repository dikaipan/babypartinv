import { LogLevel, OneSignal } from 'react-native-onesignal';
import { Platform } from 'react-native';

// Replace with your OneSignal App ID
const ONESIGNAL_APP_ID = 'e71e2327-736b-4a58-a55f-c3d4f7358018';

export const initOneSignal = () => {
    if (Platform.OS === 'web') {
        const script = document.createElement('script');
        script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
        script.defer = true;
        script.onload = () => {
            const OneSignalWeb = (window as any).OneSignal || [];
            OneSignalWeb.push(() => {
                OneSignalWeb.init({
                    appId: ONESIGNAL_APP_ID,
                    allowLocalhostAsSecureOrigin: true,
                });
            });
        };
        document.head.appendChild(script);
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
) {
    if (!externalUserId) {
        throw new Error('User ID untuk sinkronisasi push tidak valid.');
    }

    if (Platform.OS === 'web') {
        return {
            supported: false,
            platform: 'web',
            oneSignalId: null,
            pushToken: null,
            optedIn: false,
            permissionGranted: false,
        };
    }

    OneSignal.login(externalUserId);

    const shouldRequestPermission = options?.requestPermission ?? true;
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

/* ─── Client-side Notification Sending (Not recommended for public apps, okay for internal admin) ─── */
const ONESIGNAL_REST_API_KEY = 'os_v2_app_44pcgj3tnnffrjk7ypkponmadbmbjyurx6ruhsf5hkhcqmspf4677d5jz5kce7gj2ije7byibcmxawp2c7htx7aj2i3n74h47je2o6y';
const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';

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
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
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
