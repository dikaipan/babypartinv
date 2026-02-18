import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, useWindowDimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import NotificationBell from '../../src/components/NotificationBell';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/config/supabase';

type DashboardRequestRow = {
    id: string;
    status: string | null;
    engineer_id: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    delivered_at: string | null;
    confirmed_at: string | null;
    cancelled_at: string | null;
};

type DashboardUsageRow = {
    id: string;
    engineer_id: string | null;
    so_number: string | null;
    date?: string | null;
    created_at?: string | null;
};

type DashboardNotificationRow = {
    id: string;
    title: string | null;
    body: string | null;
    created_at: string | null;
    is_read: boolean | null;
};

type DashboardProfileRow = {
    id: string;
    name: string | null;
    role: string | null;
};

type DashboardActivity = {
    id: string;
    source: 'request' | 'usage' | 'notification';
    title: string;
    description: string;
    timestamp: string;
    icon: string;
    color: string;
    route: string;
};

type DashboardStats = {
    totalUsers: number;
    admins: number;
    engineers: number;
    notifications: number;
};

type DashboardData = {
    stats: DashboardStats;
    recentActivities: DashboardActivity[];
};

const EMPTY_STATS: DashboardStats = { totalUsers: 0, admins: 0, engineers: 0, notifications: 0 };

const safeTimestamp = (value: string | null | undefined): number => {
    const t = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
};

const shortId = (value: string | null | undefined): string => {
    if (!value) return '-';
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const isNonNull = <T,>(value: T | null): value is T => value !== null;

const isUsageReportsDateMissingError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const message = String((error as { message?: unknown }).message || '').toLowerCase();
    return message.includes('usage_reports') && message.includes('date') && (
        message.includes('column')
        || message.includes('schema cache')
        || message.includes('could not find')
    );
};

const engineerDisplayName = (engineerId: string | null, engineerNameMap: Map<string, string>): string => {
    if (!engineerId) return 'Engineer tidak diketahui';
    const displayName = engineerNameMap.get(engineerId);
    if (displayName && displayName.trim()) return displayName.trim();
    return `Engineer ${shortId(engineerId)}`;
};

