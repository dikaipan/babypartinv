import { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, useWindowDimensions, Platform, ScrollView } from 'react-native';
import { Text, Searchbar, Chip, IconButton, Portal, Modal, TextInput, Button, Menu, Divider } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import { supabase } from '../../src/config/supabase';
import { getSupabaseAuthCallbackBaseUrl } from '../../src/config/authCallbacks';
import { useAuthStore } from '../../src/stores/authStore';
import { Profile } from '../../src/types';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { adminStyles } from '../../src/styles/adminStyles';
import { useAdminUiStore, ADMIN_SIDEBAR_WIDTH, ADMIN_SIDEBAR_COLLAPSED_WIDTH } from '../../src/stores/adminUiStore';
import { useDebounce } from '../../src/hooks/useDebounce';
import { normalizeArea } from '../../src/utils/normalizeArea';

type UserBaseFormState = {
    name: string;
    email: string;
    employee_id: string;
    location: string;
    role: 'admin' | 'engineer';
    is_active: boolean;
};

type UserFormState = UserBaseFormState;

type CreateUserFormState = UserBaseFormState & {
    password: string;
    confirm_password: string;
};

const EMAIL_REGEX = /\S+@\S+\.\S+/;
const BREACHED_PASSWORD_PATTERNS = ['breached', 'pwned', 'weak password', 'password is known'];
const EMAIL_CONFLICT_PATTERNS = ['already registered', 'already exists', 'duplicate key value'];
const ADMIN_FUNCTION_WEB_401_HINT =
    'Jika ini terjadi di web, redeploy edge function dengan --no-verify-jwt agar preflight OPTIONS tidak ditolak.';

const toTitleCase = (value: string) =>
    value.replace(/\w\S*/g, (text) => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase());

const buildDefaultCreateUserForm = (): CreateUserFormState => ({
    name: '',
    email: '',
    password: '',
    confirm_password: '',
    employee_id: '',
    location: '',
    role: 'engineer',
    is_active: true,
});

const extractAdminAuthErrorMessage = async (error: unknown, fallback: string) => {
    if (error instanceof FunctionsHttpError) {
        const status = error.context.status;
        try {
            const payload = (await error.context.json()) as { error?: string; message?: string };
            const message = (payload.error || payload.message || '').trim();
            if (message) {
                const lowered = message.toLowerCase();
                if (BREACHED_PASSWORD_PATTERNS.some((pattern) => lowered.includes(pattern))) {
                    return 'Password terlalu lemah atau termasuk password bocor. Gunakan kombinasi yang lebih kuat.';
                }
                if (EMAIL_CONFLICT_PATTERNS.some((pattern) => lowered.includes(pattern))) {
                    return 'Email sudah terpakai oleh akun lain.';
                }
                if (status === 401) {
                    return `${message} ${ADMIN_FUNCTION_WEB_401_HINT}`;
                }
                if (status === 403) {
                    return 'Akses ditolak. Hanya akun admin yang boleh menjalankan aksi ini.';
                }
                return message;
            }
        } catch {
            // Fall through to generic handling.
        }

        if (status === 401) {
            return `Token login tidak valid/expired atau preflight ditolak. ${ADMIN_FUNCTION_WEB_401_HINT}`;
        }
        if (status === 403) {
            return 'Akses ditolak. Hanya akun admin yang boleh menjalankan aksi ini.';
        }
    }

    if (error instanceof Error && error.message) {
        const lowered = error.message.toLowerCase();
        if (BREACHED_PASSWORD_PATTERNS.some((pattern) => lowered.includes(pattern))) {
            return 'Password terlalu lemah atau termasuk password bocor. Gunakan kombinasi yang lebih kuat.';
        }
        if (EMAIL_CONFLICT_PATTERNS.some((pattern) => lowered.includes(pattern))) {
            return 'Email sudah terpakai oleh akun lain.';
        }
        if (lowered.includes('failed to fetch')) {
            return `Request ke admin function gagal. ${ADMIN_FUNCTION_WEB_401_HINT}`;
        }
        return error.message;
    }

    return fallback;
};

