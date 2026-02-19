import { supabase } from '../config/supabase';
import { sendNotification } from '../config/onesignal';

export const NotificationService = {
    /**
     * Send a notification to a specific user by their Supabase ID
     */
    sendToUser: async (userId: string, title: string, body: string, data?: any) => {
        if (!userId) return;
        return await dispatchNotification([userId], title, body, { externalIds: [userId] }, data, 'sendToUser');
    },

    /**
     * Send to all users with a specific role ('admin' or 'engineer')
     */
    sendToRole: async (role: 'admin' | 'engineer', title: string, body: string, data?: any) => {
        // Fetch users with this role
        const { data: users, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', role);

        if (error) throw error;
        if (!users || users.length === 0) return;

        const userIds = users.map(u => u.id);
        // OneSignal API limits target list size, but for this scale it's likely fine.
        // If many users, better to use OneSignal Segments (not set up here) or batch.
        return await dispatchNotification(userIds, title, body, { externalIds: userIds }, data, 'sendToRole');
    },

    /**
     * Broadcast to all users or specific groups
     */
    broadcast: async (title: string, body: string, target: 'all' | 'admin' | 'engineer' = 'all') => {
        let userIds: string[] = [];

        // Fetch eligible users for database logging
        const query = supabase.from('profiles').select('id');
        if (target !== 'all') {
            query.eq('role', target);
        }

        const { data: users, error: fetchError } = await query;
        if (fetchError) {
            console.error('[Broadcast] Fetch users error:', fetchError);
            throw fetchError;
        }

        if (users) {
            userIds = users.map(u => u.id);
        }

        // console.log(`[Broadcast] Target: ${target}, Database User Count: ${userIds.length}`);

        if (target === 'all') {
            if (userIds.length === 0) return null;
            // Avoid dependency on OneSignal dashboard segment names.
            return await dispatchNotification(userIds, title, body, { externalIds: userIds }, undefined, 'broadcast');
        } else {
            return await NotificationService.sendToRole(target, title, body);
        }
    },

    /**
     * Send to multiple specific users
     */
    sendToUsers: async (userIds: string[], title: string, body: string, data?: any) => {
        if (!userIds.length) return;
        return await dispatchNotification(userIds, title, body, { externalIds: userIds }, data, 'sendToUsers');
    }
};

async function dispatchNotification(
    userIds: string[],
    title: string,
    body: string,
    pushTarget: { externalIds?: string[]; playerIds?: string[]; segments?: string[] },
    data?: any,
    source: string = 'notification'
) {
    const [logResult, pushResult] = await Promise.allSettled([
        logNotification(userIds, title, body, data),
        sendNotification(title, body, pushTarget, data),
    ]);

    if (logResult.status === 'rejected') {
        console.error(`[${source}] DB log error:`, logResult.reason);
    }
    if (pushResult.status === 'rejected') {
        console.error(`[${source}] Push error:`, pushResult.reason);
        return null;
    }

    return pushResult.value;
}

/**
 * Optional: Log notifications to a Supabase table 'notifications' if it exists.
 * If not, this will fail silently/log error but not stop execution.
 */
async function logNotification(userIds: string[], title: string, body: string, data?: any) {
    const rows = userIds.map(uid => ({
        user_id: uid,
        title,
        body,
        data: data || {},
        is_read: false,
        type: 'system'
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) {
        console.error('[logNotification] Insert error:', error);
        throw error;
    }
    // console.log(`[logNotification] Successfully logged to DB for ${userIds.length} recipients.`);
}
