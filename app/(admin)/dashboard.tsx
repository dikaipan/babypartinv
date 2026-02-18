import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, useWindowDimensions, AppState } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import NotificationBell from '../../src/components/NotificationBell';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { useWebAutoRefresh } from '../../src/hooks/useWebAutoRefresh';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/config/supabase';
import { useAdminUiStore, ADMIN_SIDEBAR_WIDTH, ADMIN_SIDEBAR_COLLAPSED_WIDTH } from '../../src/stores/adminUiStore';

export default function DashboardPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const unreadCount = useUnreadCount();
    const { width } = useWindowDimensions();
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ totalUsers: 0, admins: 0, engineers: 0, notifications: 0 });
    const [kpi, setKpi] = useState<any>(null);
    const [error, setError] = useState('');
    const isWide = width >= 768;
    const sidebarOpen = useAdminUiStore((state) => state.sidebarOpen);
    const sidebarWidth = isWide ? (sidebarOpen ? ADMIN_SIDEBAR_WIDTH : ADMIN_SIDEBAR_COLLAPSED_WIDTH) : 0;
    const effectiveWidth = width - sidebarWidth;

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Selamat Pagi';
        if (h < 15) return 'Selamat Siang';
        if (h < 18) return 'Selamat Sore';
        return 'Selamat Malam';
    };

    const load = useCallback(async () => {
        try {
            const [usersRes, notifRes, kpiRes] = await Promise.all([
                supabase.from('profiles').select('role', { count: 'exact' }),
                supabase.from('notifications').select('id', { count: 'exact' }).eq('is_read', false),
                supabase.rpc('admin_kpi_summary'),
            ]);

            if (usersRes.error) throw usersRes.error;
            if (notifRes.error) throw notifRes.error;
            if (kpiRes.error) throw kpiRes.error;

            const profiles = usersRes.data || [];
            const adminCount = profiles.filter((p: any) => p.role === 'admin').length;
            const engineerCount = profiles.filter((p: any) => p.role === 'engineer').length;

            setStats({
                totalUsers: profiles.length,
                admins: adminCount,
                engineers: engineerCount,
                notifications: notifRes.count || 0,
            });

            if (kpiRes.data) setKpi(Array.isArray(kpiRes.data) ? kpiRes.data[0] : kpiRes.data);
            setError('');
        } catch (err: any) {
            setError(err?.message || 'Gagal memuat dashboard.');
        }
    }, []);

    // Reload when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    useEffect(() => {
        load();
    }, [load]);
    useWebAutoRefresh(load);

    // Reload when app comes from background to active (e.g. idle tab wake)
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                load();
            }
        });
        return () => subscription.remove();
    }, [load]);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await load();
        } finally {
            setRefreshing(false);
        }
    };

    const cardWidth = isWide ? (effectiveWidth - 40) / 4 - 16 : (width - 48) / 2 - 8;

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

            {/* KPI Summary */}
            {kpi && (
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>KPI Summary</Text>
                    </View>
                    <View style={styles.kpiGrid}>
                        {Object.entries(kpi).map(([key, val], i) => (
                            <View key={i} style={styles.kpiCard}>
                                <Text style={styles.kpiValue}>{String(val)}</Text>
                                <Text style={styles.kpiLabel}>{key.replace(/_/g, ' ')}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}
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

    // KPI Section
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    kpiCard: {
        backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: Colors.border, minWidth: 160, flex: 1,
    },
    kpiValue: { fontSize: 24, fontWeight: '700', color: Colors.primary },
    kpiLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, textTransform: 'capitalize' },
});
