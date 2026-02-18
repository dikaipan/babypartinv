import { supabase } from '../config/supabase';
import { sendNotification } from '../config/onesignal';

export const NotificationService = {
    /**
     * Send a notification to a specific user by their Supabase ID
     */
    sendToUser: async (userId: string, title: string, body: string, data?: any) => {
        await sendNotification(title, body, { externalIds: [userId] }, data);
        logNotification([userId], title, body, data).catch(e => console.error('[sendToUser] BG Log Error:', e));
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
        const res = await sendNotification(title, body, { externalIds: userIds }, data);
        logNotification(userIds, title, body, data).catch(e => console.error('[sendToRole] BG Log Error:', e));
        return res;
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

        console.log(`[Broadcast] Target: ${target}, Database User Count: ${userIds.length}`);

        if (target === 'all') {
            const res = await sendNotification(title, body, { segments: ['Active Users', 'Subscribed Users'] });
            if (userIds.length > 0) {
                console.log(`[Broadcast] Logging to DB in background for ${userIds.length} users...`);
                logNotification(userIds, title, body).catch(e => console.error('[Broadcast] BG Log Error:', e));
            }
            return res;
        } else {
            return await NotificationService.sendToRole(target, title, body);
        }
    },

    /**
     * Send to multiple specific users
     */
    sendToUsers: async (userIds: string[], title: string, body: string, data?: any) => {
        if (!userIds.length) return;
        await sendNotification(title, body, { externalIds: userIds }, data);
        await logNotification(userIds, title, body, data);
    }
};

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
    console.log(`[logNotification] Successfully logged to DB for ${userIds.length} recipients.`);
}
