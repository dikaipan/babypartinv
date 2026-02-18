import { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Avatar, Divider, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { OneSignal } from 'react-native-onesignal';

export default function AkunPage() {
    const { user, signOut } = useAuthStore();
    const insets = useSafeAreaInsets();
    const [oneSignalId, setOneSignalId] = useState<string | null>(null);

    useEffect(() => {
        const checkStatus = async () => {
            if (Platform.OS !== 'web') {
                try {
                    const id = await OneSignal.User.getOnesignalId();
                    setOneSignalId(id || 'None (Not registered)');
                } catch (e) {
                    setOneSignalId('Error fetching ID');
                }
            } else {
                setOneSignalId('Web Browser (Not supported)');
            }
        };
        checkStatus();
    }, []);

    const initials = (user?.name || '?')
        .split(' ')
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.header}>
                <Text style={styles.pageTitle}>Akun</Text>
            </View>

            {/* Profile */}
            <View style={styles.profileSection}>
                <View style={styles.avatarContainer}>
                    <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <Text style={styles.name}>{user?.name}</Text>
                <Text style={styles.employeeId}>ID: {user?.employee_id || '-'}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>{(user?.role || 'engineer').toUpperCase()}</Text>
                </View>
                {user?.location && (
                    <View style={styles.locationRow}>
                        <MaterialCommunityIcons name="map-marker" size={14} color={Colors.textSecondary} />
                        <Text style={styles.locationText}>{user.location}</Text>
                    </View>
                )}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
                <Pressable style={styles.actionCard} onPress={() => { }}>
                    <View style={[styles.actionIcon, { backgroundColor: Colors.info + '20' }]}>
                        <MaterialCommunityIcons name="sync" size={22} color={Colors.info} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.actionTitle}>Sync Push Identity</Text>
                        <Text style={styles.actionDesc}>Sinkronkan push notification ke akun</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textMuted} />
                </Pressable>

                <Pressable style={styles.actionCard} onPress={signOut}>
                    <View style={[styles.actionIcon, { backgroundColor: Colors.danger + '20' }]}>
                        <MaterialCommunityIcons name="logout" size={22} color={Colors.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.actionTitle}>Logout</Text>
                        <Text style={styles.actionDesc}>Keluar dari aplikasi</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textMuted} />
                </Pressable>
            </View>

            {/* Diagnostics */}
            <View style={[styles.actions, { marginTop: 24, paddingBottom: 10 }]}>
                <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: 8, marginLeft: 4 }}>DEBUG INFO</Text>
                <View style={styles.actionCard}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.actionTitle}>OneSignal ID</Text>
                        <Text style={[styles.actionDesc, { fontSize: 10 }]} selectable>{oneSignalId || 'Loading...'}</Text>
                    </View>
                    <MaterialCommunityIcons
                        name={oneSignalId && oneSignalId !== 'Not available' ? "check-circle" : "alert-circle"}
                        size={20}
                        color={oneSignalId && oneSignalId !== 'Not available' ? Colors.success : Colors.danger}
                    />
                </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>Babypart Inventory</Text>
                <Text style={styles.footerVersion}>Version 1.0.3</Text>
                <Text style={styles.footerCopy}>© 2026 Babyparts Inventory. All rights reserved.</Text>
                <View style={styles.devRow}>
                    <MaterialCommunityIcons name="code-tags" size={14} color={Colors.textMuted} />
                    <Text style={styles.footerDev}>Developed by Handika</Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 16 },
    header: { alignItems: 'center', marginBottom: 8 },
    pageTitle: { fontSize: 18, fontWeight: '600', color: Colors.text },
    profileSection: { alignItems: 'center', marginTop: 16 },
    avatarContainer: {
        width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primary + '30',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    avatarText: { fontSize: 32, fontWeight: '700', color: Colors.primary },
    name: { fontSize: 22, fontWeight: '700', color: Colors.text },
    employeeId: { fontSize: 14, color: Colors.primary, marginTop: 4 },
    email: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
    roleBadge: {
        backgroundColor: Colors.primary + '20', paddingHorizontal: 16, paddingVertical: 6,
        borderRadius: 20, marginTop: 12,
    },
    roleText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    locationText: { fontSize: 13, color: Colors.textSecondary },
    actions: { marginTop: 32, gap: 12 },
    actionCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: Colors.card, borderRadius: 12, padding: 16,
        borderWidth: 1, borderColor: Colors.border,
    },
    actionIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    actionTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
    actionDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    footer: { alignItems: 'center', marginTop: 'auto', paddingVertical: 24 },
    footerText: { fontSize: 14, color: Colors.textMuted },
    footerVersion: { fontSize: 12, color: Colors.textMuted },
    footerCopy: { fontSize: 11, color: Colors.textMuted, marginTop: 8 },
    devRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    footerDev: { fontSize: 12, color: Colors.textMuted },
});
