import { QueryClient } from '@tanstack/react-query';

let queryClientSingleton: QueryClient | null = null;

export function getQueryClient() {
    if (queryClientSingleton) {
        return queryClientSingleton;
    }

    queryClientSingleton = new QueryClient({
        defaultOptions: {
            queries: {
                // Keep data warm for navigation without aggressively re-fetching.
                staleTime: 60 * 1000,
                gcTime: 30 * 60 * 1000,
                retry: 1,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
                refetchOnMount: false,
            },
        },
    });

    return queryClientSingleton;
}

