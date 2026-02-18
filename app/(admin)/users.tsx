import { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, useWindowDimensions, Platform, ScrollView } from 'react-native';
import { Text, Searchbar, Chip, IconButton, Portal, Modal, TextInput, Button, Menu, Divider } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import { supabase } from '../../src/config/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import { Profile } from '../../src/types';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { adminStyles } from '../../src/styles/adminStyles';
import { useAdminUiStore, ADMIN_SIDEBAR_WIDTH, ADMIN_SIDEBAR_COLLAPSED_WIDTH } from '../../src/stores/adminUiStore';

type UserFormState = {
    name: string;
    email: string;
    employee_id: string;
    location: string;
    role: 'admin' | 'engineer';
    is_active: boolean;
};

const EMAIL_REGEX = /\S+@\S+\.\S+/;

const mapProfileToForm = (profile: Profile): UserFormState => ({
    name: profile.name || '',
    email: profile.email || '',
    employee_id: profile.employee_id || '',
    location: profile.location || '',
    role: profile.role,
    is_active: profile.is_active,
});

const fetchUsers = async (): Promise<Profile[]> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, location, employee_id, is_active')
        .order('name');
    if (error) throw error;
    return data || [];
};

export default function UsersPage() {
    const { width, height } = useWindowDimensions();
    const { user: currentUser, refreshProfile } = useAuthStore();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'admin' | 'engineer'>('all');
    const [selectedLocation, setSelectedLocation] = useState<string>('all');
    const [showLocationMenu, setShowLocationMenu] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [showManageModal, setShowManageModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const [userForm, setUserForm] = useState<UserFormState>({
        name: '',
        email: '',
        employee_id: '',
        location: '',
        role: 'engineer',
        is_active: true,
    });
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [savingUser, setSavingUser] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [deletingUser, setDeletingUser] = useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const isWide = width >= 768;
    const sidebarOpen = useAdminUiStore((state) => state.sidebarOpen);
    const sidebarWidth = isWide ? (sidebarOpen ? ADMIN_SIDEBAR_WIDTH : ADMIN_SIDEBAR_COLLAPSED_WIDTH) : 0;
    const effectiveWidth = width - sidebarWidth;
    const numColumns = isWide ? 4 : 1; // 4 cols for users on wide screen
    const cardGap = 16;
    const cardWidth = (effectiveWidth - 40 - (cardGap * (numColumns - 1))) / numColumns;
    const usersQuery = useQuery({
        queryKey: ['admin', 'users'],
        queryFn: fetchUsers,
        enabled: !!currentUser,
    });
    const users = usersQuery.data || [];

    useSupabaseRealtimeRefresh(
        ['profiles'],
        () => {
            void usersQuery.refetch();
        },
        { enabled: !!currentUser },
    );

    useEffect(() => {
        if (!usersQuery.error) return;
        const message = usersQuery.error instanceof Error ? usersQuery.error.message : 'Gagal memuat users.';
        setError(message);
    }, [usersQuery.error]);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await usersQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    };

    const openManageUser = (profile: Profile) => {
        setSelectedUser(profile);
        setUserForm(mapProfileToForm(profile));
        setNewPassword('');
        setConfirmPassword('');
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setShowDeleteConfirm(false);
        setShowManageModal(true);
    };

    const closeManageModal = () => {
        setShowManageModal(false);
        setSelectedUser(null);
        setShowDeleteConfirm(false);
        setNewPassword('');
        setConfirmPassword('');
        setShowNewPassword(false);
        setShowConfirmPassword(false);
    };

    const saveUser = async () => {
        if (!selectedUser || savingUser) return;

        const name = userForm.name.trim();
        const email = userForm.email.trim().toLowerCase();

        if (!name || !email) {
            setError('Nama dan email wajib diisi.');
            return;
        }
        if (!EMAIL_REGEX.test(email)) {
            setError('Format email tidak valid.');
            return;
        }

        setSavingUser(true);
        try {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    name,
                    email,
                    employee_id: userForm.employee_id.trim() || null,
                    location: userForm.location.trim() || null,
                    role: userForm.role,
                    is_active: userForm.is_active,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', selectedUser.id);

            if (updateError) throw updateError;

            if (currentUser?.id === selectedUser.id) {
                await refreshProfile();
            }
            await usersQuery.refetch();
            setSuccess('Data user berhasil diperbarui.');
            closeManageModal();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal memperbarui data user.';
            setError(message);
        } finally {
            setSavingUser(false);
        }
    };

    const sendPasswordReset = async () => {
        if (!selectedUser || sendingReset) return;

        const targetEmail = userForm.email.trim().toLowerCase();
        if (!EMAIL_REGEX.test(targetEmail)) {
            setError('Email user tidak valid untuk reset password.');
            return;
        }

        setSendingReset(true);
        try {
            const baseUrl = Platform.OS === 'web' ? window.location.origin : 'https://babypartinv.pages.dev';
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
                redirectTo: `${baseUrl}/reset-password.html`,
            });
            if (resetError) throw resetError;
            setSuccess(`Email reset password berhasil dikirim ke ${targetEmail}.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal mengirim reset password.';
            setError(message);
        } finally {
            setSendingReset(false);
        }
    };

    const updatePassword = async () => {
        if (!selectedUser || savingPassword) return;

        if (currentUser?.id !== selectedUser.id) {
            setError('Edit password langsung hanya untuk akun yang sedang login. Untuk user lain, gunakan reset password.');
            return;
        }

        const password = newPassword.trim();
        const confirmation = confirmPassword.trim();
        if (password.length < 6) {
            setError('Password minimal 6 karakter.');
            return;
        }
        if (password !== confirmation) {
            setError('Konfirmasi password tidak cocok.');
            return;
        }

        setSavingPassword(true);
        try {
            const { error: updatePasswordError } = await supabase.auth.updateUser({ password });
            if (updatePasswordError) throw updatePasswordError;

            setNewPassword('');
            setConfirmPassword('');
            setSuccess('Password berhasil diperbarui.');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal mengubah password.';
            setError(message);
        } finally {
            setSavingPassword(false);
        }
    };

    const deleteUser = async () => {
        if (!selectedUser || deletingUser) return;

        if (currentUser?.id === selectedUser.id) {
            setError('Akun sendiri tidak bisa dihapus.');
            return;
        }

        setDeletingUser(true);
        try {
            const { error: deleteError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', selectedUser.id);

            if (deleteError) throw deleteError;

            await usersQuery.refetch();
            setSuccess(`User ${selectedUser.name} berhasil dihapus.`);
            closeManageModal();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal menghapus user.';
            setError(message);
        } finally {
            setDeletingUser(false);
        }
    };

    const locations = Array.from(new Set(users.map(u => u.location).filter(Boolean) as string[])).sort();

    const filtered = users.filter(u => {
        const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase()) ||
            (u.employee_id || '').toLowerCase().includes(search.toLowerCase());
        if (selectedLocation !== 'all' && u.location !== selectedLocation) return false;
        if (filter === 'all') return matchSearch;
        return matchSearch && u.role === filter;
    });

    return (
        <View style={adminStyles.container}>
            <View style={adminStyles.header}>
                <View>
                    <Text style={adminStyles.headerTitle}>Users</Text>
                    <Text style={adminStyles.headerSub}>{users.length} total users</Text>
                </View>
                <Button mode="outlined" icon="refresh" onPress={onRefresh} compact>
                    Reload
                </Button>
            </View>

            <View style={adminStyles.controls}>
                <Searchbar
                    placeholder="Search users..."
                    value={search} onChangeText={setSearch}
                    style={styles.search} inputStyle={{ color: Colors.text }}
                    iconColor={Colors.textMuted} placeholderTextColor={Colors.textMuted}
                />
                <View style={styles.filters}>
                    <Menu
                        visible={showLocationMenu}
                        onDismiss={() => setShowLocationMenu(false)}
                        anchor={
                            <Button
                                mode="outlined"
                                onPress={() => setShowLocationMenu(true)}
                                style={styles.filterButton}
                                contentStyle={{ flexDirection: 'row-reverse' }}
                                icon="chevron-down"
                                compact
                            >
                                {selectedLocation === 'all' ? 'All Areas' : selectedLocation}
                            </Button>
                        }
                    >
                        <Menu.Item onPress={() => { setSelectedLocation('all'); setShowLocationMenu(false); }} title="All Areas" />
                        <Divider />
                        {locations.map(loc => (
                            <Menu.Item key={loc} onPress={() => { setSelectedLocation(loc); setShowLocationMenu(false); }} title={loc} />
                        ))}
                    </Menu>

                    {(['all', 'admin', 'engineer'] as const).map(f => (
                        <Chip
                            key={f}
                            selected={filter === f}
                            onPress={() => setFilter(f)}
                            style={[styles.chip, filter === f && styles.chipActive]}
                            textStyle={[styles.chipText, filter === f && styles.chipTextActive]}
                            showSelectedOverlay={true}
                        >
                            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </Chip>
                    ))}
                </View>
            </View>

            <FlatList
                key={numColumns}
                data={filtered}
                keyExtractor={u => u.id}
                numColumns={numColumns}
                indicatorStyle="black"
                columnWrapperStyle={isWide ? { gap: cardGap } : undefined}
                contentContainerStyle={adminStyles.scrollContent}
                ItemSeparatorComponent={() => <View style={{ height: cardGap }} />}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                renderItem={({ item: u }) => (
                    <View style={[adminStyles.card, { width: cardWidth }]}>
                        <View style={adminStyles.cardHeader}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{u.name[0]?.toUpperCase()}</Text>
                            </View>
                            <View style={[styles.roleBadge, {
                                backgroundColor: u.role === 'admin' ? Colors.info + '15' : Colors.primary + '15',
                                borderColor: u.role === 'admin' ? Colors.info + '30' : Colors.primary + '30'
                            }]}>
                                <Text style={[styles.roleText, { color: u.role === 'admin' ? Colors.info : Colors.primary }]}>
                                    {u.role}
                                </Text>
                            </View>
                        </View>

                        <View style={adminStyles.cardBody}>
                            <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                            <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
                            {u.employee_id && (
                                <View style={styles.idBadge}>
                                    <MaterialCommunityIcons name="card-account-details-outline" size={14} color={Colors.textMuted} />
                                    <Text style={styles.empId}>{u.employee_id}</Text>
                                </View>
                            )}
                        </View>

                        <View style={adminStyles.cardFooter}>
                            <View style={styles.statusRow}>
                                <View style={[styles.statusDot, { backgroundColor: u.is_active ? Colors.success : Colors.textMuted }]} />
                                <Text style={[styles.statusText, { color: u.is_active ? Colors.success : Colors.textMuted }]}>
                                    {u.is_active ? 'Active' : 'Inactive'}
                                </Text>
                            </View>
                            <IconButton
                                icon="account-cog-outline"
                                size={20}
                                iconColor={Colors.textSecondary}
                                onPress={() => openManageUser(u)}
                            />
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <View style={adminStyles.emptyState}>
                        <MaterialCommunityIcons name="account-search-outline" size={48} color={Colors.textMuted} />
                        <Text style={adminStyles.emptyText}>User tidak ditemukan.</Text>
                    </View>
                }
            />

            <Portal>
                <Modal
                    visible={showManageModal}
                    onDismiss={closeManageModal}
                    contentContainerStyle={[styles.modal, { maxHeight: Math.max(460, height - 40) }]}
                >
                    {selectedUser ? (
                        <>
                            <View style={styles.modalHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.modalTitle}>Kelola User</Text>
                                    <Text style={styles.modalCaption} numberOfLines={1}>
                                        {selectedUser.id}
                                    </Text>
                                </View>
                                <IconButton icon="close" size={22} onPress={closeManageModal} />
                            </View>
                            <ScrollView
                                style={styles.modalScroll}
                                showsVerticalScrollIndicator={false}
                                indicatorStyle="black"
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={styles.modalContent}
                            >

                                <TextInput
                                    label="Nama"
                                    value={userForm.name}
                                    onChangeText={(value) => setUserForm((prev) => ({ ...prev, name: value }))}
                                    mode="outlined"
                                    style={styles.input}
                                />
                                <TextInput
                                    label="Email"
                                    value={userForm.email}
                                    onChangeText={(value) => setUserForm((prev) => ({ ...prev, email: value }))}
                                    mode="outlined"
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    style={styles.input}
                                />
                                <TextInput
                                    label="ID Engineer"
                                    value={userForm.employee_id}
                                    onChangeText={(value) => setUserForm((prev) => ({ ...prev, employee_id: value }))}
                                    mode="outlined"
                                    style={styles.input}
                                />
                                <TextInput
                                    label="Area Group"
                                    value={userForm.location}
                                    onChangeText={(value) => setUserForm((prev) => ({ ...prev, location: value }))}
                                    mode="outlined"
                                    style={styles.input}
                                />

                                <View style={styles.optionRow}>
                                    <Chip
                                        mode={userForm.role === 'engineer' ? 'flat' : 'outlined'}
                                        selected={userForm.role === 'engineer'}
                                        onPress={() => setUserForm((prev) => ({ ...prev, role: 'engineer' }))}
                                        style={[styles.optionChip, userForm.role === 'engineer' && styles.optionChipActive]}
                                        textStyle={[styles.optionText, userForm.role === 'engineer' && styles.optionTextActive]}
                                    >
                                        Engineer
                                    </Chip>
                                    <Chip
                                        mode={userForm.role === 'admin' ? 'flat' : 'outlined'}
                                        selected={userForm.role === 'admin'}
                                        onPress={() => setUserForm((prev) => ({ ...prev, role: 'admin' }))}
                                        style={[styles.optionChip, userForm.role === 'admin' && styles.optionChipActive]}
                                        textStyle={[styles.optionText, userForm.role === 'admin' && styles.optionTextActive]}
                                    >
                                        Admin
                                    </Chip>
                                    <Chip
                                        mode={userForm.is_active ? 'flat' : 'outlined'}
                                        selected={userForm.is_active}
                                        onPress={() => setUserForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                                        style={[styles.optionChip, userForm.is_active && styles.optionChipActive]}
                                        textStyle={[styles.optionText, userForm.is_active && styles.optionTextActive]}
                                    >
                                        {userForm.is_active ? 'Active' : 'Inactive'}
                                    </Chip>
                                </View>

                                <View style={styles.modalActionRow}>
                                    <Button mode="outlined" onPress={closeManageModal} style={styles.modalCancelBtn}>
                                        Batal
                                    </Button>
                                    <Button
                                        mode="contained"
                                        onPress={saveUser}
                                        loading={savingUser}
                                        disabled={savingUser}
                                        style={styles.modalSaveBtn}
                                    >
                                        Simpan
                                    </Button>
                                </View>

                                <View style={styles.sectionDivider} />

                                <Text style={styles.sectionTitle}>Password</Text>
                                <Button
                                    mode="outlined"
                                    icon="email-fast-outline"
                                    onPress={sendPasswordReset}
                                    loading={sendingReset}
                                    disabled={sendingReset}
                                >
                                    Reset Password (Email)
                                </Button>

                                <TextInput
                                    label="Password Baru"
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    secureTextEntry={!showNewPassword}
                                    right={
                                        <TextInput.Icon
                                            icon={showNewPassword ? 'eye-off' : 'eye'}
                                            onPress={() => setShowNewPassword((prev) => !prev)}
                                            forceTextInputFocus={false}
                                        />
                                    }
                                    mode="outlined"
                                    style={styles.input}
                                />
                                <TextInput
                                    label="Konfirmasi Password Baru"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showConfirmPassword}
                                    right={
                                        <TextInput.Icon
                                            icon={showConfirmPassword ? 'eye-off' : 'eye'}
                                            onPress={() => setShowConfirmPassword((prev) => !prev)}
                                            forceTextInputFocus={false}
                                        />
                                    }
                                    mode="outlined"
                                    style={styles.input}
                                />
                                <Button
                                    mode="contained-tonal"
                                    onPress={updatePassword}
                                    loading={savingPassword}
                                    disabled={savingPassword}
                                >
                                    Edit Password
                                </Button>
                                <Text style={styles.helperText}>
                                    Edit password langsung hanya untuk akun yang sedang login.
                                </Text>

                                <View style={styles.sectionDivider} />

                                {showDeleteConfirm ? (
                                    <>
                                        <Text style={styles.deleteConfirmText}>
                                            User akan dihapus dari daftar profile. Tindakan ini tidak bisa dibatalkan.
                                        </Text>
                                        <View style={styles.modalActionRow}>
                                            <Button
                                                mode="outlined"
                                                onPress={() => setShowDeleteConfirm(false)}
                                                style={styles.modalCancelBtn}
                                                disabled={deletingUser}
                                            >
                                                Batal
                                            </Button>
                                            <Button
                                                mode="contained"
                                                onPress={deleteUser}
                                                loading={deletingUser}
                                                disabled={deletingUser}
                                                style={styles.modalDangerBtn}
                                            >
                                                Ya, Hapus
                                            </Button>
                                        </View>
                                    </>
                                ) : (
                                    <Button mode="text" textColor={Colors.danger} onPress={() => setShowDeleteConfirm(true)}>
                                        Hapus User
                                    </Button>
                                )}
                            </ScrollView>
                        </>
                    ) : null}
                </Modal>
            </Portal>

            <AppSnackbar
                visible={!!error}
                onDismiss={() => setError('')}
                duration={3000}
                style={{ backgroundColor: Colors.danger }}
            >
                {error}
            </AppSnackbar>
            <AppSnackbar
                visible={!!success}
                onDismiss={() => setSuccess('')}
                duration={2200}
                style={{ backgroundColor: Colors.success }}
            >
                {success}
            </AppSnackbar>
        </View>
    );
}

const styles = StyleSheet.create({
    search: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, elevation: 0 },
    filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
    filterButton: { borderColor: Colors.border, backgroundColor: Colors.surface },
    chip: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1 },
    chipActive: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
    chipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
    chipTextActive: { color: Colors.primary, fontWeight: '700' },
    avatar: {
        width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + '10',
        justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
    roleBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
    roleText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    name: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 1 },
    email: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
    idBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    empId: { fontSize: 11, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '500' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 11, fontWeight: '500' },
    modal: {
        backgroundColor: Colors.card,
        margin: 20,
        borderRadius: 20,
        paddingHorizontal: 20,
        paddingVertical: 16,
        width: '100%',
        maxWidth: 520,
        alignSelf: 'center',
    },
    modalContent: {
        gap: 12,
        paddingBottom: 8,
        paddingRight: Platform.OS === 'web' ? 6 : 0,
    },
    modalScroll: {
        marginTop: 4,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text,
    },
    modalCaption: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 2,
    },
    input: {
        backgroundColor: Colors.surface,
    },
    optionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    optionChip: {
        borderColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    optionChipActive: {
        borderColor: Colors.primary + '60',
        backgroundColor: Colors.primary + '18',
    },
    optionText: {
        color: Colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    optionTextActive: {
        color: Colors.primary,
    },
    modalActionRow: {
        flexDirection: 'row',
        gap: 10,
    },
    modalCancelBtn: {
        flex: 1,
        borderRadius: 12,
    },
    modalSaveBtn: {
        flex: 1,
        borderRadius: 12,
        backgroundColor: Colors.primary,
    },
    modalDangerBtn: {
        flex: 1,
        borderRadius: 12,
        backgroundColor: Colors.danger,
    },
    sectionDivider: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        marginTop: 4,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.textSecondary,
    },
    helperText: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: -4,
    },
    deleteConfirmText: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
});
