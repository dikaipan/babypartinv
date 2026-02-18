import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Pressable, BackHandler, Platform } from 'react-native';
import { Text, TextInput, IconButton, Searchbar } from 'react-native-paper';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import WebPullToRefreshBanner from '../../src/components/WebPullToRefreshBanner';
import NotificationBell from '../../src/components/NotificationBell';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { useWebPullToRefresh } from '../../src/hooks/useWebPullToRefresh';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/config/supabase';
import { UsageReport, UsageItem, EngineerStock } from '../../src/types';

type StockWithName = EngineerStock & { part_name?: string };
const SO_NUMBER_MIN_DIGIT_LENGTH = 8; // YYYYMMDD
const SO_NUMBER_MAX_DIGIT_LENGTH = 20;
const USAGE_HISTORY_LIMIT = 5;
const SO_NUMBER_PATTERN = new RegExp(`^\\d{${SO_NUMBER_MIN_DIGIT_LENGTH},${SO_NUMBER_MAX_DIGIT_LENGTH}}$`);

const fetchEngineerUsageReports = async (engineerId: string): Promise<UsageReport[]> => {
    let response: any = await supabase
        .from('usage_reports')
        .select('id, engineer_id, so_number, description, items, date')
        .eq('engineer_id', engineerId)
        .order('date', { ascending: false })
        .limit(USAGE_HISTORY_LIMIT);

    if (response.error) throw response.error;

    const rows = Array.isArray(response.data) ? (response.data as UsageReport[]) : [];

    return rows.map((row) => ({
        ...row,
        date: row.date || new Date().toISOString(),
    }));
};

const fetchEngineerUsageStocks = async (engineerId: string): Promise<StockWithName[]> => {
    const [stockRes, partsRes] = await Promise.all([
        supabase
            .from('engineer_stock')
            .select('engineer_id, part_id, quantity, min_stock, last_sync, created_at, updated_at')
            .eq('engineer_id', engineerId)
            .gt('quantity', 0),
        supabase.from('inventory').select('id, part_name'),
    ]);

    if (stockRes.error) throw stockRes.error;
    if (partsRes.error) throw partsRes.error;

    const partsMap: Record<string, string> = {};
    (partsRes.data || []).forEach((p) => { partsMap[p.id] = p.part_name; });

    return (stockRes.data || []).map((s) => ({ ...s, part_name: partsMap[s.part_id] || s.part_id }));
};

