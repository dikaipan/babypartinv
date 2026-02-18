import { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../src/config/theme';

import { supabase } from '../src/config/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { AppNotification } from '../src/types';
import AppSnackbar from '../src/components/AppSnackbar';

export default function NotificationsPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const loadNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const { data, error: err } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (err) throw err;
            setNotifications(data || []);
        } catch (e: any) {
            console.error('Error loading notifications:', e);
            // Don't show snackbar for missing table if that's the case, but good for debugging
            // setError(e.message); 
        } finally {
            setLoading(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => {
        loadNotifications();
        // Mark all as read on open? Or maybe individually? 
        // For now let's just View them.
    }, [loadNotifications]));

    const onRefresh = async () => {
        setRefreshing(true);
        await loadNotifications();
        setRefreshing(false);
    };

    const handlePress = async (notification: AppNotification) => {
        // Mark as read
        if (!notification.is_read) {
            await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id);
            setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
        }

        // Handle navigation based on type/data if needed
        // For now just stay or maybe expand?
    };

    const markAllRead = async () => {
        if (!user) return;
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true }))); // Optimistic update
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
    };

    const renderItem = ({ item }: { item: AppNotification }) => {
        const isRead = item.is_read;
        const time = new Date(item.created_at).toLocaleString('id-ID', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        return (
            <Pressable
                style={[styles.card, !isRead && styles.cardUnread]}
                onPress={() => handlePress(item)}
                android_ripple={{ color: Colors.primary + '10' }}
            >
                <View style={[styles.iconBox, !isRead && { backgroundColor: Colors.primary + '20' }]}>
                    <MaterialCommunityIcons
                        name={!isRead ? "bell-ring-outline" : "bell-outline"}
                        size={24}
                        color={!isRead ? Colors.primary : Colors.textSecondary}
                    />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.cardHeader}>
                        <Text style={[styles.title, !isRead && styles.titleUnread]} numberOfLines={1}>
                            {item.title}
                        </Text>
                        <Text style={styles.time}>{time}</Text>
                    </View>
                    <Text style={[styles.body, !isRead && styles.bodyUnread]} numberOfLines={3}>
                        {item.body}
                    </Text>
                </View>
                {!isRead && <View style={styles.dot} />}
            </Pressable>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <IconButton icon="arrow-left" iconColor={Colors.text} size={24} onPress={() => router.back()} />
                <Text style={styles.headerTitle}>Notifikasi</Text>
                <IconButton icon="check-all" iconColor={Colors.primary} size={24} onPress={markAllRead} />
            </View>

            <FlatList
                data={notifications}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="bell-sleep-outline" size={64} color={Colors.textMuted} />
                            <Text style={styles.emptyText}>Belum ada notifikasi</Text>
                        </View>
                    ) : (
                        <View style={styles.loader}>
                            <ActivityIndicator color={Colors.primary} />
                        </View>
                    )
                }
            />

            <AppSnackbar visible={!!error} onDismiss={() => setError('')}>{error}</AppSnackbar>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 8, paddingVertical: 8,
        borderBottomWidth: 1, borderBottomColor: Colors.border
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
    listContent: { padding: 16, gap: 12 },
    card: {
        flexDirection: 'row', gap: 12, padding: 16,
        backgroundColor: Colors.card,
        borderRadius: 12,
        borderWidth: 1, borderColor: Colors.border,
    },
    cardUnread: {
        backgroundColor: Colors.primary + '08',
        borderColor: Colors.primary + '30',
    },
    iconBox: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#1F2937',
        alignItems: 'center', justifyContent: 'center'
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 15, fontWeight: '600', color: Colors.text, flex: 1, marginRight: 8 },
    titleUnread: { color: Colors.primary, fontWeight: 'bold' },
    time: { fontSize: 11, color: Colors.textMuted },
    body: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
    bodyUnread: { color: Colors.text },
    dot: {
        width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary,
        alignSelf: 'center'
    },
    emptyState: {
        alignItems: 'center', justifyContent: 'center',
        paddingVertical: 60, gap: 16
    },
    emptyText: { color: Colors.textMuted, fontSize: 14 },
    loader: { paddingVertical: 40 }
});
