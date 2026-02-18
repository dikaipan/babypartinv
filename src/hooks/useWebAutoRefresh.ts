import { useEffect } from 'react';
import { Platform } from 'react-native';

type UseWebAutoRefreshOptions = {
    enabled?: boolean;
    intervalMs?: number;
};

export function useWebAutoRefresh(
    refresh: () => void | Promise<void>,
    options: UseWebAutoRefreshOptions = {}
) {
    const { enabled = true, intervalMs = 45000 } = options;

    useEffect(() => {
        if (Platform.OS !== 'web' || !enabled) return;

        const scope = globalThis as any;
        const doc = scope?.document as Document | undefined;

        const run = () => {
            void refresh();
        };

        const onVisibility = () => {
            if (!doc || doc.visibilityState === 'visible') {
                run();
            }
        };

        const onFocus = () => run();
        const onOnline = () => run();

        const intervalId = setInterval(onVisibility, intervalMs);
        doc?.addEventListener('visibilitychange', onVisibility);
        scope?.addEventListener?.('focus', onFocus);
        scope?.addEventListener?.('online', onOnline);

        return () => {
            clearInterval(intervalId);
            doc?.removeEventListener('visibilitychange', onVisibility);
            scope?.removeEventListener?.('focus', onFocus);
            scope?.removeEventListener?.('online', onOnline);
        };
    }, [enabled, intervalMs, refresh]);
}
