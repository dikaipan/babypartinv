import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../config/supabase';

type UseSupabaseRealtimeRefreshOptions = {
    enabled?: boolean;
    debounceMs?: number;
    schema?: string;
};

export function useSupabaseRealtimeRefresh(
    tables: string[],
    refresh: () => void | Promise<void>,
    options: UseSupabaseRealtimeRefreshOptions = {},
) {
    const { enabled = true, debounceMs = 350, schema = 'public' } = options;
    const tablesKey = useMemo(() => tables.slice().sort().join('|'), [tables]);
    const refreshRef = useRef(refresh);
    const instanceIdRef = useRef(Math.random().toString(36).slice(2, 8));

    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        if (!enabled || tables.length === 0) return;

        let disposed = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const tableList = tables.slice();
        const channelName = `rt-refresh:${schema}:${tablesKey}:${instanceIdRef.current}`;

        const triggerRefresh = () => {
            if (disposed) return;
            if (timeoutId) return;
            timeoutId = setTimeout(() => {
                timeoutId = null;
                if (!disposed) {
                    void refreshRef.current();
                }
            }, debounceMs);
        };

        let channel = supabase.channel(channelName);
        for (const table of tableList) {
            channel = channel.on(
                'postgres_changes',
                { event: '*', schema, table },
                triggerRefresh,
            );
        }

        channel.subscribe();

        return () => {
            disposed = true;
            if (timeoutId) clearTimeout(timeoutId);
            void supabase.removeChannel(channel);
        };
    }, [debounceMs, enabled, schema, tables.length, tablesKey]);
}
