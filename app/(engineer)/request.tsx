import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, FlatList, RefreshControl, Pressable, BackHandler, Platform } from 'react-native';
import { Text, FAB, Portal, Modal, IconButton, Searchbar } from 'react-native-paper';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import WebPullToRefreshBanner from '../../src/components/WebPullToRefreshBanner';
import NotificationBell from '../../src/components/NotificationBell';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { useWebAutoRefresh } from '../../src/hooks/useWebAutoRefresh';
import { useWebPullToRefresh } from '../../src/hooks/useWebPullToRefresh';
import styles from '../../src/styles/requestStyles';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/config/supabase';
import { MonthlyRequest, RequestStatus, InventoryPart, RequestItem } from '../../src/types';
import { NotificationService } from '../../src/services/NotificationService';

const LOOPSHEET_MAX_QTY = 20;
const DEFAULT_MAX_QTY = 10;

const normalizePartToken = (value?: string) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isLoopSheetPart = (partName?: string, partId?: string) => {
    const nameToken = normalizePartToken(partName);
    const idToken = normalizePartToken(partId);
    return nameToken.includes('loopsheet') || nameToken.includes('loopshet') || idToken.includes('loopsheet') || idToken.includes('loopshet');
};
const getMaxQtyForPart = (partName?: string, partId?: string) => (
    isLoopSheetPart(partName, partId) ? LOOPSHEET_MAX_QTY : DEFAULT_MAX_QTY
);

