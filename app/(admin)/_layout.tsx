import { useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView, useWindowDimensions, Platform, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { Slot, useRouter, usePathname } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { useAdminUiStore, ADMIN_SIDEBAR_COLLAPSED_WIDTH } from '../../src/stores/adminUiStore';

const menuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'view-dashboard' as const, path: '/(admin)/dashboard' },
    { key: 'users', label: 'Users', icon: 'account-group' as const, path: '/(admin)/users' },
    { key: 'inventory', label: 'Inventory', icon: 'package-variant-closed' as const, path: '/(admin)/inventory' },
    { key: 'review', label: 'Review', icon: 'clock-outline' as const, path: '/(admin)/review' },
    { key: 'approved', label: 'Approved', icon: 'check-circle-outline' as const, path: '/(admin)/approved' },
    { key: 'reports', label: 'Reports', icon: 'chart-bar' as const, path: '/(admin)/reports' },
    { key: 'analitik', label: 'Analitik', icon: 'chart-line-variant' as const, path: '/(admin)/analitik' },
    { key: 'broadcast', label: 'Broadcast', icon: 'bullhorn-outline' as const, path: '/(admin)/broadcast' },
    { key: 'akun', label: 'Akun', icon: 'account' as const, path: '/(admin)/admin-akun' },
];

export default function AdminLayout() {
    const { user } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const { width } = useWindowDimensions();
    const sidebarOpen = useAdminUiStore((state) => state.sidebarOpen);
    const setSidebarOpen = useAdminUiStore((state) => state.setSidebarOpen);
    const toggleSidebar = useAdminUiStore((state) => state.toggleSidebar);
    const isWide = width >= 768;

    useEffect(() => {
        if (!isWide) {
            setSidebarOpen(false);
        } else if (!sidebarOpen) {
            setSidebarOpen(true);
        }
    }, [isWide, setSidebarOpen]);

    const navigate = (path: string) => {
        router.push(path as any);
        if (!isWide) setSidebarOpen(false);
    };

    const activeKey = menuItems.find(m => pathname.includes(m.key))?.key || 'dashboard';

    const initials = (user?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    return (
        <View style={styles.root}>
            {/* Sidebar */}
            {!isWide && sidebarOpen && (
                <Pressable
                    onPress={() => setSidebarOpen(false)}
                    style={styles.backdrop}
                    accessibilityRole="button"
                    accessibilityLabel="Tutup sidebar"
                />
            )}

            {(isWide || sidebarOpen) && (
                <View style={[styles.sidebar, isWide && !sidebarOpen && styles.sidebarCollapsed, !isWide && styles.sidebarOverlay]}>
                    {isWide && !sidebarOpen ? (
                        <View style={styles.collapsedRail}>
                            <Pressable
                                onPress={toggleSidebar}
                                style={styles.sidebarToggle}
                                accessibilityRole="button"
                                accessibilityLabel="Buka sidebar"
                            >
                                <MaterialCommunityIcons
                                    name="chevron-right"
                                    size={20}
                                    color={Colors.textSecondary}
                                />
                            </Pressable>
                        </View>
                    ) : (
                        <>
                            <View style={styles.brand}>
                                <View style={styles.brandIcon}>
                                    <Image source={require('../../assets/logo.png')} style={styles.brandIconImage} resizeMode="cover" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.brandTitle}>BabyPart</Text>
                                    <Text style={styles.brandSub}>Admin Panel</Text>
                                </View>
                                <Pressable
                                    onPress={toggleSidebar}
                                    style={styles.sidebarToggle}
                                    accessibilityRole="button"
                                    accessibilityLabel={isWide ? 'Collapse sidebar' : 'Tutup sidebar'}
                                >
                                    <MaterialCommunityIcons
                                        name={isWide ? 'chevron-left' : 'close'}
                                        size={20}
                                        color={Colors.textSecondary}
                                    />
                                </Pressable>
                            </View>

                            <ScrollView style={styles.menu} indicatorStyle="black">
                                {menuItems.map(item => (
                                    <Pressable
                                        key={item.key}
                                        style={[styles.menuItem, activeKey === item.key && styles.menuItemActive]}
                                        onPress={() => navigate(item.path)}
                                    >
                                        <MaterialCommunityIcons
                                            name={item.icon}
                                            size={20}
                                            color={activeKey === item.key ? Colors.primary : Colors.textMuted}
                                        />
                                        <Text style={[styles.menuLabel, activeKey === item.key && styles.menuLabelActive]}>
                                            {item.label}
                                        </Text>
                                    </Pressable>
                                ))}
                            </ScrollView>

                            <View style={styles.userCard}>
                                <View style={styles.userAvatar}>
                                    <Text style={styles.userAvatarText}>{initials}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.userName} numberOfLines={1}>{user?.name}</Text>
                                    <Text style={styles.userRole}>Admin</Text>
                                </View>
                            </View>
                        </>
                    )}
                </View>
            )}

            {/* Main Content */}
            <View style={styles.main}>
                {!isWide && (
                    <Pressable style={styles.hamburger} onPress={() => setSidebarOpen(!sidebarOpen)}>
                        <MaterialCommunityIcons name={sidebarOpen ? 'close' : 'menu'} size={24} color={Colors.text} />
                    </Pressable>
                )}
                <Slot />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, flexDirection: 'row', backgroundColor: Colors.bg },
    backdrop: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: 'rgba(0,0,0,0.28)',
        zIndex: 90,
    },
    sidebar: {
        width: 240,
        backgroundColor: Colors.card,
        borderRightWidth: 1,
        borderRightColor: Colors.border,
        paddingTop: Platform.OS === 'web' ? 20 : 48,
    },
    sidebarCollapsed: {
        width: ADMIN_SIDEBAR_COLLAPSED_WIDTH,
        paddingTop: Platform.OS === 'web' ? 20 : 48,
    },
    sidebarOverlay: {
        position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 100, elevation: 10,
        shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.25, shadowRadius: 3.84,
    },
    collapsedRail: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 6,
    },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, marginBottom: 10 },
    brandIcon: {
        width: 44, height: 44, borderRadius: 12, backgroundColor: 'transparent',
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4,
    },
    brandIconImage: { width: '100%', height: '100%', transform: [{ scale: 1.62 }] },
    brandTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: 0.5 },
    brandSub: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
    sidebarToggle: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    menu: { flex: 1, paddingHorizontal: 12 },
    menuItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 4,
    },
    menuItemActive: { backgroundColor: Colors.primary + '15' },
    menuLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
    menuLabelActive: { color: Colors.primary, fontWeight: '700' },
    userCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        margin: 16, padding: 16, borderRadius: 16, backgroundColor: Colors.surface,
        borderWidth: 1, borderColor: Colors.border,
    },
    userAvatar: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + '20',
        justifyContent: 'center', alignItems: 'center',
    },
    userAvatarText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
    userName: { fontSize: 14, fontWeight: '700', color: Colors.text },
    userRole: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    main: { flex: 1, backgroundColor: Colors.bg },
    hamburger: { padding: 16, paddingTop: Platform.OS === 'web' ? 16 : 48 },
});
