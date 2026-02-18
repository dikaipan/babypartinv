import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../config/supabase';
import { useAuthStore } from '../stores/authStore';

/**
 * Hook to fetch the unread notification count for the current user.
 * Refreshes on screen focus.
 */
export function useUnreadCount() {
    const { user } = useAuthStore();
    const [unreadCount, setUnreadCount] = useState(0);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;

            const fetchCount = async () => {
                const { count, error } = await supabase
                    .from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('is_read', false);

                if (!error && count !== null) {
                    setUnreadCount(count);
                }
            };

            fetchCount();
        }, [user])
    );

    return unreadCount;
}