const getFreshAccessToken = async () => {
    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
        throw new Error('Gagal membaca sesi login. Silakan login ulang.');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresInSeconds = session?.expires_at ? session.expires_at - now : null;
    const needsRefresh = !session?.access_token || expiresInSeconds === null || expiresInSeconds <= 60;

    if (needsRefresh) {
        const {
            data: refreshed,
            error: refreshError,
        } = await supabase.auth.refreshSession();

        if (refreshError || !refreshed.session?.access_token) {
            throw new Error('Sesi login tidak valid atau sudah berakhir. Silakan login ulang.');
        }

        return refreshed.session.access_token;
    }

    return session.access_token;
};

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

const updateUserAuthByAdmin = async (
    userId: string,
    updates: {
        password?: string;
        email?: string;
    },
) => {
    const accessToken = await getFreshAccessToken();

    const { data, error } = await supabase.functions.invoke('admin-set-password', {
        body: { userId, ...updates },
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (error) {
        throw new Error(await extractAdminAuthErrorMessage(error, 'Gagal memperbarui data login user.'));
    }

    const payload = (data || {}) as { ok?: boolean; error?: string };
    if (!payload.ok) {
        throw new Error(payload.error || 'Gagal memperbarui data login user.');
    }
};

const createUserByAdmin = async (payload: {
    name: string;
    email: string;
    password: string;
    employee_id?: string | null;
    location?: string | null;
    role: 'admin' | 'engineer';
    is_active: boolean;
}) => {
    const accessToken = await getFreshAccessToken();

    const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: payload,
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (error) {
        throw new Error(await extractAdminAuthErrorMessage(error, 'Gagal membuat user baru.'));
    }

    const responsePayload = (data || {}) as { ok?: boolean; error?: string };
    if (!responsePayload.ok) {
        throw new Error(responsePayload.error || 'Gagal membuat user baru.');
    }
};

export default function UsersPage() {
    const { width, height } = useWindowDimensions();
    const { user: currentUser, refreshProfile } = useAuthStore();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [filter, setFilter] = useState<'all' | 'admin' | 'engineer'>('all');
    const [selectedLocation, setSelectedLocation] = useState<string>('all');
    const [showLocationMenu, setShowLocationMenu] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [showManageModal, setShowManageModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

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
    const [createUserForm, setCreateUserForm] = useState<CreateUserFormState>(buildDefaultCreateUserForm());
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);

    const [creatingUser, setCreatingUser] = useState(false);
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

    const openCreateModal = () => {
        setCreateUserForm(buildDefaultCreateUserForm());
        setShowCreatePassword(false);
        setShowCreateConfirmPassword(false);
        setShowCreateModal(true);
    };

    const closeCreateModal = () => {
        setShowCreateModal(false);
        setCreateUserForm(buildDefaultCreateUserForm());
        setShowCreatePassword(false);
        setShowCreateConfirmPassword(false);
    };

    const addUser = async () => {
        if (creatingUser) return;

        const name = toTitleCase(createUserForm.name.trim());
        const email = createUserForm.email.trim().toLowerCase();
        const password = createUserForm.password.trim();
        const confirmation = createUserForm.confirm_password.trim();
        const employeeId = createUserForm.employee_id.trim();
        const location = createUserForm.location.trim();
        const isEngineer = createUserForm.role === 'engineer';

        if (!name || !email || !password || !confirmation) {
            setError('Nama, email, password, dan konfirmasi password wajib diisi.');
            return;
        }
        if (!EMAIL_REGEX.test(email)) {
            setError('Format email tidak valid.');
            return;
        }
        if (password.length < 6) {
            setError('Password minimal 6 karakter.');
            return;
        }
        if (password !== confirmation) {
            setError('Konfirmasi password tidak cocok.');
            return;
        }
        if (isEngineer && (!employeeId || !location)) {
            setError('ID Engineer dan Area Group wajib diisi untuk role engineer.');
            return;
        }

        setCreatingUser(true);
        try {
            await createUserByAdmin({
                name,
                email,
                password,
                employee_id: employeeId || null,
                location: location ? normalizeArea(location) : null,
                role: createUserForm.role,
                is_active: createUserForm.is_active,
            });

            await usersQuery.refetch();
            setSuccess(`User ${name} berhasil ditambahkan.`);
            closeCreateModal();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal menambahkan user baru.';
            setError(message);
        } finally {
            setCreatingUser(false);
        }
    };

    const saveUser = async () => {
        if (!selectedUser || savingUser) return;

        const name = userForm.name.trim();
        const email = userForm.email.trim().toLowerCase();
        const currentEmail = selectedUser.email.trim().toLowerCase();
        const emailChanged = email !== currentEmail;

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
            if (emailChanged) {
                await updateUserAuthByAdmin(selectedUser.id, { email });
            }

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
            setSuccess(emailChanged ? 'Data user berhasil diperbarui. Email login juga tersinkron.' : 'Data user berhasil diperbarui.');
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

        const draftEmail = userForm.email.trim().toLowerCase();
        const targetEmail = selectedUser.email.trim().toLowerCase();
        if (draftEmail !== targetEmail) {
            setError('Simpan perubahan email dulu sebelum kirim reset password.');
            return;
        }
        if (!EMAIL_REGEX.test(targetEmail)) {
            setError('Email user tidak valid untuk reset password.');
            return;
        }

        setSendingReset(true);
        try {
            const baseUrl = getSupabaseAuthCallbackBaseUrl();
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
                redirectTo: `${baseUrl}/reset-password.html`,
            });
            if (resetError) throw resetError;
            setSuccess(`Permintaan reset password untuk ${targetEmail} sudah diproses. Jika email belum masuk, cek spam atau gunakan reset manual.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal mengirim reset password.';
            setError(message);
        } finally {
            setSendingReset(false);
        }
    };

    const updatePassword = async () => {
        if (!selectedUser || savingPassword) return;

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
            const isSelf = currentUser?.id === selectedUser.id;
            if (isSelf) {
                const { error: updatePasswordError } = await supabase.auth.updateUser({ password });
                if (updatePasswordError) throw updatePasswordError;
            } else {
                await updateUserAuthByAdmin(selectedUser.id, { password });
            }

            setNewPassword('');
            setConfirmPassword('');
            setSuccess(`Password ${selectedUser.name || selectedUser.email} berhasil diperbarui.`);
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
        const matchSearch = u.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            u.email.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (u.employee_id || '').toLowerCase().includes(debouncedSearch.toLowerCase());
        if (selectedLocation !== 'all' && u.location !== selectedLocation) return false;
        if (filter === 'all') return matchSearch;
        return matchSearch && u.role === filter;
    });

    const renderItem = ({ item: u }: { item: Profile }) => (
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
    );

    return (
        <View style={adminStyles.container}>
            <View style={adminStyles.header}>
                <View>
                    <Text style={adminStyles.headerTitle}>Users</Text>
                    <Text style={adminStyles.headerSub}>{users.length} total users</Text>
                </View>
                <View style={styles.headerActions}>
                    <Button mode="contained" icon="account-plus-outline" onPress={openCreateModal} compact>
                        Add User
                    </Button>
                    <Button mode="outlined" icon="refresh" onPress={onRefresh} compact>
                        Reload
                    </Button>
                </View>
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
                renderItem={renderItem}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={11}
                removeClippedSubviews={true}
                ListEmptyComponent={
                    <View style={adminStyles.emptyState}>
                        <MaterialCommunityIcons name="account-search-outline" size={48} color={Colors.textMuted} />
                        <Text style={adminStyles.emptyText}>User tidak ditemukan.</Text>
                    </View>
                }
            />

            <Portal>
                <Modal
                    visible={showCreateModal}
                    onDismiss={closeCreateModal}
                    contentContainerStyle={[styles.modal, { maxHeight: Math.max(460, height - 40) }]}
                >
                    <View style={styles.modalHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.modalTitle}>Tambah User</Text>
                            <Text style={styles.modalCaption}>
                                Registrasi manual user dari panel admin.
                            </Text>
                        </View>
                        <IconButton icon="close" size={22} onPress={closeCreateModal} />
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
                            value={createUserForm.name}
                            onChangeText={(value) => setCreateUserForm((prev) => ({ ...prev, name: value }))}
                            mode="outlined"
                            style={styles.input}
                        />
                        <TextInput
                            label="Email"
                            value={createUserForm.email}
                            onChangeText={(value) => setCreateUserForm((prev) => ({ ...prev, email: value }))}
                            mode="outlined"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            style={styles.input}
                        />
                        <TextInput
                            label="Password"
                            value={createUserForm.password}
                            onChangeText={(value) => setCreateUserForm((prev) => ({ ...prev, password: value }))}
                            secureTextEntry={!showCreatePassword}
                            right={
                                <TextInput.Icon
                                    icon={showCreatePassword ? 'eye-off' : 'eye'}
                                    onPress={() => setShowCreatePassword((prev) => !prev)}
                                    forceTextInputFocus={false}
                                />
                            }
                            mode="outlined"
                            style={styles.input}
                        />
                        <TextInput
                            label="Konfirmasi Password"
                            value={createUserForm.confirm_password}
                            onChangeText={(value) => setCreateUserForm((prev) => ({ ...prev, confirm_password: value }))}
                            secureTextEntry={!showCreateConfirmPassword}
                            right={
                                <TextInput.Icon
                                    icon={showCreateConfirmPassword ? 'eye-off' : 'eye'}
                                    onPress={() => setShowCreateConfirmPassword((prev) => !prev)}
                                    forceTextInputFocus={false}
                                />
                            }
                            mode="outlined"
                            style={styles.input}
                        />
                        <TextInput
                            label="ID Engineer"
                            value={createUserForm.employee_id}
                            onChangeText={(value) => setCreateUserForm((prev) => ({ ...prev, employee_id: value }))}
                            mode="outlined"
                            style={styles.input}
                        />
                        <TextInput
                            label="Area Group"
                            value={createUserForm.location}
                            onChangeText={(value) => setCreateUserForm((prev) => ({ ...prev, location: value }))}
                            mode="outlined"
                            style={styles.input}
                        />

                        <View style={styles.optionRow}>
                            <Chip
                                mode={createUserForm.role === 'engineer' ? 'flat' : 'outlined'}
                                selected={createUserForm.role === 'engineer'}
                                onPress={() => setCreateUserForm((prev) => ({ ...prev, role: 'engineer' }))}
                                style={[styles.optionChip, createUserForm.role === 'engineer' && styles.optionChipActive]}
                                textStyle={[styles.optionText, createUserForm.role === 'engineer' && styles.optionTextActive]}
                            >
                                Engineer
                            </Chip>
                            <Chip
                                mode={createUserForm.role === 'admin' ? 'flat' : 'outlined'}
                                selected={createUserForm.role === 'admin'}
                                onPress={() => setCreateUserForm((prev) => ({ ...prev, role: 'admin' }))}
                                style={[styles.optionChip, createUserForm.role === 'admin' && styles.optionChipActive]}
                                textStyle={[styles.optionText, createUserForm.role === 'admin' && styles.optionTextActive]}
                            >
                                Admin
                            </Chip>
                            <Chip
                                mode={createUserForm.is_active ? 'flat' : 'outlined'}
                                selected={createUserForm.is_active}
                                onPress={() => setCreateUserForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                                style={[styles.optionChip, createUserForm.is_active && styles.optionChipActive]}
                                textStyle={[styles.optionText, createUserForm.is_active && styles.optionTextActive]}
                            >
                                {createUserForm.is_active ? 'Active' : 'Inactive'}
                            </Chip>
                        </View>
                        <Text style={styles.helperText}>
                            Untuk role engineer, isi ID Engineer dan Area Group.
                        </Text>

                        <View style={styles.modalActionRow}>
                            <Button mode="outlined" onPress={closeCreateModal} style={styles.modalCancelBtn} disabled={creatingUser}>
                                Batal
                            </Button>
                            <Button
                                mode="contained"
                                onPress={addUser}
                                loading={creatingUser}
                                disabled={creatingUser}
                                style={styles.modalSaveBtn}
                            >
                                Tambah User
                            </Button>
                        </View>
                    </ScrollView>
                </Modal>
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
                                    Set Password
                                </Button>
                                <Text style={styles.helperText}>
                                    Admin bisa set password langsung tanpa menunggu user online.
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
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        gap: 8,
    },
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
