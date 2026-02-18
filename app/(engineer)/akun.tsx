import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { syncPushIdentity } from '../../src/config/onesignal';

export default function AkunPage() {
    const { user, signOut } = useAuthStore();
    const insets = useSafeAreaInsets();
    const [syncingPush, setSyncingPush] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [oneSignalId, setOneSignalId] = useState<string | null>(null);
    const [pushToken, setPushToken] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const hydratePushStatus = async () => {
            if (!user?.id) return;
            try {
                const result = await syncPushIdentity(user.id, { requestPermission: false });
                if (!active) return;
                if (!result.supported) {
                    setOneSignalId('Web Browser (Not supported)');
                    setPushToken('Web Browser (Not supported)');
                    return;
                }

                setOneSignalId(result.oneSignalId || 'None (Not registered)');
                setPushToken(result.pushToken || 'No push token');
            } catch (e) {
                if (!active) return;
                setOneSignalId('Failed to auto-sync');
                setPushToken('Failed to auto-sync');
            }
        };

        void hydratePushStatus();

        return () => {
            active = false;
        };
    }, [user?.id]);

    const handleSyncPushIdentity = async () => {
        if (!user?.id || syncingPush) return;
        setSyncingPush(true);
        setSyncMessage('');
        try {
            const result = await syncPushIdentity(user.id);
            if (!result.supported) {
                setOneSignalId('Web Browser (Not supported)');
                setPushToken('Web Browser (Not supported)');
                setSyncMessage('Push identity tidak didukung pada web browser.');
                return;
            }

            setOneSignalId(result.oneSignalId || 'None (Not registered)');
            setPushToken(result.pushToken || 'No push token');
            setSyncMessage(
                result.permissionGranted
                    ? 'Push identity tersinkron. Android siap menerima push.'
                    : 'Sinkron selesai, tapi izin notifikasi belum aktif.',
            );
        } catch (e: any) {
            setSyncMessage(e?.message || 'Gagal sinkron push identity.');
        } finally {
            setSyncingPush(false);
        }
    };

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
                <Pressable style={[styles.actionCard, syncingPush && styles.actionCardDisabled]} onPress={handleSyncPushIdentity} disabled={syncingPush}>
                    <View style={[styles.actionIcon, { backgroundColor: Colors.info + '20' }]}>
                        <MaterialCommunityIcons name="sync" size={22} color={Colors.info} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.actionTitle}>Sync Push Identity</Text>
                        <Text style={styles.actionDesc}>{syncingPush ? 'Menyinkronkan push identity...' : 'Sinkron otomatis aktif. Tekan untuk retry manual.'}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textMuted} />
                </Pressable>
                {!!syncMessage && <Text style={styles.syncMessage}>{syncMessage}</Text>}
                {!!oneSignalId && <Text style={styles.debugText}>OneSignal ID: {oneSignalId}</Text>}
                {!!pushToken && <Text style={styles.debugText}>Push Token: {pushToken}</Text>}

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
    actionCardDisabled: { opacity: 0.7 },
    actionIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    actionTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
    actionDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    syncMessage: { marginTop: -4, marginLeft: 4, fontSize: 12, color: Colors.info },
    debugText: { marginTop: -6, marginLeft: 4, fontSize: 11, color: Colors.textMuted },
    footer: { alignItems: 'center', marginTop: 'auto', paddingVertical: 24 },
    footerText: { fontSize: 14, color: Colors.textMuted },
    footerVersion: { fontSize: 12, color: Colors.textMuted },
    footerCopy: { fontSize: 11, color: Colors.textMuted, marginTop: 8 },
    devRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    footerDev: { fontSize: 12, color: Colors.textMuted },
});
