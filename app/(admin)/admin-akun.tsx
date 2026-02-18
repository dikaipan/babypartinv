import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { syncPushIdentity } from '../../src/config/onesignal';

export default function AdminAkunPage() {
    const { user, signOut } = useAuthStore();
    const [syncingPush, setSyncingPush] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [oneSignalId, setOneSignalId] = useState<string | null>(null);
    const [pushToken, setPushToken] = useState<string | null>(null);

    const initials = (user?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    useEffect(() => {
        let active = true;

        const hydratePushStatus = async () => {
            if (!user?.id) return;
            try {
                const result = await syncPushIdentity(user.id, { requestPermission: false });
                if (!active) return;
                if (!result.supported) {
                    setOneSignalId('Push service not available');
                    setPushToken('Push service not available');
                    return;
                }

                setOneSignalId(result.oneSignalId || 'None (Not registered)');
                setPushToken(result.pushToken || 'No push token');
            } catch {
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
                setOneSignalId('Push service not available');
                setPushToken('Push service not available');
                setSyncMessage('Push identity tidak tersedia di device/browser ini.');
                return;
            }

            setOneSignalId(result.oneSignalId || 'None (Not registered)');
            setPushToken(result.pushToken || 'No push token');
            setSyncMessage(
                result.permissionGranted
                    ? 'Push identity tersinkron. Device/browser siap menerima push.'
                    : 'Sinkron selesai, tapi izin notifikasi belum aktif.',
            );
        } catch (e: any) {
            setSyncMessage(e?.message || 'Gagal sinkron push identity.');
        } finally {
            setSyncingPush(false);
        }
    };

    const profileRows = [
        { key: 'name', icon: 'account-outline', label: 'Nama', value: user?.name || '-' },
        { key: 'id', icon: 'badge-account-outline', label: 'ID Karyawan', value: user?.employee_id || '-' },
        { key: 'email', icon: 'email-outline', label: 'Email', value: user?.email || '-' },
        { key: 'role', icon: 'shield-account-outline', label: 'Role', value: 'ADMIN' },
    ];

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Akun</Text>
            <View style={styles.profileSection}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
                <View style={styles.roleBadge}><Text style={styles.roleText}>ADMIN</Text></View>
            </View>

            <View style={styles.infoCard}>
                {profileRows.map((item, idx) => (
                    <View
                        key={item.key}
                        style={[styles.infoRow, idx !== profileRows.length - 1 && styles.infoRowDivider]}
                    >
                        <View style={styles.infoLeft}>
                            <MaterialCommunityIcons name={item.icon as any} size={16} color={Colors.textSecondary} />
                            <Text style={styles.infoLabel}>{item.label}</Text>
                        </View>
                        <Text style={styles.infoValue} numberOfLines={1}>{item.value}</Text>
                    </View>
                ))}
            </View>

            <View style={styles.actions}>
                <Pressable
                    style={[styles.actionCard, syncingPush && styles.actionCardDisabled]}
                    onPress={handleSyncPushIdentity}
                    disabled={syncingPush}
                >
                    <View style={[styles.actionIcon, { backgroundColor: Colors.info + '20' }]}>
                        <MaterialCommunityIcons name="sync" size={22} color={Colors.info} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.actionTitle}>Sync Push Identity</Text>
                        <Text style={styles.actionDesc}>{syncingPush ? 'Menyinkronkan push identity...' : 'Sinkron otomatis aktif. Tekan untuk retry manual.'}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textMuted} />
                </Pressable>

                {(!!syncMessage || !!oneSignalId || !!pushToken) && (
                    <View style={styles.pushMetaCard}>
                        {!!syncMessage && <Text style={styles.syncMessage}>{syncMessage}</Text>}
                        {!!oneSignalId && (
                            <View style={styles.pushMetaRow}>
                                <Text style={styles.pushMetaLabel}>OneSignal ID</Text>
                                <Text style={styles.pushMetaValue} numberOfLines={1}>{oneSignalId}</Text>
                            </View>
                        )}
                        {!!pushToken && (
                            <View style={styles.pushMetaRow}>
                                <Text style={styles.pushMetaLabel}>Push Token</Text>
                                <Text style={styles.pushMetaValue} numberOfLines={1}>{pushToken}</Text>
                            </View>
                        )}
                    </View>
                )}

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

            <View style={styles.footer}>
                <Text style={styles.footerText}>Babypart Inventory v1.0.3</Text>
                <Text style={styles.footerCopy}>(c) 2026 Babyparts Inventory. Developed by Handika</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    content: { padding: 20, paddingBottom: 24 },
    title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 24, textAlign: 'center' },
    profileSection: { alignItems: 'center' },
    avatar: {
        width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primary + '30',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    avatarText: { fontSize: 32, fontWeight: '700', color: Colors.primary },
    roleBadge: { backgroundColor: Colors.info + '20', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
    roleText: { fontSize: 12, fontWeight: '700', color: Colors.info },
    infoCard: {
        marginTop: 20,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 12,
        paddingHorizontal: 14,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 13,
        gap: 12,
    },
    infoRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
    infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
    infoLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
    infoValue: { flex: 1, textAlign: 'right', fontSize: 13, color: Colors.text, fontWeight: '600' },
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
    pushMetaCard: {
        marginTop: -4,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 10,
        backgroundColor: Colors.surface,
        padding: 10,
        gap: 8,
    },
    syncMessage: { fontSize: 12, color: Colors.info },
    pushMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    pushMetaLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
    pushMetaValue: { flex: 1, textAlign: 'right', fontSize: 11, color: Colors.textSecondary },
    footer: { alignItems: 'center', marginTop: 'auto', paddingVertical: 24 },
    footerText: { fontSize: 14, color: Colors.textMuted },
    footerCopy: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
});
