import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

type UseWebPullToRefreshOptions = {
    onRefresh: () => void | Promise<void>;
    refreshing: boolean;
    enabled?: boolean;
    threshold?: number;
    maxPull?: number;
};

export function useWebPullToRefresh({
    onRefresh,
    refreshing,
    enabled = true,
    threshold = 70,
    maxPull = 120,
}: UseWebPullToRefreshOptions) {
    const isEnabled = Platform.OS === 'web' && enabled;
    const [pullDistance, setPullDistance] = useState(0);
    const scrollYRef = useRef(0);
    const startYRef = useRef<number | null>(null);
    const draggingRef = useRef(false);
    const runningRef = useRef(false);

    const ready = pullDistance >= threshold;

    const onScroll = useCallback((event: any) => {
        if (!isEnabled) return;
        const nextY = event?.nativeEvent?.contentOffset?.y ?? 0;
        scrollYRef.current = nextY;
        if (nextY > 0 && pullDistance > 0) setPullDistance(0);
    }, [isEnabled, pullDistance]);

    const onTouchStart = useCallback((event: any) => {
        if (!isEnabled || refreshing) return;
        if (scrollYRef.current > 0) return;
        const touch = event?.nativeEvent?.touches?.[0];
        if (!touch) return;
        startYRef.current = touch.pageY;
        draggingRef.current = true;
    }, [isEnabled, refreshing]);

    const onTouchMove = useCallback((event: any) => {
        if (!isEnabled || !draggingRef.current || refreshing) return;
        const touch = event?.nativeEvent?.touches?.[0];
        if (!touch || startYRef.current === null) return;
        if (scrollYRef.current > 0) return;

        const delta = touch.pageY - startYRef.current;
        if (delta <= 0) {
            setPullDistance(0);
            return;
        }

        setPullDistance(Math.min(maxPull, delta * 0.55));
    }, [isEnabled, maxPull, refreshing]);

    const onTouchEnd = useCallback(() => {
        if (!isEnabled) return;
        draggingRef.current = false;
        startYRef.current = null;
        const shouldRefresh = ready && !refreshing && !runningRef.current;
        setPullDistance(0);

        if (!shouldRefresh) return;
        runningRef.current = true;
        Promise.resolve(onRefresh()).finally(() => {
            runningRef.current = false;
        });
    }, [isEnabled, onRefresh, ready, refreshing]);

    return {
        enabled: isEnabled,
        pullDistance,
        ready,
        onScroll,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
    };
}