export default function RequestPage() {
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const unreadCount = useUnreadCount();
    const [requests, setRequests] = useState<MonthlyRequest[]>([]);
    const [filter, setFilter] = useState<'all' | RequestStatus>('all');
    const [refreshing, setRefreshing] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    // Steps: 'summary' -> 'select' -> 'quantity'
    const [step, setStep] = useState<'summary' | 'select' | 'quantity'>('summary');

    const [parts, setParts] = useState<InventoryPart[]>([]);
    const [selectedItems, setSelectedItems] = useState<RequestItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const [selectedPart, setSelectedPart] = useState<InventoryPart | null>(null);
    const [qty, setQty] = useState(1);
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const periodCode = useMemo(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }, []);
    const selectSnapPoints = useMemo(() => ['84%'], []);
    const qtySnapPoints = useMemo(() => ['42%'], []);
    const activeSnapPoints = useMemo(() => (step === 'select' ? selectSnapPoints : qtySnapPoints), [step, selectSnapPoints, qtySnapPoints]);
    const visibleTabStyle = useMemo(() => {
        const tabBottomPadding = Math.max(insets.bottom, 10);
        return {
            backgroundColor: Colors.card,
            borderTopColor: Colors.border,
            height: 56 + tabBottomPadding,
            paddingBottom: tabBottomPadding,
            paddingTop: 6,
        };
    }, [insets.bottom]);

    const renderSheetBackdrop = useCallback((props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.56}
            pressBehavior="close"
        />
    ), []);

    useEffect(() => {
        const parent = navigation.getParent();
        if (!parent) return;

        parent.setOptions({
            tabBarStyle: showCreate ? { display: 'none' } : visibleTabStyle,
        });

        return () => {
            parent.setOptions({ tabBarStyle: visibleTabStyle });
        };
    }, [navigation, showCreate, visibleTabStyle]);

    const load = useCallback(async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('monthly_requests')
            .select('*')
            .eq('engineer_id', user.id)
            .neq('status', 'cancelled')
            .order('submitted_at', { ascending: false });
        if (error) {
            setError(error.message);
            return;
        }
        setRequests(data || []);
        setError('');
    }, [user]);

    const loadParts = async () => {
        const { data, error } = await supabase.from('inventory').select('*').order('part_name');
        if (error) {
            setError(error.message);
            return;
        }
        setParts(data || []);
        setError('');
    };

    useFocusEffect(useCallback(() => { load(); }, [load]));
    useEffect(() => {
        load();
    }, [load]);
    useWebAutoRefresh(load, { enabled: !!user });

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await load();
        } finally {
            setRefreshing(false);
        }
    };
    const webPull = useWebPullToRefresh({
        onRefresh,
        refreshing,
        enabled: !!user,
    });

    const closeCreate = () => {
        setShowCreate(false);
        setStep('summary');
        setSearchQuery('');
        setSelectedPart(null);
        setQty(1);
        setEditingId(null);
    };

    useFocusEffect(useCallback(() => {
        const onBackPress = () => {
            if (!showCreate) return false;

            if (step === 'quantity') {
                setStep('select');
                return true;
            }
            if (step === 'select') {
                setStep('summary');
                setSelectedPart(null);
                setQty(1);
                return true;
            }

            closeCreate();
            return true;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [showCreate, step]));

    const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
    const total = requests.length;
    const pendingCount = requests.filter(r => r.status === 'pending').length;

    const openCreate = async () => {
        await loadParts();
        setSelectedItems([]);
        setSearchQuery('');
        setSelectedPart(null);
        setQty(1);
        setEditingId(null);
        setStep('summary');
        setShowCreate(true);
    };

    const handleEdit = async (request: MonthlyRequest) => {
        await loadParts();
        setSelectedItems(request.items as RequestItem[]);
        setSearchQuery('');
        setSelectedPart(null);
        setQty(1);
        setEditingId(request.id);
        setStep('summary');
        setShowCreate(true);
    };

    const openSelectSheet = () => {
        setSearchQuery('');
        setStep('select');
    };

    const handleSelectPart = (part: InventoryPart) => {
        const existing = selectedItems.find(i => i.partId === part.id);
        const maxQty = getMaxQtyForPart(part.part_name, part.id);
        setSelectedPart(part);
        setQty(existing ? Math.max(1, Math.min(existing.quantity, maxQty)) : 1);
        setStep('quantity');
    };

    const confirmQuantity = () => {
        if (!selectedPart) return;
        const maxQty = getMaxQtyForPart(selectedPart.part_name, selectedPart.id);
        const safeQty = Math.max(1, Math.min(qty, maxQty));
        setSelectedItems(prev => {
            const exists = prev.find(i => i.partId === selectedPart.id);
            if (exists) {
                return prev.map(i => i.partId === selectedPart.id ? { ...i, quantity: safeQty } : i);
            }
            return [...prev, { partId: selectedPart.id, quantity: safeQty }];
        });
        setSelectedPart(null);
        setQty(1);
        setStep('summary');
    };

    const removeItem = (partId: string) => {
        setSelectedItems(prev => prev.filter(i => i.partId !== partId));
    };

    const submitRequest = async () => {
        if (selectedItems.length === 0) { setError('Tambahkan minimal 1 item'); return; }
        const invalidItem = selectedItems.find((item) => {
            const part = partById.get(item.partId);
            return item.quantity > getMaxQtyForPart(part?.part_name, item.partId);
        });
        if (invalidItem) {
            const part = partById.get(invalidItem.partId);
            const partName = part?.part_name || invalidItem.partId;
            const maxQty = getMaxQtyForPart(part?.part_name, invalidItem.partId);
            setError(`${partName} maksimal ${maxQty} pcs per request.`);
            return;
        }

        let err;
        if (editingId) {
            const { error } = await supabase.from('monthly_requests')
                .update({ month: periodCode, items: selectedItems, submitted_at: new Date().toISOString() })
                .eq('id', editingId);
            err = error;
        } else {
            const { error } = await supabase.from('monthly_requests').insert({
                engineer_id: user!.id,
                month: periodCode,
                items: selectedItems,
                status: 'pending',
            });
            err = error;
            if (!err) {
                NotificationService.sendToRole('admin', 'New Request', `${user?.name} membuat request baru.`);
            }
        }

        if (err) { setError(err.message); return; }
        setShowCreate(false);
        setStep('summary');
        setSearchQuery('');
        setSelectedPart(null);
        setQty(1);
        setSuccess(editingId ? 'Request diperbarui!' : 'Request berhasil dibuat!');
        setEditingId(null);
        load();
    };

    const cancelRequest = async (id: string) => {
        if (!user?.id) return;
        // Prefer hard delete. If no row deleted (RLS/no match), fallback to soft-cancel.
        const { data: deletedRows, error: deleteError } = await supabase
            .from('monthly_requests')
            .delete()
            .eq('id', id)
            .eq('engineer_id', user.id)
            .select('id');

        if (!deleteError && deletedRows && deletedRows.length > 0) {
            setSuccess('Request dibatalkan');
            load();
            return;
        }

        const { data: updatedRows, error: softCancelError } = await supabase
            .from('monthly_requests')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
            .eq('id', id)
            .eq('engineer_id', user.id)
            .select('id, status');

        if (softCancelError) {
            setError(softCancelError.message);
            return;
        }

        if (!updatedRows || updatedRows.length === 0) {
            setError('Request tidak bisa dibatalkan (izin/update policy).');
            return;
        }

        if (updatedRows[0].status !== 'cancelled') {
            const { data: verifyRows, error: verifyError } = await supabase
                .from('monthly_requests')
                .select('id, status')
                .eq('id', id)
                .eq('engineer_id', user.id)
                .maybeSingle();

            if (verifyError) {
                setError(verifyError.message);
                return;
            }

            if (verifyRows && verifyRows.status !== 'cancelled') {
                setError('Request masih pending. Cek policy update di Supabase.');
                return;
            }
        }
        setSuccess('Request dibatalkan');
        NotificationService.sendToRole('admin', 'Request Cancelled', `${user?.name} membatalkan request.`);
        load();
    };

    const confirmDelivery = async (id: string) => {
        if (!user?.id) return;

        setConfirmingId(id);
        try {
            const { data: requestRow, error: requestError } = await supabase
                .from('monthly_requests')
                .select('id, status, items')
                .eq('id', id)
                .eq('engineer_id', user.id)
                .single();
            if (requestError) throw requestError;
            if (!requestRow || requestRow.status !== 'delivered') {
                setError('Request belum berstatus delivered.');
                return;
            }

            const deliveredItems = ((requestRow.items as RequestItem[]) || []).filter(i => i.quantity > 0);
            const qtyByPart = new Map<string, number>();
            for (const item of deliveredItems) {
                qtyByPart.set(item.partId, (qtyByPart.get(item.partId) || 0) + item.quantity);
            }

            if (qtyByPart.size > 0) {
                const partIds = Array.from(qtyByPart.keys());
                const [{ data: existingStocks, error: stockError }, { data: inventoryRows, error: inventoryError }] = await Promise.all([
                    supabase
                        .from('engineer_stock')
                        .select('part_id, quantity')
                        .eq('engineer_id', user.id)
                        .in('part_id', partIds),
                    supabase.from('inventory').select('id, part_name').in('id', partIds),
                ]);
                if (stockError) throw stockError;
                if (inventoryError) throw inventoryError;

                const currentQtyMap = new Map<string, number>();
                for (const row of existingStocks || []) currentQtyMap.set(row.part_id, row.quantity);

                const partNameMap = new Map<string, string>();
                for (const row of inventoryRows || []) partNameMap.set(row.id, row.part_name);

                const nowIso = new Date().toISOString();
                const upsertRows = partIds.map((partId) => {
                    const previousQty = currentQtyMap.get(partId) || 0;
                    const delta = qtyByPart.get(partId) || 0;
                    return {
                        engineer_id: user.id,
                        part_id: partId,
                        quantity: previousQty + delta,
                        last_sync: nowIso,
                    };
                });

                const { error: upsertError } = await supabase
                    .from('engineer_stock')
                    .upsert(upsertRows, { onConflict: 'engineer_id,part_id' });
                if (upsertError) throw upsertError;

                const adjustmentRows = partIds.map((partId) => {
                    const previousQty = currentQtyMap.get(partId) || 0;
                    const delta = qtyByPart.get(partId) || 0;
                    return {
                        engineer_id: user.id,
                        engineer_name: user.name || '',
                        part_id: partId,
                        part_name: partNameMap.get(partId) || partId,
                        previous_quantity: previousQty,
                        new_quantity: previousQty + delta,
                        delta,
                        reason: 'Konfirmasi terima request bulanan',
                        area_group: user.location || null,
                        timestamp: nowIso,
                    };
                });
                const { error: adjustmentError } = await supabase.from('stock_adjustments').insert(adjustmentRows);
                if (adjustmentError) {
                    console.warn('Failed to insert stock adjustment logs:', adjustmentError.message);
                }
            }

            const confirmedAt = new Date().toISOString();
            const { data: completedRow, error: completeError } = await supabase
                .from('monthly_requests')
                .update({ status: 'completed', confirmed_at: confirmedAt })
                .eq('id', id)
                .eq('engineer_id', user.id)
                .eq('status', 'delivered')
                .select('id, status, confirmed_at')
                .maybeSingle();
            if (completeError) throw completeError;
            if (!completedRow || completedRow.status !== 'completed') {
                throw new Error('Konfirmasi tidak tersimpan. Cek policy update monthly_requests untuk engineer.');
            }

            setSuccess('Penerimaan dikonfirmasi. Stok berhasil ditambahkan.');
            NotificationService.sendToRole('admin', 'Delivery Confirmed', `${user?.name} telah menerima barang.`);
            load();
        } catch (e: any) {
            setError(e?.message || 'Gagal konfirmasi penerimaan.');
        } finally {
            setConfirmingId(null);
        }
    };

    const statusColor = (s: RequestStatus) => {
        switch (s) {
            case 'pending': return Colors.accent;
            case 'approved': return Colors.info;
            case 'delivered': return Colors.primary;
            case 'completed': return Colors.success;
            case 'rejected': return Colors.danger;
            case 'cancelled': return Colors.textMuted;
            default: return Colors.textSecondary;
        }
    };

    const filteredParts = parts.filter(p =>
        p.part_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const partById = useMemo(() => {
        const map = new Map<string, InventoryPart>();
        for (const part of parts) map.set(part.id, part);
        return map;
    }, [parts]);

    const partNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const part of parts) map.set(part.id, part.part_name);
        return map;
    }, [parts]);
    const selectedPartMaxQty = useMemo(() => (
        selectedPart ? getMaxQtyForPart(selectedPart.part_name, selectedPart.id) : DEFAULT_MAX_QTY
    ), [selectedPart]);

    return (
        <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
            <FlatList
                data={filtered}
                keyExtractor={r => r.id}
                refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                onScroll={webPull.onScroll}
                onTouchStart={webPull.onTouchStart}
                onTouchMove={webPull.onTouchMove}
                onTouchEnd={webPull.onTouchEnd}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: 0, paddingBottom: 76, gap: 12 }}
                ListHeaderComponent={
                    <>
                        <WebPullToRefreshBanner
                            enabled={webPull.enabled}
                            pullDistance={webPull.pullDistance}
                            ready={webPull.ready}
                            refreshing={refreshing}
                        />
                        <View style={styles.header}>
                            <View style={styles.headerSpacer} />
                            <Text style={styles.pageTitle}>Request</Text>
                            <NotificationBell unreadCount={unreadCount} onPress={() => navigation.navigate('notifications' as never)} />
                        </View>
                        <Text style={styles.sectionTitle}>Request Bulanan</Text>

                        {/* Stats Cards */}
                        <View style={styles.stats}>
                            <View style={styles.statCard}>
                                <View style={[styles.statIcon, { backgroundColor: '#1F2937' }]}>
                                    <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#2DD4A8" />
                                </View>
                                <View>
                                    <Text style={styles.statValue}>{total}</Text>
                                    <Text style={styles.statLabel}>Total</Text>
                                </View>
                            </View>
                            <View style={[styles.statCard, { borderColor: Colors.accent + '40', backgroundColor: Colors.accent + '10' }]}>
                                <View style={[styles.statIcon, { backgroundColor: Colors.accent + '20' }]}>
                                    <MaterialCommunityIcons name="clock-outline" size={18} color={Colors.accent} />
                                </View>
                                <View>
                                    <Text style={[styles.statValue, { color: Colors.accent }]}>{pendingCount}</Text>
                                    <Text style={[styles.statLabel, { color: Colors.accent }]}>Pending</Text>
                                </View>
                            </View>
                        </View>

                        {/* Filter Pills */}
                        <View style={styles.filters}>
                            {(['all', 'pending', 'approved', 'delivered'] as const).map(f => (
                                <Pressable key={f} onPress={() => setFilter(f)}
                                    style={[styles.filterPill, filter === f && styles.filterPillActive]}>
                                    {filter === f && <MaterialCommunityIcons name="check" size={14} color="#FFF" style={{ marginRight: 4 }} />}
                                    <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                        {f === 'all' ? 'Semua' : f.charAt(0).toUpperCase() + f.slice(1)}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                        <View style={{ height: 16 }} />
                    </>
                }
                renderItem={({ item: r }) => (
                    <View style={styles.card}>
                        {/* Card Header & Content - SAME AS BEFORE */}
                        <View style={styles.cardHeader}>
                            <View style={styles.dateIcon}>
                                <MaterialCommunityIcons name="calendar" size={18} color={Colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.dateDay}>{new Date(r.submitted_at).getDate()} {new Date(r.submitted_at).toLocaleString('id-ID', { month: 'short' })}</Text>
                                <Text style={styles.dateTime}>
                                    {new Date(r.submitted_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} | {(r.items as RequestItem[]).length} Item
                                </Text>
                            </View>
                            <View style={[styles.statusBadge, { borderColor: statusColor(r.status), backgroundColor: statusColor(r.status) + '20' }]}>
                                <Text style={[styles.statusText, { color: statusColor(r.status) }]}>
                                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                                </Text>
                            </View>
                        </View>

                        {/* Info Row */}
                        <View style={styles.infoRow}>
                            <View style={styles.infoBox}>
                                <MaterialCommunityIcons name="format-list-bulleted" size={14} color={Colors.primary} />
                                <View>
                                    <Text style={styles.infoBoxValue}>{(r.items as RequestItem[]).length}</Text>
                                    <Text style={styles.infoBoxLabel}>Item</Text>
                                </View>
                            </View>
                            <View style={[styles.infoBox, { borderColor: Colors.accent + '40', backgroundColor: Colors.accent + '10' }]}>
                                <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.accent} />
                                <View>
                                    <Text style={[styles.infoBoxValue, { color: Colors.accent }]}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Text>
                                    <Text style={styles.infoBoxLabel}>Status</Text>
                                </View>
                            </View>
                        </View>

                        {/* Items */}
                        <View style={styles.itemsRow}>
                            {(r.items as RequestItem[]).map((item, idx) => (
                                <View key={idx} style={styles.itemChip}>
                                    <Text style={styles.itemText}>{item.partId} x{item.quantity}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Actions */}
                        <View style={styles.actionRow}>
                            {r.status === 'pending' && (
                                <>
                                    <Pressable style={styles.btnCancel} onPress={() => cancelRequest(r.id)}>
                                        <MaterialCommunityIcons name="close-circle-outline" size={18} color={Colors.danger} />
                                        <Text style={styles.btnCancelText}>Batalkan</Text>
                                    </Pressable>

                                    <Pressable style={styles.btnEdit} onPress={() => handleEdit(r)}>
                                        <MaterialCommunityIcons name="pencil-outline" size={18} color="#FFF" />
                                        <Text style={styles.btnEditText}>Edit</Text>
                                    </Pressable>
                                </>
                            )}
                            {r.status === 'delivered' && (
                                <Pressable
                                    style={[
                                        styles.btnEdit,
                                        { flex: 1, backgroundColor: Colors.primary, opacity: confirmingId === r.id ? 0.72 : 1 },
                                    ]}
                                    onPress={() => confirmDelivery(r.id)}
                                    disabled={confirmingId === r.id}
                                >
                                    <MaterialCommunityIcons name="check-circle-outline" size={18} color="#FFF" />
                                    <Text style={styles.btnEditText}>
                                        {confirmingId === r.id ? 'Memproses...' : 'Konfirmasi Terima'}
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={Colors.textMuted} />
                        <Text style={styles.emptyText}>Belum ada request</Text>
                    </View>
                }
            />

            <FAB icon="plus" label="Buat Request" onPress={openCreate}
                style={styles.fab} color={Colors.bg}
                customSize={52} />

            <Portal>
                <Modal visible={showCreate} onDismiss={closeCreate} contentContainerStyle={styles.fullScreenModal}>
                    <View style={[styles.createRoot, { paddingTop: insets.top + 4 }]}>
                        <View style={styles.createHeader}>
                            <IconButton icon="close" iconColor={Colors.text} size={26} onPress={closeCreate} />
                            <Text style={styles.createHeaderTitle}>{editingId ? 'Edit Request' : 'Buat Request Baru'}</Text>
                            <View style={styles.headerSpacer} />
                        </View>

                        <View style={styles.createBody}>
                            <View style={styles.sectionBlock}>
                                <View style={styles.sectionTitleRow}>
                                    <MaterialCommunityIcons name="calendar-month-outline" size={22} color={Colors.primary} />
                                    <Text style={styles.createSectionTitle}>Periode Request</Text>
                                </View>
                                <Text style={styles.inputHint}>Bulan (YYYY-MM)</Text>
                                <View style={styles.periodInput}>
                                    <Text style={styles.periodInputText}>{periodCode}</Text>
                                </View>
                            </View>

                            <View style={styles.sectionDivider} />

                            <View style={styles.itemsHeaderRow}>
                                <View style={styles.sectionTitleRow}>
                                    <MaterialCommunityIcons name="cart-outline" size={22} color={Colors.primary} />
                                    <Text style={styles.createSectionTitle}>Daftar Barang</Text>
                                </View>

                                <Pressable style={styles.addButton} onPress={openSelectSheet}>
                                    <MaterialCommunityIcons name="plus" size={20} color={Colors.text} />
                                    <Text style={styles.addButtonText}>Tambah</Text>
                                </Pressable>
                            </View>

                            {selectedItems.length === 0 ? (
                                <View style={styles.emptyItemsCard}>
                                    <MaterialCommunityIcons name="cart-outline" size={42} color={Colors.textMuted} />
                                    <Text style={styles.emptyItemsText}>Belum ada item ditambahkan</Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={selectedItems}
                                    keyExtractor={item => item.partId}
                                    style={styles.selectedItemsList}
                                    contentContainerStyle={styles.selectedItemsContent}
                                    renderItem={({ item }) => {
                                        const itemName = partNameById.get(item.partId) || item.partId;
                                        return (
                                            <View style={styles.selectedItemCard}>
                                                <View style={styles.selectedItemIconWrap}>
                                                    <MaterialCommunityIcons name="view-dashboard-outline" size={18} color={Colors.primary} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.selectedItemName}>{itemName}</Text>
                                                    <Text style={styles.selectedItemQty}>Qty: {item.quantity} pcs</Text>
                                                </View>
                                                <Pressable style={styles.deleteItemButton} onPress={() => removeItem(item.partId)}>
                                                    <MaterialCommunityIcons name="trash-can-outline" size={22} color={Colors.danger} />
                                                </Pressable>
                                            </View>
                                        );
                                    }}
                                />
                            )}
                        </View>

                        <View style={[styles.createFooter, { paddingBottom: Math.max(insets.bottom, 2) }]}>
                            <Pressable style={styles.sendButton} onPress={submitRequest}>
                                <MaterialCommunityIcons name="send-outline" size={22} color={Colors.bg} />
                                <Text style={styles.sendButtonText}>Kirim Request</Text>
                            </Pressable>
                        </View>

                        {step !== 'summary' && (
                            <BottomSheet
                                index={0}
                                snapPoints={activeSnapPoints}
                                enablePanDownToClose
                                onClose={() => {
                                    setStep('summary');
                                    setSelectedPart(null);
                                }}
                                backdropComponent={renderSheetBackdrop}
                                backgroundStyle={styles.sheetBackground}
                                handleStyle={styles.sheetHandleContainer}
                                handleIndicatorStyle={styles.sheetHandleIndicator}
                            >
                                {step === 'select' ? (
                                    <View style={styles.bottomSheetSelectContent}>
                                        <Text style={styles.sheetTitle}>Pilih Barang</Text>
                                        <Searchbar
                                            placeholder="Cari nama atau kode part..."
                                            value={searchQuery}
                                            onChangeText={setSearchQuery}
                                            style={styles.sheetSearch}
                                            inputStyle={styles.sheetSearchInput}
                                            iconColor={Colors.textSecondary}
                                            placeholderTextColor={Colors.textMuted}
                                        />

                                        <BottomSheetFlatList<InventoryPart>
                                            data={filteredParts}
                                            keyExtractor={(part: InventoryPart) => part.id}
                                            contentContainerStyle={styles.partListContent}
                                            renderItem={({ item: part }: { item: InventoryPart }) => (
                                                <Pressable style={styles.partRow} onPress={() => handleSelectPart(part)}>
                                                    <View style={styles.partRowIcon}>
                                                        <MaterialCommunityIcons name="cube-outline" size={20} color={Colors.primary} />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.partRowName}>{part.part_name}</Text>
                                                        <Text style={styles.partRowId}>ID: {part.id}</Text>
                                                    </View>
                                                    <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.textSecondary} />
                                                </Pressable>
                                            )}
                                            ListEmptyComponent={
                                                <View style={styles.emptyPartState}>
                                                    <MaterialCommunityIcons name="magnify-close" size={22} color={Colors.textMuted} />
                                                    <Text style={styles.emptyPartText}>Barang tidak ditemukan</Text>
                                                </View>
                                            }
                                        />
                                    </View>
                                ) : (
                                    <View style={[styles.bottomSheetQtyContent, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                                        <View style={styles.qtyHeaderRow}>
                                            <Pressable style={styles.qtyBackButton} onPress={() => setStep('select')}>
                                                <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
                                            </Pressable>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.qtyLabel}>Tentukan Jumlah</Text>
                                                <Text style={styles.qtyPartName}>{selectedPart?.part_name}</Text>
                                            </View>
                                        </View>

                                        <View style={styles.qtyPill}>
                                            <Pressable
                                                style={[styles.qtyActionButton, qty <= 1 && styles.qtyActionButtonDisabled]}
                                                onPress={() => setQty(Math.max(1, qty - 1))}
                                                disabled={qty <= 1}
                                            >
                                                <MaterialCommunityIcons name="minus" size={22} color={qty <= 1 ? Colors.textMuted : Colors.primary} />
                                            </Pressable>
                                            <Text style={styles.qtyValue}>{qty}</Text>
                                            <Pressable
                                                style={[styles.qtyActionButton, qty >= selectedPartMaxQty && styles.qtyActionButtonDisabled]}
                                                onPress={() => setQty(Math.min(selectedPartMaxQty, qty + 1))}
                                                disabled={qty >= selectedPartMaxQty}
                                            >
                                                <MaterialCommunityIcons name="plus" size={22} color={qty >= selectedPartMaxQty ? Colors.textMuted : Colors.primary} />
                                            </Pressable>
                                        </View>
                                        <Text style={styles.qtyLimitText}>
                                            Maksimal: {selectedPartMaxQty} pcs ({isLoopSheetPart(selectedPart?.part_name, selectedPart?.id) ? 'LoopSheet' : 'Part lainnya'})
                                        </Text>

                                        <Pressable style={styles.addToRequestButton} onPress={confirmQuantity}>
                                            <MaterialCommunityIcons name="check" size={18} color={Colors.bg} />
                                            <Text style={styles.addToRequestText}>Tambahkan ke Request</Text>
                                        </Pressable>
                                    </View>
                                )}
                            </BottomSheet>
                        )}
                    </View>
                </Modal>
            </Portal>

            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000}>{error}</AppSnackbar>
            <AppSnackbar visible={!!success} onDismiss={() => setSuccess('')} duration={2000}
                style={{ backgroundColor: Colors.success }}>{success}</AppSnackbar>
        </View>
    );
}