const formatActivityTime = (value: string): string => {
    const time = safeTimestamp(value);
    if (!time) return '-';

    const diffMs = Date.now() - time;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Baru saja';
    if (diffMin < 60) return `${diffMin} mnt lalu`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam lalu`;

    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} hari lalu`;

    return new Date(time).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const buildRequestActivity = (
    row: DashboardRequestRow,
    engineerNameMap: Map<string, string>
): DashboardActivity | null => {
    const status = row.status || 'pending';
    const engineerText = engineerDisplayName(row.engineer_id, engineerNameMap);

    if (status === 'approved') {
        const timestamp = row.reviewed_at || row.submitted_at;
        if (!timestamp) return null;
        return {
            id: row.id,
            source: 'request',
            title: 'Request disetujui',
            description: `${engineerText} sudah disetujui admin.`,
            timestamp,
            icon: 'check-decagram-outline',
            color: Colors.info,
            route: '/(admin)/review',
        };
    }

    if (status === 'rejected') {
        const timestamp = row.reviewed_at || row.submitted_at;
        if (!timestamp) return null;
        return {
            id: row.id,
            source: 'request',
            title: 'Request ditolak',
            description: `${engineerText} ditolak saat proses review.`,
            timestamp,
            icon: 'close-octagon-outline',
            color: Colors.danger,
            route: '/(admin)/review',
        };
    }

    if (status === 'delivered') {
        const timestamp = row.delivered_at || row.reviewed_at || row.submitted_at;
        if (!timestamp) return null;
        return {
            id: row.id,
            source: 'request',
            title: 'Barang dikirim',
            description: `Request ${engineerText} sudah berstatus delivered.`,
            timestamp,
            icon: 'truck-delivery-outline',
            color: Colors.primary,
            route: '/(admin)/review',
        };
    }

    if (status === 'completed') {
        const timestamp = row.confirmed_at || row.delivered_at || row.reviewed_at || row.submitted_at;
        if (!timestamp) return null;
        return {
            id: row.id,
            source: 'request',
            title: 'Request selesai',
            description: `${engineerText} sudah konfirmasi penerimaan.`,
            timestamp,
            icon: 'package-check',
            color: Colors.success,
            route: '/(admin)/review',
        };
    }

    if (status === 'cancelled') {
        const timestamp = row.cancelled_at || row.submitted_at;
        if (!timestamp) return null;
        return {
            id: row.id,
            source: 'request',
            title: 'Request dibatalkan',
            description: `${engineerText} membatalkan request.`,
            timestamp,
            icon: 'cancel',
            color: Colors.textMuted,
            route: '/(admin)/review',
        };
    }

    const timestamp = row.submitted_at;
    if (!timestamp) return null;
    return {
        id: row.id,
        source: 'request',
        title: 'Request baru',
        description: `${engineerText} membuat request baru (pending).`,
        timestamp,
        icon: 'clock-outline',
        color: Colors.accent,
        route: '/(admin)/review',
    };
};

const fetchDashboardData = async (): Promise<DashboardData> => {
    const fetchUsageFeedRows = async () => {
        let response: any = await supabase
            .from('usage_reports')
            .select('id, engineer_id, so_number, date, created_at')
            .order('date', { ascending: false })
            .limit(20);

        if (response.error && isUsageReportsDateMissingError(response.error)) {
            response = await supabase
                .from('usage_reports')
                .select('id, engineer_id, so_number, created_at')
                .order('created_at', { ascending: false })
                .limit(20);
        }

        return response;
    };

    const [usersRes, notifRes, requestFeedRes, usageFeedRes, notificationFeedRes] = await Promise.all([
        supabase.from('profiles').select('id, name, role', { count: 'exact' }),
        supabase.from('notifications').select('id', { count: 'exact' }).eq('is_read', false),
        supabase
            .from('monthly_requests')
            .select('id, status, engineer_id, submitted_at, reviewed_at, delivered_at, confirmed_at, cancelled_at')
            .order('submitted_at', { ascending: false })
            .limit(20),
        fetchUsageFeedRows(),
        supabase
            .from('notifications')
            .select('id, title, body, created_at, is_read')
            .order('created_at', { ascending: false })
            .limit(20),
    ]);

    if (usersRes.error) throw usersRes.error;
    if (notifRes.error) throw notifRes.error;
    if (requestFeedRes.error) throw requestFeedRes.error;
    if (usageFeedRes.error) throw usageFeedRes.error;
    if (notificationFeedRes.error) throw notificationFeedRes.error;

    const profiles = (usersRes.data || []) as DashboardProfileRow[];
    const engineerNameMap = new Map(
        profiles
            .filter((p) => p.role === 'engineer')
            .map((p) => [p.id, p.name || ''])
    );
    const admins = profiles.filter((p: any) => p.role === 'admin').length;
    const engineers = profiles.filter((p: any) => p.role === 'engineer').length;

    const requestActivities = ((requestFeedRes.data || []) as DashboardRequestRow[])
        .map((row) => buildRequestActivity(row, engineerNameMap))
        .filter(isNonNull);

    const usageActivities = ((usageFeedRes.data || []) as DashboardUsageRow[])
        .map((row) => {
            const timestamp = row.date || row.created_at || null;
            if (!timestamp) return null;
            return {
                id: row.id,
                source: 'usage' as const,
                title: 'Laporan pemakaian baru',
                description: `SO ${row.so_number || '-'} dari ${engineerDisplayName(row.engineer_id, engineerNameMap)}.`,
                timestamp,
                icon: 'clipboard-text-clock-outline',
                color: Colors.primary,
                route: '/(admin)/analitik',
            };
        })
        .filter(isNonNull);

    const notificationActivities = ((notificationFeedRes.data || []) as DashboardNotificationRow[])
        .map((row) => {
            if (!row.created_at) return null;
            return {
                id: row.id,
                source: 'notification' as const,
                title: row.title || 'Notifikasi baru',
                description: row.body || (row.is_read ? 'Notifikasi sudah dibaca.' : 'Notifikasi belum dibaca.'),
                timestamp: row.created_at,
                icon: row.is_read ? 'bell-outline' : 'bell-ring-outline',
                color: row.is_read ? Colors.textSecondary : '#EC4899',
                route: '/notifications',
            };
        })
        .filter(isNonNull);

    const recentActivities = [...requestActivities, ...usageActivities, ...notificationActivities]
        .sort((a, b) => safeTimestamp(b.timestamp) - safeTimestamp(a.timestamp))
        .slice(0, 10);

    return {
        stats: {
            totalUsers: profiles.length,
            admins,
            engineers,
            notifications: notifRes.count || 0,
        },
        recentActivities,
    };
};

export default function DashboardPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const unreadCount = useUnreadCount();
    const { width } = useWindowDimensions();
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const isWide = width >= 768;

    const dashboardQuery = useQuery({
        queryKey: ['admin', 'dashboard'],
        queryFn: fetchDashboardData,
        enabled: !!user,
    });

    const stats = dashboardQuery.data?.stats || EMPTY_STATS;
    const recentActivities = dashboardQuery.data?.recentActivities || [];

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Selamat Pagi';
        if (h < 15) return 'Selamat Siang';
        if (h < 18) return 'Selamat Sore';
        return 'Selamat Malam';
    };

    useSupabaseRealtimeRefresh(
        ['profiles', 'notifications', 'monthly_requests', 'usage_reports'],
        () => {
            void dashboardQuery.refetch();
        },
        { enabled: !!user },
    );

    useEffect(() => {
        if (!dashboardQuery.error) return;
        const message = dashboardQuery.error instanceof Error ? dashboardQuery.error.message : 'Gagal memuat dashboard.';
        setError(message);
    }, [dashboardQuery.error]);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await dashboardQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    };

    const statCards = [
        { label: 'Total Users', value: stats.totalUsers, icon: 'account-group' as const, color: Colors.primary },
        { label: 'Admins', value: stats.admins, icon: 'shield-account' as const, color: Colors.info },
        { label: 'Engineers', value: stats.engineers, icon: 'account-hard-hat' as const, color: Colors.accent },
        { label: 'Notifications', value: stats.notifications, icon: 'bell' as const, color: '#EC4899' },
    ];

    const quickActions = [
        { label: 'Manage Users', icon: 'account-group' as const, color: Colors.info, path: '/(admin)/users' },
        { label: 'Review Requests', icon: 'clock-outline' as const, color: Colors.accent, path: '/(admin)/review' },
        { label: 'View Inventory', icon: 'package-variant-closed' as const, color: Colors.primary, path: '/(admin)/inventory' },
        { label: 'Analitik', icon: 'chart-line-variant' as const, color: '#A78BFA', path: '/(admin)/analitik' },
        { label: 'Generate Report', icon: 'file-chart' as const, color: Colors.success, path: '/(admin)/reports' },
    ];

    return (
        <>
            <ScrollView
                style={styles.container}
                indicatorStyle="black"
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            >
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <Text style={styles.greeting}>{greeting()}, {user?.name}!</Text>
                    <Text style={styles.headerSub}>Berikut adalah ringkasan aktivitas hari ini.</Text>
                </View>
                <View style={styles.headerActions}>
                    <NotificationBell unreadCount={unreadCount} onPress={() => router.push('/notifications' as any)} />
                </View>
            </View>

            {/* Stats */}
            <View style={styles.statsGrid}>
                {statCards.map((s, i) => (
                    <View key={i} style={[styles.statCard, { borderColor: s.color + '30' }]}>
                        <View style={styles.statHeader}>
                            <View style={[styles.statIcon, { backgroundColor: s.color + '15' }]}>
                                <MaterialCommunityIcons name={s.icon} size={24} color={s.color} />
                            </View>
                            {/* Dummy Trend Badge */}
                            <View style={[styles.trendBadge, { backgroundColor: s.color + '10' }]}>
                                <MaterialCommunityIcons name="arrow-up" size={12} color={s.color} />
                                <Text style={[styles.trendText, { color: s.color }]}>+2.4%</Text>
                            </View>
                        </View>
                        <Text style={styles.statValue}>{s.value}</Text>
                        <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                ))}
            </View>

            {/* Quick Actions */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Akses Cepat</Text>
                </View>
                <View style={styles.actionsGrid}>
                    {quickActions.map((a, i) => (
                        <Pressable key={i} style={styles.actionCard} onPress={() => router.push(a.path as any)}>
                            <View style={[styles.actionIcon, { backgroundColor: a.color + '15' }]}>
                                <MaterialCommunityIcons name={a.icon} size={24} color={a.color} />
                            </View>
                            <View style={styles.actionInfo}>
                                <Text style={styles.actionLabel}>{a.label}</Text>
                                <Text style={styles.actionDesc}>Manage & View</Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textMuted} style={styles.actionArrow} />
                        </Pressable>
                    ))}
                </View>
            </View>

            {/* Recent Activity */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Activity</Text>
                </View>
                <View style={styles.activityList}>
                    {recentActivities.length === 0 ? (
                        <View style={styles.activityEmpty}>
                            <MaterialCommunityIcons name="history" size={36} color={Colors.textMuted} />
                            <Text style={styles.activityEmptyText}>Belum ada aktivitas terbaru.</Text>
                        </View>
                    ) : (
                        recentActivities.map((activity) => (
                            <Pressable
                                key={`${activity.source}-${activity.id}`}
                                style={styles.activityCard}
                                onPress={() => router.push(activity.route as any)}
                            >
                                <View style={[styles.activityIcon, { backgroundColor: activity.color + '15' }]}>
                                    <MaterialCommunityIcons name={activity.icon as any} size={20} color={activity.color} />
                                </View>
                                <View style={styles.activityContent}>
                                    <Text style={styles.activityTitle} numberOfLines={1}>{activity.title}</Text>
                                    <Text style={styles.activityDesc} numberOfLines={2}>{activity.description}</Text>
                                </View>
                                <View style={styles.activityMeta}>
                                    <Text style={styles.activityTime}>{formatActivityTime(activity.timestamp)}</Text>
                                    <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
                                </View>
                            </Pressable>
                        ))
                    )}
                </View>
            </View>
            </ScrollView>
            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000} style={{ backgroundColor: Colors.danger }}>
                {error}
            </AppSnackbar>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    scrollContent: { padding: 20, paddingBottom: 40 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
    headerContent: { flex: 1 },
    greeting: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    headerSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 6, lineHeight: 20 },
    headerActions: { flexDirection: 'row', gap: 8 },
    notificationBtn: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },

    // Stats Section
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 32 },
    statCard: {
        flex: 1, minWidth: 200, backgroundColor: Colors.card, borderRadius: 20,
        padding: 20, borderWidth: 1, borderColor: Colors.border,
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12,
        elevation: 2,
    },
    statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    statIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100, backgroundColor: Colors.success + '15' },
    trendText: { fontSize: 11, fontWeight: '700', color: Colors.success },
    statValue: { fontSize: 36, fontWeight: '800', color: Colors.text, letterSpacing: -1 },
    statLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginTop: 4 },

    // Quick Actions
    section: { marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    sectionTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    actionCard: {
        flexDirection: 'row', alignItems: 'center', gap: 16,
        backgroundColor: Colors.card, borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: Colors.border,
        minWidth: 240, flex: 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4,
    },
    actionIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    actionInfo: { flex: 1 },
    actionLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
    actionDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    actionArrow: { marginLeft: 8 },

    // Recent Activity Section
    activityList: { gap: 10 },
    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: Colors.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 14,
    },
    activityIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activityContent: { flex: 1, gap: 2 },
    activityTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
    activityDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
    activityMeta: { alignItems: 'flex-end', gap: 4, marginLeft: 6 },
    activityTime: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
    activityEmpty: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 28,
        gap: 8,
    },
    activityEmptyText: { fontSize: 13, color: Colors.textMuted },
});
