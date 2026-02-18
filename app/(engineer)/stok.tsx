import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Pressable, TextInput, Modal as RNModal, Platform } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import WebPullToRefreshBanner from '../../src/components/WebPullToRefreshBanner';
import NotificationBell from '../../src/components/NotificationBell';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { useWebPullToRefresh } from '../../src/hooks/useWebPullToRefresh';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/config/supabase';
import { EngineerStock, InventoryPart } from '../../src/types';

interface StockItem extends EngineerStock {
    part_name?: string;
}

type StockFilter = 'all' | 'low' | 'available';
type StockEditorMode = 'adjust' | 'min';

type EngineerStockData = {
    stockRows: EngineerStock[];
    partsRows: InventoryPart[];
};

const fetchEngineerStockData = async (engineerId: string): Promise<EngineerStockData> => {
    const [stockRes, partsRes] = await Promise.all([
        supabase.from('engineer_stock').select('*').eq('engineer_id', engineerId),
        supabase.from('inventory').select('*'),
    ]);

    if (stockRes.error) throw stockRes.error;
    if (partsRes.error) throw partsRes.error;

    return {
        stockRows: stockRes.data || [],
        partsRows: partsRes.data || [],
    };
};

export default function StokPage() {
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const unreadCount = useUnreadCount();

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<StockFilter>('all');
    const [refreshing, setRefreshing] = useState(false);

    const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
    const [sheetMode, setSheetMode] = useState<StockEditorMode>('adjust');
    const [newStockValue, setNewStockValue] = useState('');
    const [minStockValue, setMinStockValue] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const editorOpen = selectedStock !== null;

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

    useEffect(() => {
        const parent = navigation.getParent();
        if (!parent) return;
        parent.setOptions({ tabBarStyle: editorOpen ? { display: 'none' } : visibleTabStyle });

        return () => {
            parent.setOptions({ tabBarStyle: visibleTabStyle });
        };
    }, [editorOpen, navigation, visibleTabStyle]);

    const stockQuery = useQuery({
        queryKey: ['engineer', 'stock', user?.id],
        queryFn: () => fetchEngineerStockData(user!.id),
        enabled: !!user?.id,
    });

    const { stocks, parts, lastSync } = useMemo(() => {
        const partsRows = stockQuery.data?.partsRows || [];
        const stockRows = stockQuery.data?.stockRows || [];

        const partsMap: Record<string, InventoryPart> = {};
        for (const part of partsRows) {
            partsMap[part.id] = part;
        }

        const stockMap = new Map(stockRows.map((row) => [row.part_id, row]));
        const items: StockItem[] = partsRows.map((part) => {
            const existing = stockMap.get(part.id);
            return {
                engineer_id: user?.id || '',
                part_id: part.id,
                quantity: existing?.quantity ?? 0,
                min_stock: existing?.min_stock ?? null,
                last_sync: existing?.last_sync ?? null,
                created_at: existing?.created_at,
                updated_at: existing?.updated_at,
                part_name: part.part_name || part.id,
            };
        });

        for (const extra of stockRows) {
            if (partsMap[extra.part_id]) continue;
            items.push({
                engineer_id: user?.id || '',
                part_id: extra.part_id,
                quantity: extra.quantity ?? 0,
                min_stock: extra.min_stock ?? null,
                last_sync: extra.last_sync ?? null,
                created_at: extra.created_at,
                updated_at: extra.updated_at,
                part_name: extra.part_id,
            });
        }

        items.sort((a, b) => (a.part_name || '').localeCompare(b.part_name || ''));

        const latestSyncMs = items.reduce((latest, item) => {
            if (!item.last_sync) return latest;
            const timestamp = new Date(item.last_sync).getTime();
            if (!Number.isFinite(timestamp)) return latest;
            return timestamp > latest ? timestamp : latest;
        }, 0);

        const formattedSync = latestSyncMs
            ? new Date(latestSyncMs).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            })
            : '';

        return { stocks: items, parts: partsMap, lastSync: formattedSync };
    }, [stockQuery.data?.partsRows, stockQuery.data?.stockRows, user?.id]);

    useEffect(() => {
        if (!stockQuery.error) return;
        const message = stockQuery.error instanceof Error ? stockQuery.error.message : 'Gagal memuat stok.';
        setError(message);
    }, [stockQuery.error]);

    const getMinStock = useCallback((item: StockItem) => {
        return item.min_stock ?? parts[item.part_id]?.min_stock ?? 5;
    }, [parts]);
    useSupabaseRealtimeRefresh(
        ['engineer_stock', 'inventory'],
        () => {
            void stockQuery.refetch();
        },
        { enabled: !!user?.id },
    );

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await stockQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    };
    const webPull = useWebPullToRefresh({
        onRefresh,
        refreshing,
        enabled: !!user,
    });

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return stocks.filter((item) => {
            const matchSearch =
                !query ||
                (item.part_name || '').toLowerCase().includes(query) ||
                item.part_id.toLowerCase().includes(query);

            if (!matchSearch) return false;
            const minValue = getMinStock(item);

            if (filter === 'low') return item.quantity <= minValue;
            if (filter === 'available') return item.quantity > minValue;
            return true;
        });
    }, [filter, getMinStock, search, stocks]);

    const totalItems = stocks.length;
    const lowStock = useMemo(
        () => stocks.filter((item) => item.quantity <= getMinStock(item)).length,
        [getMinStock, stocks]
    );

    const openEditor = (item: StockItem) => {
        setSelectedStock(item);
        setSheetMode('adjust');
        setNewStockValue(String(item.quantity));
        setMinStockValue(String(getMinStock(item)));
        setReason('');
    };

    const closeEditor = () => {
        onEditorClosed();
    };

    const onEditorClosed = () => {
        setSelectedStock(null);
        setSheetMode('adjust');
        setNewStockValue('');
        setMinStockValue('');
        setReason('');
        setSaving(false);
    };

    const sanitizeNumber = (value: string) => value.replace(/[^0-9]/g, '');

    const handleSaveAdjustment = async () => {
        if (!selectedStock || saving) return;
        if (!user?.id) {
            setError('User tidak ditemukan.');
            return;
        }

        const parsedStock = Number.parseInt(newStockValue, 10);
        if (Number.isNaN(parsedStock)) {
            setError('Stok baru wajib diisi.');
            return;
        }
        if (parsedStock < 0) {
            setError('Stok tidak boleh kurang dari 0.');
            return;
        }
        if (!reason.trim()) {
            setError('Alasan koreksi wajib diisi.');
            return;
        }

        setSaving(true);
        try {
            const nowIso = new Date().toISOString();
            const { error: updateError } = await supabase
                .from('engineer_stock')
                .upsert({
                    engineer_id: user.id,
                    part_id: selectedStock.part_id,
                    quantity: parsedStock,
                    min_stock: selectedStock.min_stock ?? null,
                    last_sync: nowIso,
                }, { onConflict: 'engineer_id,part_id' });

            if (updateError) throw updateError;

            const delta = parsedStock - selectedStock.quantity;
            const { error: insertError } = await supabase
                .from('stock_adjustments')
                .insert({
                    engineer_id: selectedStock.engineer_id,
                    engineer_name: user?.name || '',
                    part_id: selectedStock.part_id,
                    part_name: selectedStock.part_name || selectedStock.part_id,
                    previous_quantity: selectedStock.quantity,
                    new_quantity: parsedStock,
                    delta,
                    reason: reason.trim(),
                    area_group: user?.location || null,
                });

            if (insertError) throw insertError;

            closeEditor();
            await stockQuery.refetch();
            setSuccess('Koreksi stok berhasil disimpan.');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal menyimpan koreksi stok.';
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveMinStock = async () => {
        if (!selectedStock || saving) return;
        if (!user?.id) {
            setError('User tidak ditemukan.');
            return;
        }

        const parsedMin = Number.parseInt(minStockValue, 10);
        if (Number.isNaN(parsedMin)) {
            setError('Batas minimum wajib diisi.');
            return;
        }
        if (parsedMin < 0) {
            setError('Batas minimum tidak boleh kurang dari 0.');
            return;
        }

        setSaving(true);
        try {
            const nowIso = new Date().toISOString();
            const { error: updateError } = await supabase
                .from('engineer_stock')
                .upsert({
                    engineer_id: user.id,
                    part_id: selectedStock.part_id,
                    quantity: selectedStock.quantity,
                    min_stock: parsedMin,
                    last_sync: nowIso,
                }, { onConflict: 'engineer_id,part_id' });

            if (updateError) throw updateError;

            closeEditor();
            await stockQuery.refetch();
            setSuccess('Minimum stok berhasil diperbarui.');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal memperbarui minimum stok.';
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    const filterOptions = [
        { key: 'all' as const, label: 'Semua' },
        { key: 'low' as const, label: 'Low Stock' },
        { key: 'available' as const, label: 'Tersedia' },
    ];

    return (
        <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
            <FlatList
                data={filtered}
                keyExtractor={(item) => `${item.engineer_id}-${item.part_id}`}
                refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                onScroll={webPull.onScroll}
                onTouchStart={webPull.onTouchStart}
                onTouchMove={webPull.onTouchMove}
                onTouchEnd={webPull.onTouchEnd}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: 0, paddingBottom: Math.max(insets.bottom + 86, 110), gap: 12 }}
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
                            <Text style={styles.pageTitle}>Stok</Text>
                            <NotificationBell unreadCount={unreadCount} onPress={() => navigation.navigate('notifications' as never)} />
                        </View>

                        <View style={styles.titleRow}>
                            <View>
                                <Text style={styles.sectionTitle}>Stok Saya</Text>
                                {lastSync ? <Text style={styles.syncText}>Sync: {lastSync}</Text> : null}
                            </View>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryCard}>
                                    <View style={styles.summaryIconWrap}>
                                        <MaterialCommunityIcons name="cube-outline" size={18} color={Colors.primary} />
                                    </View>
                                    <View>
                                        <Text style={styles.summaryValue}>{totalItems}</Text>
                                        <Text style={styles.summaryLabel}>Total Item</Text>
                                    </View>
                                </View>
                                <View style={[styles.summaryCard, styles.summaryCardLow]}>
                                    <View style={[styles.summaryIconWrap, styles.summaryIconWrapLow]}>
                                        <MaterialCommunityIcons name="alert-outline" size={18} color={Colors.accent} />
                                    </View>
                                    <View>
                                        <Text style={[styles.summaryValue, { color: Colors.accent }]}>{lowStock}</Text>
                                        <Text style={[styles.summaryLabel, { color: '#D9A55B' }]}>Low Stock</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <View style={styles.searchPanel}>
                            <View style={styles.searchWrap}>
                                <MaterialCommunityIcons name="magnify" size={24} color={Colors.primary} />
                                <TextInput
                                    value={search}
                                    onChangeText={setSearch}
                                    placeholder="Cari part atau kode..."
                                    placeholderTextColor="#8A93A2"
                                    style={styles.searchInput}
                                />
                            </View>

                            <View style={styles.filters}>
                                {filterOptions.map((option) => {
                                    const active = filter === option.key;
                                    return (
                                        <Pressable
                                            key={option.key}
                                            onPress={() => setFilter(option.key)}
                                            style={[styles.filterPill, active && styles.filterPillActive]}
                                        >
                                            {active && (
                                                <MaterialCommunityIcons
                                                    name="check"
                                                    size={14}
                                                    color="#FFF"
                                                    style={{ marginRight: 4 }}
                                                />
                                            )}
                                            <Text style={[styles.filterText, active && styles.filterTextActive]}>
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>
                        <View style={{ height: 16 }} />
                    </>
                }
                renderItem={({ item }) => {
                    const minValue = getMinStock(item);
                    const isLow = item.quantity <= minValue;

                    return (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <View style={styles.dateIcon}>
                                    <MaterialCommunityIcons
                                        name={isLow ? 'alert-circle-outline' : 'cube-outline'}
                                        size={18}
                                        color={isLow ? Colors.accent : Colors.primary}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.cardTitle}>{item.part_name}</Text>
                                    <Text style={styles.cardSubtitle}>ID: {item.part_id}</Text>
                                </View>
                                <View style={[styles.statusBadge, isLow ? styles.statusBadgeLow : styles.statusBadgeOk]}>
                                    <Text style={[styles.statusText, { color: isLow ? Colors.accent : Colors.primary }]}>
                                        {isLow ? 'Low' : 'Tersedia'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.infoRow}>
                                <View style={styles.infoBox}>
                                    <MaterialCommunityIcons name="cube-outline" size={14} color={Colors.primary} />
                                    <View>
                                        <Text style={styles.infoBoxValue}>{item.quantity}</Text>
                                        <Text style={styles.infoBoxLabel}>Stok</Text>
                                    </View>
                                </View>
                                <View style={[styles.infoBox, styles.infoBoxAlt]}>
                                    <MaterialCommunityIcons name="arrow-down" size={14} color={Colors.accent} />
                                    <View>
                                        <Text style={[styles.infoBoxValue, { color: Colors.accent }]}>{minValue}</Text>
                                        <Text style={styles.infoBoxLabel}>Min</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.stockActionRow}>
                                <Pressable
                                    style={({ pressed }) => [styles.stockAdjustBtn, pressed && { opacity: 0.88 }]}
                                    onPress={() => openEditor(item)}
                                    hitSlop={6}
                                >
                                    <MaterialCommunityIcons name="pencil-outline" size={18} color="#FFF" />
                                    <Text style={styles.stockAdjustBtnText}>Koreksi</Text>
                                </Pressable>
                            </View>
                        </View>
                    );
                }}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <MaterialCommunityIcons name="package-variant-closed" size={48} color={Colors.textMuted} />
                        <Text style={styles.emptyText}>Belum ada data stok</Text>
                    </View>
                }
            />

            <RNModal
                visible={!!selectedStock}
                transparent
                animationType="slide"
                onRequestClose={onEditorClosed}
            >
                {selectedStock ? (
                    <View style={styles.sheetModalContainer}>
                        <Pressable style={styles.sheetBackdrop} onPress={onEditorClosed} />
                        <View style={[styles.sheetModalCard, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                            <View style={styles.sheetHandleIndicator} />

                            <View style={styles.sheetBody}>
                                <View style={styles.modeSwitch}>
                                    <Pressable
                                        style={[styles.modeBtn, styles.modeBtnLeft, sheetMode === 'adjust' && styles.modeBtnActive]}
                                        onPress={() => setSheetMode('adjust')}
                                    >
                                        <MaterialCommunityIcons
                                            name="check"
                                            size={18}
                                            color={sheetMode === 'adjust' ? '#DDF7F0' : '#E4EAF4'}
                                        />
                                        <Text style={[styles.modeBtnText, sheetMode === 'adjust' && styles.modeBtnTextActive]}>
                                            Koreksi Stok
                                        </Text>
                                    </Pressable>

                                    <Pressable
                                        style={[styles.modeBtn, styles.modeBtnRight, sheetMode === 'min' && styles.modeBtnActive]}
                                        onPress={() => setSheetMode('min')}
                                    >
                                        <MaterialCommunityIcons
                                            name="shield-crown-outline"
                                            size={18}
                                            color={sheetMode === 'min' ? '#DDF7F0' : '#E4EAF4'}
                                        />
                                        <Text style={[styles.modeBtnText, sheetMode === 'min' && styles.modeBtnTextActive]}>
                                            Set Min Stock
                                        </Text>
                                    </Pressable>
                                </View>

                                <Text style={styles.sheetPartName}>{selectedStock.part_name}</Text>
                                <Text style={styles.sheetPartId}>ID: {selectedStock.part_id}</Text>

                                {sheetMode === 'adjust' ? (
                                    <>
                                        <Text style={styles.sheetSectionTitle}>Catatan</Text>
                                        <Text style={styles.sheetNote}>
                                            Koreksi akan mengubah stok menjadi angka yang Anda isi (bisa turun/naik). Stok tidak boleh kurang dari 0.
                                        </Text>

                                        <View style={styles.inputContainer}>
                                            <MaterialCommunityIcons name="pound" size={28} color="#E7EDF6" />
                                            <TextInput
                                                value={newStockValue}
                                                onChangeText={(value) => setNewStockValue(sanitizeNumber(value))}
                                                keyboardType="number-pad"
                                                placeholder="Stok Baru"
                                                placeholderTextColor="#99A2B0"
                                                style={styles.inputText}
                                            />
                                        </View>
                                        <Text style={styles.currentStockText}>Stok sekarang: {selectedStock.quantity}</Text>

                                        <View style={styles.inputContainer}>
                                            <MaterialCommunityIcons name="text-box-edit-outline" size={25} color="#E7EDF6" />
                                            <TextInput
                                                value={reason}
                                                onChangeText={setReason}
                                                placeholder="Alasan (Wajib)"
                                                placeholderTextColor="#99A2B0"
                                                style={styles.inputText}
                                            />
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.sheetSectionTitle}>Minimum Stock</Text>
                                        <Text style={styles.sheetNote}>
                                            Atur batas minimum stok untuk diri Anda sendiri. Mengabaikan setting global ({parts[selectedStock.part_id]?.min_stock ?? 5}).
                                        </Text>

                                        <Text style={styles.inputCaption}>Batas Minimum</Text>
                                        <View style={styles.inputContainer}>
                                            <MaterialCommunityIcons name="alert-outline" size={26} color="#E7EDF6" />
                                            <TextInput
                                                value={minStockValue}
                                                onChangeText={(value) => setMinStockValue(sanitizeNumber(value))}
                                                keyboardType="number-pad"
                                                placeholder="0"
                                                placeholderTextColor="#99A2B0"
                                                style={styles.inputText}
                                            />
                                        </View>
                                    </>
                                )}

                                <View style={styles.actionRow}>
                                    <Pressable style={styles.cancelBtn} onPress={closeEditor}>
                                        <Text style={styles.cancelBtnText}>Batal</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.saveBtn, saving && styles.btnDisabled]}
                                        onPress={sheetMode === 'adjust' ? handleSaveAdjustment : handleSaveMinStock}
                                        disabled={saving}
                                    >
                                        <MaterialCommunityIcons name="content-save-outline" size={21} color="#08362E" />
                                        <Text style={styles.saveBtnText}>{saving ? 'Menyimpan...' : 'Simpan'}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </View>
                ) : null}
            </RNModal>

            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000}>
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
    container: {
        flex: 1,
        backgroundColor: Colors.bg,
        paddingHorizontal: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerSpacer: {
        width: 48,
    },
    pageTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    titleRow: {
        marginTop: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 10,
    },
    sectionTitle: {
        fontSize: 24,
        color: Colors.text,
        fontWeight: '700',
    },
    syncText: {
        marginTop: 4,
        color: '#A2ACBA',
        fontSize: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    summaryCard: {
        minWidth: 118,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#0F4E58',
        backgroundColor: '#0B2531',
    },
    summaryCardLow: {
        borderColor: '#5C441E',
        backgroundColor: '#2A2113',
    },
    summaryIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0B343C',
    },
    summaryIconWrapLow: {
        backgroundColor: '#3E3016',
    },
    summaryValue: {
        fontSize: 18,
        color: Colors.primary,
        fontWeight: '700',
        lineHeight: 20,
    },
    summaryLabel: {
        color: '#7BC8C6',
        fontSize: 11,
    },
    searchPanel: {
        marginTop: 12,
        gap: 10,
    },
    searchWrap: {
        height: 50,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#313443',
        backgroundColor: '#1A1D25',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        color: Colors.text,
        fontSize: 14,
        paddingVertical: 0,
    },
    filters: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 2,
    },
    filterPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1F2937',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#374151',
    },
    filterPillActive: {
        backgroundColor: '#1F2937',
        borderColor: Colors.primary,
    },
    filterText: {
        color: Colors.textSecondary,
        fontSize: 13,
        fontWeight: '500',
    },
    filterTextActive: {
        color: Colors.primary,
        fontSize: 13,
        fontWeight: '600',
    },
    card: {
        backgroundColor: '#111827',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: '#1F2937',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
    },
    dateIcon: {
        width: 38,
        height: 38,
        borderRadius: 11,
        backgroundColor: '#0D3D30',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.primary,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text,
    },
    cardSubtitle: {
        fontSize: 11,
        color: Colors.textMuted,
        marginTop: 1,
    },
    statusBadge: {
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
    },
    statusBadgeLow: {
        borderColor: Colors.accent + '70',
        backgroundColor: Colors.accent + '20',
    },
    statusBadgeOk: {
        borderColor: Colors.primary + '70',
        backgroundColor: Colors.primary + '20',
    },
    statusText: {
        fontSize: 11,
        fontWeight: '600',
    },
    infoRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    infoBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#0D3D30',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: Colors.primary + '40',
    },
    infoBoxAlt: {
        borderColor: Colors.accent + '40',
        backgroundColor: Colors.accent + '10',
    },
    infoBoxValue: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.text,
    },
    infoBoxLabel: {
        fontSize: 10,
        color: Colors.textMuted,
    },
    stockActionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    stockAdjustBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#2F4F4F',
        borderRadius: 18,
        paddingVertical: 10,
    },
    stockAdjustBtnText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 13,
    },
    empty: {
        alignItems: 'center',
        marginTop: 40,
        gap: 12,
    },
    emptyText: {
        color: Colors.textMuted,
        fontSize: 16,
    },
    sheetModalContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheetBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.58)',
    },
    sheetModalCard: {
        width: '100%',
        backgroundColor: '#0A0F18',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 10,
        paddingHorizontal: 18,
    },
    sheetHandleIndicator: {
        width: 44,
        height: 5,
        borderRadius: 999,
        backgroundColor: '#D8E0EC',
        alignSelf: 'center',
        marginBottom: 12,
    },
    sheetBody: {
        gap: 12,
    },
    modeSwitch: {
        flexDirection: 'row',
        borderRadius: 30,
        borderWidth: 1,
        borderColor: '#5D6A7C',
        overflow: 'hidden',
        marginBottom: 4,
    },
    modeBtn: {
        flex: 1,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: 'transparent',
    },
    modeBtnLeft: {
        borderRightWidth: 1,
        borderRightColor: '#5D6A7C',
    },
    modeBtnRight: {
        borderLeftWidth: 0,
    },
    modeBtnActive: {
        backgroundColor: '#365A56',
    },
    modeBtnText: {
        color: '#E4EAF4',
        fontSize: 14,
        fontWeight: '600',
    },
    modeBtnTextActive: {
        color: '#E9FFF9',
    },
    sheetPartName: {
        color: Colors.text,
        fontSize: 30,
        fontWeight: '700',
        lineHeight: 34,
    },
    sheetPartId: {
        color: '#A5B0C0',
        fontSize: 17,
        marginTop: -2,
    },
    sheetSectionTitle: {
        marginTop: 8,
        color: Colors.text,
        fontSize: 22,
        fontWeight: '700',
    },
    sheetNote: {
        color: '#B1BBCB',
        fontSize: 14,
        lineHeight: 20,
    },
    inputCaption: {
        color: '#C8D0DC',
        fontSize: 14,
        marginTop: 4,
    },
    inputContainer: {
        height: 54,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#4A5568',
        backgroundColor: '#171E28',
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    inputText: {
        flex: 1,
        color: Colors.text,
        fontSize: 18,
        paddingVertical: 0,
    },
    currentStockText: {
        marginTop: -2,
        color: '#99A5B8',
        fontSize: 15,
        marginBottom: 2,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 2,
    },
    cancelBtn: {
        flex: 1,
        height: 52,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#7A8496',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    cancelBtnText: {
        color: Colors.primary,
        fontSize: 17,
        fontWeight: '700',
    },
    saveBtn: {
        flex: 1,
        height: 52,
        borderRadius: 18,
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    saveBtnText: {
        color: '#08362E',
        fontSize: 17,
        fontWeight: '700',
    },
    btnDisabled: {
        opacity: 0.64,
    },
});
