// Prevent OneSignal v16 from crashing on close events that are not OneSignal notifications.
self.addEventListener(
    'notificationclose',
    (event) => {
        if (!event?.notification?.data) {
            event.stopImmediatePropagation();
        }
    },
    true,
);

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
