import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabase';
import { useAuthStore } from '../stores/authStore';
import { useSupabaseRealtimeRefresh } from './useSupabaseRealtimeRefresh';

const fetchUnreadCount = async (userId: string): Promise<number> => {
    const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
    if (error) throw error;
    return count || 0;
};

/**
 * Hook to fetch the unread notification count for the current user.
 */
export function useUnreadCount() {
    const { user } = useAuthStore();
    const unreadQuery = useQuery({
        queryKey: ['notifications', 'unreadCount', user?.id],
        queryFn: () => fetchUnreadCount(user!.id),
        enabled: !!user?.id,
    });

    useSupabaseRealtimeRefresh(
        ['notifications'],
        () => {
            void unreadQuery.refetch();
        },
        { enabled: !!user?.id },
    );

    return unreadQuery.data || 0;
}