const hasValidSoDatePrefix = (value: string): boolean => {
    const datePrefix = value.slice(0, SO_NUMBER_MIN_DIGIT_LENGTH);
    if (!/^\d{8}$/.test(datePrefix)) return false;

    const year = Number(datePrefix.slice(0, 4));
    const month = Number(datePrefix.slice(4, 6));
    const day = Number(datePrefix.slice(6, 8));

    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

export default function PemakaianPage() {
    const { user } = useAuthStore();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<any>();
    const unreadCount = useUnreadCount();
    const [soNumber, setSoNumber] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState<UsageItem[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [sending, setSending] = useState(false);
    const [step, setStep] = useState<'summary' | 'select' | 'quantity'>('summary');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<StockWithName | null>(null);
    const [qty, setQty] = useState(1);

    const selectSnapPoints = useMemo(() => ['78%'], []);
    const qtySnapPoints = useMemo(() => ['44%'], []);
    const activeSnapPoints = useMemo(
        () => (step === 'select' ? selectSnapPoints : qtySnapPoints),
        [step, selectSnapPoints, qtySnapPoints]
    );
    const sheetOpen = step !== 'summary';
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
    const reportsQuery = useQuery({
        queryKey: ['engineer', 'usageReports', user?.id],
        queryFn: () => fetchEngineerUsageReports(user!.id),
        enabled: !!user?.id,
    });
    const stocksQuery = useQuery({
        queryKey: ['engineer', 'usageStocks', user?.id],
        queryFn: () => fetchEngineerUsageStocks(user!.id),
        enabled: !!user?.id,
    });
    const reports = useMemo(() => (reportsQuery.data || []).slice(0, USAGE_HISTORY_LIMIT), [reportsQuery.data]);
    const stocks = stocksQuery.data || [];
    const loadingStocks = stocksQuery.isFetching;

    useEffect(() => {
        const sourceError = reportsQuery.error || stocksQuery.error;
        if (!sourceError) return;
        const message = sourceError instanceof Error ? sourceError.message : 'Gagal memuat data pemakaian.';
        setError(message);
    }, [reportsQuery.error, stocksQuery.error]);

    useSupabaseRealtimeRefresh(
        ['usage_reports'],
        () => {
            void reportsQuery.refetch();
        },
        { enabled: !!user?.id },
    );
    useSupabaseRealtimeRefresh(
        ['engineer_stock', 'inventory'],
        () => {
            void stocksQuery.refetch();
        },
        { enabled: !!user?.id },
    );
    useFocusEffect(useCallback(() => {
        const onBackPress = () => {
            if (step === 'quantity') {
                setStep('select');
                return true;
            }
            if (step === 'select') {
                setStep('summary');
                setSelectedStock(null);
                setQty(1);
                return true;
            }
            return false;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [step]));

    useEffect(() => {
        const parent = navigation.getParent();
        if (!parent) return;

        parent.setOptions({
            tabBarStyle: sheetOpen ? { display: 'none' } : visibleTabStyle,
        });

        return () => {
            parent.setOptions({ tabBarStyle: visibleTabStyle });
        };
    }, [navigation, sheetOpen, visibleTabStyle]);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([reportsQuery.refetch(), stocksQuery.refetch()]);
        } finally {
            setRefreshing(false);
        }
    };
    const webPull = useWebPullToRefresh({
        onRefresh,
        refreshing,
        enabled: !!user,
    });

    const openSelectSheet = () => {
        setSearchQuery('');
        setStep('select');
        if (!loadingStocks) {
            void stocksQuery.refetch();
        }
    };

    const openQuantitySheet = (stock: StockWithName) => {
        const existing = items.find(i => i.partId === stock.part_id);
        const initialQty = existing ? Math.min(existing.quantity, stock.quantity) : 1;
        setSelectedStock(stock);
        setQty(Math.max(1, initialQty));
        setStep('quantity');
    };

    const confirmQuantity = () => {
        if (!selectedStock) return;
        const safeQty = Math.max(1, Math.min(qty, selectedStock.quantity));

        setItems(prev => {
            const exists = prev.find(i => i.partId === selectedStock.part_id);
            if (exists) {
                return prev.map(i => i.partId === selectedStock.part_id
                    ? { ...i, partName: selectedStock.part_name || selectedStock.part_id, quantity: safeQty }
                    : i
                );
            }
            return [...prev, { partId: selectedStock.part_id, partName: selectedStock.part_name || selectedStock.part_id, quantity: safeQty }];
        });

        setSelectedStock(null);
        setQty(1);
        setStep('summary');
    };

    const removeUsageItem = (partId: string) => {
        setItems(prev => prev.filter(i => i.partId !== partId));
    };

    const filteredStocks = useMemo(() => {
        const keyword = searchQuery.trim().toLowerCase();
        if (!keyword) return stocks;

        return stocks.filter(stock =>
            (stock.part_name || '').toLowerCase().includes(keyword) ||
            stock.part_id.toLowerCase().includes(keyword)
        );
    }, [stocks, searchQuery]);

    const partNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const stock of stocks) map.set(stock.part_id, stock.part_name || stock.part_id);
        return map;
    }, [stocks]);
    const handleChangeSoNumber = (value: string) => {
        const numericOnly = value.replace(/\D/g, '').slice(0, SO_NUMBER_MAX_DIGIT_LENGTH);
        setSoNumber(numericOnly);
    };

    const submitReport = async () => {
        if (!user) return;
        const normalizedSoNumber = soNumber.trim();
        if (!normalizedSoNumber) { setError('Nomor SO / Tiket wajib diisi'); return; }
        if (!SO_NUMBER_PATTERN.test(normalizedSoNumber)) {
            setError('Nomor SO / Tiket minimal 8 digit angka (contoh: 20260217).');
            return;
        }
        if (!hasValidSoDatePrefix(normalizedSoNumber)) {
            setError('8 digit pertama Nomor SO / Tiket harus tanggal valid format YYYYMMDD (contoh: 20260217).');
            return;
        }
        if (items.length === 0) { setError('Tambahkan minimal 1 barang'); return; }
        setSending(true);
        try {
            const partIds = Array.from(new Set(items.map(item => item.partId)));
            const { data: currentStocks, error: stockError } = await supabase
                .from('engineer_stock')
                .select('part_id, quantity')
                .eq('engineer_id', user.id)
                .in('part_id', partIds);
            if (stockError) throw stockError;

            const stockMap = new Map<string, number>();
            for (const stock of currentStocks || []) stockMap.set(stock.part_id, stock.quantity);

            const invalidItem = items.find(item => item.quantity > (stockMap.get(item.partId) || 0));
            if (invalidItem) {
                const available = stockMap.get(invalidItem.partId) || 0;
                const itemName = invalidItem.partName || partNameById.get(invalidItem.partId) || invalidItem.partId;
                setError(`Stok ${itemName} tidak cukup. Tersedia ${available} pcs.`);
                await stocksQuery.refetch();
                return;
            }

            const reportItems = items.map(item => ({
                ...item,
                partName: item.partName || partNameById.get(item.partId) || item.partId,
            }));

            // Insert usage report
            const { error: err } = await supabase.from('usage_reports').insert({
                engineer_id: user.id,
                so_number: normalizedSoNumber,
                description: description.trim() || null,
                items: reportItems,
            });
            if (err) throw err;

            // Decrement engineer stock
            const nowIso = new Date().toISOString();
            const updateResults = await Promise.all(reportItems.map(item => {
                const currentQty = stockMap.get(item.partId) || 0;
                const newQty = Math.max(0, currentQty - item.quantity);
                return supabase.from('engineer_stock')
                    .update({ quantity: newQty, last_sync: nowIso })
                    .eq('engineer_id', user.id)
                    .eq('part_id', item.partId);
            }));
            const stockUpdateError = updateResults.find(r => r.error)?.error;
            if (stockUpdateError) throw stockUpdateError;

            setSoNumber('');
            setDescription('');
            setItems([]);
            setStep('summary');
            setSelectedStock(null);
            setQty(1);
            setSuccess('Laporan pemakaian berhasil dikirim!');
            await Promise.all([reportsQuery.refetch(), stocksQuery.refetch()]);
        } catch (e: any) {
            setError(e.message || 'Gagal mengirim laporan');
        } finally {
            setSending(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: 12 }]}>


            <FlatList
                data={reports}
                keyExtractor={r => r.id}
                refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                onScroll={webPull.onScroll}
                onTouchStart={webPull.onTouchStart}
                onTouchMove={webPull.onTouchMove}
                onTouchEnd={webPull.onTouchEnd}
                scrollEventThrottle={16}
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
                            <Text style={styles.pageTitle}>Pemakaian</Text>
                            <NotificationBell unreadCount={unreadCount} onPress={() => navigation.navigate('notifications' as never)} />
                        </View>
                        <Text style={styles.sectionTitle}>Lapor Pemakaian</Text>
                        <Text style={styles.sectionSubtitle}>
                            Input barang yang digunakan untuk service. Stok anda akan berkurang otomatis.
                        </Text>

                        <View>
                            {/* Form */}
                            <View style={styles.sectionCard}>
                                <View style={styles.sectionTitleRow}>
                                    <MaterialCommunityIcons name="file-document-edit" size={20} color={Colors.primary} />
                                    <Text style={styles.blockTitle}>Data Service</Text>
                                </View>
                                <TextInput
                                    mode="outlined"
                                    label="Nomor SO / Tiket"
                                    value={soNumber}
                                    onChangeText={handleChangeSoNumber}
                                    keyboardType="number-pad"
                                    maxLength={SO_NUMBER_MAX_DIGIT_LENGTH}
                                    placeholder="Contoh: 20260217 atau 2026021700530"
                                    style={styles.input}
                                    outlineColor={Colors.border}
                                    activeOutlineColor={Colors.primary}
                                    textColor={Colors.text}
                                />
                                <Text style={styles.inputHint}>Minimal 8 digit angka, diawali tanggal YYYYMMDD (contoh: 20260217)</Text>
                                <TextInput
                                    mode="outlined"
                                    label="Catatan (Opsional)"
                                    value={description}
                                    onChangeText={setDescription}
                                    style={styles.input}
                                    outlineColor={Colors.border}
                                    activeOutlineColor={Colors.primary}
                                    textColor={Colors.text}
                                />
                            </View>

                            {/* Items */}
                            <View style={styles.sectionCard}>
                                <View style={styles.itemsHeader}>
                                    <MaterialCommunityIcons name="package-variant" size={20} color={Colors.primary} />
                                    <Text style={styles.blockTitle}>Barang Digunakan</Text>
                                    <Pressable style={styles.addButton} onPress={openSelectSheet}>
                                        <MaterialCommunityIcons name="plus" size={18} color={Colors.text} />
                                        <Text style={styles.addButtonText}>Tambah</Text>
                                    </Pressable>
                                </View>
                                {items.length === 0 ? (
                                    <View style={styles.emptyItemsCard}>
                                        <MaterialCommunityIcons name="file-document-outline" size={32} color={Colors.textMuted} />
                                        <Text style={styles.emptyItemsText}>Belum ada item ditambahkan</Text>
                                    </View>
                                ) : (
                                    items.map((item, idx) => (
                                        <View key={idx} style={styles.selectedItemRow}>
                                            <View style={styles.selectedItemIcon}>
                                                <MaterialCommunityIcons name="cube-outline" size={18} color={Colors.primary} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.selectedItemName}>{item.partName || item.partId}</Text>
                                                <Text style={styles.selectedItemStock}>Dipakai: {item.quantity} pcs</Text>
                                            </View>
                                            <Pressable
                                                style={styles.selectedItemQtyPill}
                                                onPress={() => {
                                                    const stock = stocks.find(s => s.part_id === item.partId);
                                                    if (!stock) {
                                                        setError('Stok item ini sudah habis. Muat ulang data stok.');
                                                        return;
                                                    }
                                                    openQuantitySheet(stock);
                                                }}
                                            >
                                                <Text style={styles.selectedItemQtyText}>{item.quantity} pcs</Text>
                                            </Pressable>
                                            <Pressable style={styles.removeItemButton} onPress={() => removeUsageItem(item.partId)}>
                                                <MaterialCommunityIcons name="close" size={16} color={Colors.danger} />
                                            </Pressable>
                                        </View>
                                    ))
                                )}
                            </View>

                            <Pressable style={[styles.submitButton, sending && { opacity: 0.72 }]} onPress={submitReport} disabled={sending}>
                                <MaterialCommunityIcons name="check" size={20} color={Colors.bg} />
                                <Text style={styles.submitButtonText}>{sending ? 'Mengirim...' : 'Tambahkan ke Laporan'}</Text>
                            </Pressable>

                            {/* History */}
                            <View style={styles.historyHeader}>
                                <Text style={styles.historyTitle}>Riwayat Pemakaian</Text>
                                <IconButton icon="refresh" size={20} iconColor={Colors.textSecondary} onPress={() => void reportsQuery.refetch()} />
                            </View>
                        </View>
                    </>
                }
                contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 20, gap: 8 }}
                renderItem={({ item: r }) => (
                    <View style={styles.historyCard}>
                        <View style={styles.historyRow}>
                            <MaterialCommunityIcons name="file-document" size={18} color={Colors.primary} />
                            <Text style={styles.historySo}>{r.so_number}</Text>
                            <Text style={styles.historyDate}>{new Date(r.date).toLocaleString('id-ID')}</Text>
                        </View>
                        <Text style={styles.historyLabel}>Barang Digunakan:</Text>
                        {(r.items as UsageItem[]).map((item, idx) => (
                            <View key={idx} style={styles.historyItem}>
                                <MaterialCommunityIcons name="check-decagram" size={14} color={Colors.success} />
                                <Text style={styles.historyItemName}>{item.partName || item.partId}</Text>
                                <View style={styles.historyItemQty}>
                                    <Text style={styles.historyItemQtyText}>{item.quantity} pcs</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
                ListEmptyComponent={null}
            />

            {sheetOpen && (
                <BottomSheet
                    index={0}
                    snapPoints={activeSnapPoints}
                    enablePanDownToClose
                    onClose={() => {
                        setStep('summary');
                        setSelectedStock(null);
                        setQty(1);
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

                            <BottomSheetFlatList<StockWithName>
                                data={filteredStocks}
                                keyExtractor={(stock: StockWithName) => stock.part_id}
                                contentContainerStyle={styles.stockListContent}
                                renderItem={({ item: stock }: { item: StockWithName }) => (
                                    <Pressable style={styles.stockRow} onPress={() => openQuantitySheet(stock)}>
                                        <View style={styles.stockRowIcon}>
                                            <MaterialCommunityIcons name="cube-outline" size={20} color={Colors.primary} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.stockName}>{stock.part_name || stock.part_id}</Text>
                                            <Text style={styles.stockQty}>Stok: {stock.quantity} pcs</Text>
                                        </View>
                                        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.textSecondary} />
                                    </Pressable>
                                )}
                                ListEmptyComponent={
                                    <View style={styles.emptyStockState}>
                                        <MaterialCommunityIcons name={loadingStocks ? 'timer-sand' : 'magnify-close'} size={22} color={Colors.textMuted} />
                                        <Text style={styles.emptyStockText}>
                                            {loadingStocks ? 'Memuat stok...' : 'Tidak ada barang tersedia'}
                                        </Text>
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
                                    <Text style={styles.qtyPartName}>{selectedStock?.part_name || selectedStock?.part_id}</Text>
                                </View>
                            </View>

                            <View style={styles.qtyPill}>
                                <Pressable
                                    style={[styles.qtyActionButton, qty <= 1 && styles.qtyActionButtonDisabled]}
                                    onPress={() => setQty(prev => Math.max(1, prev - 1))}
                                    disabled={qty <= 1}
                                >
                                    <MaterialCommunityIcons name="minus" size={30} color={qty <= 1 ? Colors.textMuted : Colors.primary} />
                                </Pressable>
                                <Text style={styles.qtyValue}>{qty}</Text>
                                <Pressable
                                    style={[
                                        styles.qtyActionButton,
                                        qty >= (selectedStock?.quantity || 0) && styles.qtyActionButtonDisabled,
                                    ]}
                                    onPress={() => {
                                        if (!selectedStock) return;
                                        setQty(prev => Math.min(selectedStock.quantity, prev + 1));
                                    }}
                                    disabled={qty >= (selectedStock?.quantity || 0)}
                                >
                                    <MaterialCommunityIcons name="plus" size={30} color={qty >= (selectedStock?.quantity || 0) ? Colors.textMuted : Colors.primary} />
                                </Pressable>
                            </View>

                            <Text style={styles.qtyStockInfo}>Tersedia: {selectedStock?.quantity || 0} pcs</Text>

                            <Pressable style={styles.addToReportButton} onPress={confirmQuantity}>
                                <MaterialCommunityIcons name="check" size={18} color={Colors.bg} />
                                <Text style={styles.addToReportText}>Tambahkan ke Laporan</Text>
                            </Pressable>
                        </View>
                    )}
                </BottomSheet>
            )}

            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000}>{error}</AppSnackbar>
            <AppSnackbar visible={!!success} onDismiss={() => setSuccess('')} duration={2000}
                style={{ backgroundColor: Colors.success }}>{success}</AppSnackbar>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerSpacer: { width: 48 },
    pageTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600', color: Colors.text },
    sectionTitle: { fontSize: 28, fontWeight: '700', color: Colors.text, marginTop: 6 },
    sectionSubtitle: { fontSize: 15, color: Colors.textSecondary, marginTop: 6, marginBottom: 12, lineHeight: 22 },
    sectionCard: {
        backgroundColor: '#0A1017',
        borderRadius: 18,
        padding: 16,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#1B2A34',
        gap: 12,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    blockTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1 },
    input: { backgroundColor: Colors.surface },
    inputHint: {
        marginTop: -6,
        marginBottom: 2,
        fontSize: 12,
        color: Colors.textMuted,
    },
    itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    addButton: {
        height: 46,
        minWidth: 120,
        borderRadius: 14,
        backgroundColor: '#304047',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 14,
    },
    addButtonText: { fontSize: 14, color: Colors.text, fontWeight: '700' },
    emptyItemsCard: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#1A2A31',
        backgroundColor: '#111E24',
        minHeight: 136,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 20,
    },
    emptyItemsText: { color: Colors.textSecondary, fontSize: 14 },
    selectedItemRow: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#1A2A31',
        backgroundColor: '#071217',
        paddingVertical: 9,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    selectedItemIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#0A2624',
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectedItemName: { fontSize: 14, fontWeight: '700', color: Colors.text },
    selectedItemStock: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
    selectedItemQtyPill: {
        backgroundColor: Colors.primary + '20',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.primary + '45',
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    selectedItemQtyText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
    removeItemButton: {
        width: 30,
        height: 28,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.danger + '45',
        backgroundColor: Colors.danger + '12',
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitButton: {
        height: 56,
        borderRadius: 16,
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
    },
    submitButtonText: { color: Colors.bg, fontSize: 16, fontWeight: '700' },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    historyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
    historyCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    historySo: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
    historyDate: { fontSize: 11, color: Colors.textMuted },
    historyLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
    historyItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    historyItemName: { flex: 1, fontSize: 13, color: Colors.textSecondary },
    historyItemQty: { backgroundColor: Colors.primary + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    historyItemQtyText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
    sheetBackground: {
        backgroundColor: '#0D0E13',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
        borderColor: '#222531',
    },
    sheetHandleContainer: {
        paddingTop: 8,
    },
    sheetHandleIndicator: {
        width: 52,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#5A6A72',
    },
    bottomSheetSelectContent: {
        flex: 1,
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    sheetTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text,
        textAlign: 'center',
        marginBottom: 12,
    },
    sheetSearch: {
        marginBottom: 10,
        backgroundColor: '#1A1D25',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#313443',
        elevation: 0,
    },
    sheetSearchInput: {
        fontSize: 15,
        color: Colors.text,
    },
    stockListContent: {
        paddingBottom: 24,
        gap: 8,
    },
    stockRow: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#242A36',
        backgroundColor: '#10131A',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 10,
    },
    stockRowIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0D2D2A',
    },
    stockName: {
        fontSize: 15,
        color: Colors.text,
        fontWeight: '700',
    },
    stockQty: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    emptyStockState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        gap: 8,
    },
    emptyStockText: {
        color: Colors.textMuted,
        fontSize: 12,
    },
    bottomSheetQtyContent: {
        paddingHorizontal: 16,
        paddingTop: 6,
        gap: 14,
    },
    qtyHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    qtyBackButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#1D2029',
        alignItems: 'center',
        justifyContent: 'center',
    },
    qtyLabel: {
        fontSize: 16,
        color: Colors.text,
        fontWeight: '600',
    },
    qtyPartName: {
        fontSize: 18,
        color: Colors.text,
        fontWeight: '700',
        marginTop: 2,
    },
    qtyPill: {
        borderRadius: 26,
        borderWidth: 1,
        borderColor: '#393D48',
        backgroundColor: '#1B1F28',
        minHeight: 92,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    qtyActionButton: {
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: '#0F171C',
        alignItems: 'center',
        justifyContent: 'center',
    },
    qtyActionButtonDisabled: {
        backgroundColor: '#171B23',
    },
    qtyValue: {
        fontSize: 32,
        color: Colors.primary,
        fontWeight: '700',
        minWidth: 84,
        textAlign: 'center',
    },
    qtyStockInfo: {
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    addToReportButton: {
        height: 56,
        borderRadius: 16,
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
    },
    addToReportText: {
        color: Colors.bg,
        fontSize: 18,
        fontWeight: '700',
    },
});
