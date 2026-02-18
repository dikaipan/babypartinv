import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import { useAuthStore } from '../../src/stores/authStore';

export default function AdminAkunPage() {
    const { user, signOut } = useAuthStore();
    const initials = (user?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const profileRows = [
        { key: 'name', icon: 'account-outline', label: 'Nama', value: user?.name || '-' },
        { key: 'id', icon: 'badge-account-outline', label: 'ID Karyawan', value: user?.employee_id || '-' },
        { key: 'email', icon: 'email-outline', label: 'Email', value: user?.email || '-' },
        { key: 'role', icon: 'shield-account-outline', label: 'Role', value: 'ADMIN' },
    ];

    return (
        <View style={styles.container}>
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
                <Text style={styles.footerCopy}>© 2026 Babyparts Inventory. Developed by Handika</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, padding: 20 },
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
    actions: { marginTop: 32 },
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
    footerCopy: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
});
