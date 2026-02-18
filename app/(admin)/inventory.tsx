import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, useWindowDimensions, Pressable, Share, Platform, ScrollView } from 'react-native';
import { Text, Searchbar, Portal, Modal, TextInput, Button, Chip } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import { supabase } from '../../src/config/supabase';
import { InventoryPart } from '../../src/types';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { adminStyles } from '../../src/styles/adminStyles';
import { useAdminUiStore, ADMIN_SIDEBAR_WIDTH, ADMIN_SIDEBAR_COLLAPSED_WIDTH } from '../../src/stores/adminUiStore';

type StockEditorMode = 'adjust' | 'add';
type SummaryFilter = 'all' | 'low' | 'out';

const EMPTY_FORM = { id: '', part_name: '', total_stock: '0', min_stock: '0' };

const escapeCsvValue = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const fetchInventoryParts = async (): Promise<InventoryPart[]> => {
    const { data, error } = await supabase
        .from('inventory')
        .select('id, part_name, total_stock, min_stock, last_updated')
        .order('part_name');
    if (error) throw error;
    return data || [];
};

export default function InventoryPage() {
    const { width } = useWindowDimensions();
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [showPartModal, setShowPartModal] = useState(false);
    const [editPart, setEditPart] = useState<InventoryPart | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);

    const [stockEditorPart, setStockEditorPart] = useState<InventoryPart | null>(null);
    const [stockEditorMode, setStockEditorMode] = useState<StockEditorMode>('adjust');
    const [stockValue, setStockValue] = useState('');
    const [savingStock, setSavingStock] = useState(false);
    const [exportingCsv, setExportingCsv] = useState(false);
    const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('all');

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const isWide = width >= 768;
    const sidebarOpen = useAdminUiStore((state) => state.sidebarOpen);
    const sidebarWidth = isWide ? (sidebarOpen ? ADMIN_SIDEBAR_WIDTH : ADMIN_SIDEBAR_COLLAPSED_WIDTH) : 0;
    const effectiveWidth = width - sidebarWidth;
    const numColumns = isWide ? 2 : 1;
    const cardGap = 16;
    const cardWidth = (effectiveWidth - 40 - (cardGap * (numColumns - 1))) / numColumns;
    const inventoryQuery = useQuery({
        queryKey: ['admin', 'inventory'],
        queryFn: fetchInventoryParts,
    });
    const parts = inventoryQuery.data || [];

    const sanitizeNumber = (value: string) => value.replace(/[^0-9]/g, '');
    useSupabaseRealtimeRefresh(
        ['inventory'],
        () => {
            void inventoryQuery.refetch();
        },
    );

    useEffect(() => {
        if (!inventoryQuery.error) return;
        const message = inventoryQuery.error instanceof Error ? inventoryQuery.error.message : 'Gagal memuat inventory.';
        setError(message);
    }, [inventoryQuery.error]);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await inventoryQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    };

    const searchedParts = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return parts;
        return parts.filter((part) =>
            part.part_name.toLowerCase().includes(keyword) ||
            part.id.toLowerCase().includes(keyword)
        );
    }, [parts, search]);
    const filtered = useMemo(() => {
        if (summaryFilter === 'low') {
            return searchedParts.filter((part) => part.total_stock > 0 && part.total_stock <= part.min_stock);
        }
        if (summaryFilter === 'out') {
            return searchedParts.filter((part) => part.total_stock === 0);
        }
        return searchedParts;
    }, [searchedParts, summaryFilter]);

    const lowCount = useMemo(
        () => parts.filter((part) => part.total_stock > 0 && part.total_stock <= part.min_stock).length,
        [parts]
    );
    const totalStock = useMemo(
        () => parts.reduce((sum, part) => sum + part.total_stock, 0),
        [parts]
    );
    const outOfStockCount = useMemo(
        () => parts.filter((part) => part.total_stock === 0).length,
        [parts]
    );
    const stockHealth = useMemo(() => {
        if (parts.length === 0) return 0;
        const healthy = parts.filter((part) => part.total_stock > part.min_stock).length;
        return Math.round((healthy / parts.length) * 100);
    }, [parts]);
    const searchedLowCount = useMemo(
        () => searchedParts.filter((part) => part.total_stock > 0 && part.total_stock <= part.min_stock).length,
        [searchedParts]
    );
    const searchedOutCount = useMemo(
        () => searchedParts.filter((part) => part.total_stock === 0).length,
        [searchedParts]
    );
    const emptyInventoryMessage = useMemo(() => {
        if (parts.length === 0) return 'Belum ada data inventory.';
        return 'Tidak ada part sesuai filter.';
    }, [parts.length]);
    const exportCsv = useCallback(async () => {
        if (filtered.length === 0 || exportingCsv) return;

        setExportingCsv(true);
        try {
            const now = new Date();
            const pad = (val: number) => String(val).padStart(2, '0');
            const fileStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            const fileName = `inventory_${fileStamp}.csv`;

            const headers = ['No', 'Part ID', 'Part Name', 'Total Stock', 'Minimum Stock', 'Status', 'Last Updated'];
            const rows = filtered.map((part, index) => ([
                index + 1,
                part.id,
                part.part_name,
                part.total_stock,
                part.min_stock,
                part.total_stock === 0 ? 'Out of Stock' : (part.total_stock <= part.min_stock ? 'Low Stock' : 'Tersedia'),
                part.last_updated ? new Date(part.last_updated).toLocaleString('id-ID') : '-',
            ]));

            const csvContent = '\uFEFF' + [headers, ...rows]
                .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
                .join('\n');

            if (Platform.OS === 'web') {
                const scope = globalThis as any;
                if (!scope?.document || !scope?.URL || !scope?.Blob) {
                    throw new Error('Browser tidak mendukung proses export file.');
                }

                const blob = new scope.Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = scope.URL.createObjectURL(blob);
                const link = scope.document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', fileName);
                scope.document.body?.appendChild(link);
                link.click();
                scope.document.body?.removeChild(link);
                scope.URL.revokeObjectURL(url);
                setSuccess(`CSV berhasil diunduh (${filtered.length} baris).`);
                return;
            }

            await Share.share({
                title: 'Export Inventory CSV',
                message: csvContent,
            });
            setSuccess(`CSV siap dibagikan (${filtered.length} baris).`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal export CSV.';
            setError(message);
        } finally {
            setExportingCsv(false);
        }
    }, [exportingCsv, filtered]);

    const openAddPart = () => {
        setEditPart(null);
        setForm(EMPTY_FORM);
        setShowPartModal(true);
    };

    const openEditPart = (part: InventoryPart) => {
        setEditPart(part);
        setForm({
            id: part.id,
            part_name: part.part_name,
            total_stock: String(part.total_stock),
            min_stock: String(part.min_stock),
        });
        setShowPartModal(true);
    };

    const closePartModal = () => {
        setShowPartModal(false);
        setEditPart(null);
        setForm(EMPTY_FORM);
    };

    const savePart = async () => {
        const id = form.id.trim();
        const partName = form.part_name.trim();
        if (!id || !partName) {
            setError('ID dan nama part wajib diisi.');
            return;
        }

        const totalStock = Number.parseInt(form.total_stock, 10);
        const minStock = Number.parseInt(form.min_stock, 10);
        if (Number.isNaN(totalStock) || totalStock < 0) {
            setError('Total stok wajib angka dan tidak boleh kurang dari 0.');
            return;
        }
        if (Number.isNaN(minStock) || minStock < 0) {
            setError('Minimum stok wajib angka dan tidak boleh kurang dari 0.');
            return;
        }

        const payload = {
            id,
            part_name: partName,
            total_stock: totalStock,
            min_stock: minStock,
            last_updated: new Date().toISOString(),
        };

        const { error: saveError } = editPart
            ? await supabase.from('inventory').update(payload).eq('id', editPart.id)
            : await supabase.from('inventory').insert(payload);

        if (saveError) {
            setError(saveError.message);
            return;
        }

        closePartModal();
        setSuccess(editPart ? 'Detail part berhasil diperbarui.' : 'Part baru berhasil ditambahkan.');
        await inventoryQuery.refetch();
    };

    const deletePart = async (id: string) => {
        const { error: deleteError } = await supabase.from('inventory').delete().eq('id', id);
        if (deleteError) {
            setError(deleteError.message);
            return;
        }
        closePartModal();
        setSuccess('Part dihapus dari inventory.');
        await inventoryQuery.refetch();
    };

    const openStockEditor = (part: InventoryPart, mode: StockEditorMode) => {
        setStockEditorPart(part);
        setStockEditorMode(mode);
        setStockValue(mode === 'add' ? '1' : String(part.total_stock));
    };

    const closeStockEditor = () => {
        setStockEditorPart(null);
        setStockValue('');
        setStockEditorMode('adjust');
        setSavingStock(false);
    };

    const saveStock = async () => {
        if (!stockEditorPart || savingStock) return;

        const parsedValue = Number.parseInt(stockValue, 10);
        if (Number.isNaN(parsedValue)) {
            setError(stockEditorMode === 'add' ? 'Jumlah tambah wajib diisi.' : 'Stok koreksi wajib diisi.');
            return;
        }
        if (stockEditorMode === 'add' && parsedValue <= 0) {
            setError('Jumlah tambah harus lebih dari 0.');
            return;
        }
        if (stockEditorMode === 'adjust' && parsedValue < 0) {
            setError('Stok tidak boleh kurang dari 0.');
            return;
        }

        const previousStock = stockEditorPart.total_stock;
        const nextStock = stockEditorMode === 'add' ? previousStock + parsedValue : parsedValue;

        setSavingStock(true);
        try {
            const nowIso = new Date().toISOString();
            const { data: updatedRow, error: updateError } = await supabase
                .from('inventory')
                .update({
                    total_stock: nextStock,
                    last_updated: nowIso,
                })
                .eq('id', stockEditorPart.id)
                .eq('total_stock', previousStock)
                .select('id')
                .maybeSingle();

            if (updateError) throw updateError;
            if (!updatedRow) {
                throw new Error('Stok part berubah saat proses berlangsung. Muat ulang lalu coba lagi.');
            }

            closeStockEditor();
            await inventoryQuery.refetch();
            if (stockEditorMode === 'add') {
                setSuccess(`Stok ${stockEditorPart.part_name} ditambah ${parsedValue} pcs.`);
            } else {
                setSuccess(`Stok ${stockEditorPart.part_name} dikoreksi ke ${nextStock} pcs.`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal menyimpan perubahan stok.';
            setError(message);
        } finally {
            setSavingStock(false);
        }
    };

    return (
        <View style={adminStyles.container}>
            <FlatList
                key={numColumns}
                data={filtered}
                keyExtractor={(part) => part.id}
                numColumns={numColumns}
                indicatorStyle="black"
                columnWrapperStyle={isWide ? { gap: cardGap } : undefined}
                contentContainerStyle={adminStyles.scrollContent}
                ItemSeparatorComponent={() => <View style={{ height: cardGap }} />}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                ListHeaderComponent={
                    <>
                        <View style={styles.pageHeader}>
                            <Text style={adminStyles.headerTitle}>Inventory</Text>
                            <Text style={adminStyles.headerSub}>{parts.length} items | {lowCount} low stock | {outOfStockCount} out</Text>
                        </View>

                        <Searchbar
                            placeholder="Cari part atau kode..."
                            value={search}
                            onChangeText={setSearch}
                            style={[adminStyles.searchBar, styles.searchBarInList]}
                            inputStyle={{ color: Colors.text }}
                            iconColor={Colors.textMuted}
                            placeholderTextColor={Colors.textMuted}
                        />

                        <View style={styles.summaryWrap}>
                            <View style={styles.summaryHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.summaryTitle}>Inventory Summary</Text>
                                    <Text style={styles.summarySubtitle}>
                                        Ringkasan cepat kondisi stok master inventory. Health {stockHealth}%.
                                    </Text>
                                </View>
                                <View style={styles.summaryHeaderActions}>
                                    <Button
                                        mode="contained"
                                        onPress={openAddPart}
                                        icon="plus"
                                        style={styles.addBtn}
                                        labelStyle={styles.addBtnText}
                                        compact
                                    >
                                        Add Part
                                    </Button>
                                    <Button
                                        mode="text"
                                        icon="download"
                                        onPress={exportCsv}
                                        loading={exportingCsv}
                                        disabled={exportingCsv || filtered.length === 0}
                                        compact
                                        labelStyle={styles.exportLabel}
                                        style={styles.exportBtn}
                                    >
                                        Export CSV
                                    </Button>
                                </View>
                            </View>

                            <View style={styles.summaryRow}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryScroll}>
                                    <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
                                        <MaterialCommunityIcons name="layers-triple-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.summaryValue}>{parts.length}</Text>
                                        <Text style={styles.summaryLabel}>Total Part</Text>
                                    </View>
                                    <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
                                        <MaterialCommunityIcons name="archive-outline" size={16} color={Colors.primary} />
                                        <Text style={styles.summaryValue}>{totalStock}</Text>
                                        <Text style={styles.summaryLabel}>Total Stock</Text>
                                    </View>
                                    <View style={[styles.summaryCard, styles.summaryCardWarning]}>
                                        <MaterialCommunityIcons name="alert-outline" size={16} color={Colors.accent} />
                                        <Text style={styles.summaryValue}>{lowCount}</Text>
                                        <Text style={styles.summaryLabel}>Low Stock</Text>
                                    </View>
                                    <View style={[styles.summaryCard, styles.summaryCardDanger]}>
                                        <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.danger} />
                                        <Text style={styles.summaryValue}>{outOfStockCount}</Text>
                                        <Text style={styles.summaryLabel}>Out of Stock</Text>
                                    </View>
                                    <View style={[styles.summaryCard, styles.summaryCardInfo]}>
                                        <MaterialCommunityIcons name="heart-pulse" size={16} color={Colors.info} />
                                        <Text style={styles.summaryValue}>{stockHealth}%</Text>
                                        <Text style={styles.summaryLabel}>Stock Health</Text>
                                    </View>
                                </ScrollView>
                            </View>

                            <View style={styles.quickFilterRow}>
                                <Chip
                                    compact
                                    mode={summaryFilter === 'all' ? 'flat' : 'outlined'}
                                    selected={summaryFilter === 'all'}
                                    onPress={() => setSummaryFilter('all')}
                                    style={[styles.quickChip, summaryFilter === 'all' && styles.quickChipActive]}
                                    textStyle={styles.quickChipText}
                                >
                                    All ({searchedParts.length})
                                </Chip>
                                <Chip
                                    compact
                                    mode={summaryFilter === 'low' ? 'flat' : 'outlined'}
                                    selected={summaryFilter === 'low'}
                                    onPress={() => setSummaryFilter('low')}
                                    style={[styles.quickChip, summaryFilter === 'low' && styles.quickChipWarning]}
                                    textStyle={styles.quickChipText}
                                >
                                    Low ({searchedLowCount})
                                </Chip>
                                <Chip
                                    compact
                                    mode={summaryFilter === 'out' ? 'flat' : 'outlined'}
                                    selected={summaryFilter === 'out'}
                                    onPress={() => setSummaryFilter('out')}
                                    style={[styles.quickChip, summaryFilter === 'out' && styles.quickChipDanger]}
                                    textStyle={styles.quickChipText}
                                >
                                    Out ({searchedOutCount})
                                </Chip>
                                <View style={styles.quickBadge}>
                                    <MaterialCommunityIcons name="alert-circle-outline" size={14} color={Colors.textSecondary} />
                                    <Text style={styles.quickBadgeText}>Out total: {outOfStockCount}</Text>
                                </View>
                            </View>
                        </View>
                    </>
                }
                renderItem={({ item: part }) => {
                    const isOut = part.total_stock === 0;
                    const isLow = !isOut && part.total_stock <= part.min_stock;

                    return (
                        <View style={[styles.card, { width: isWide ? cardWidth : '100%' }]}>
                            <View style={styles.cardHeader}>
                                <View style={[styles.dateIcon, isOut ? styles.dateIconOut : (isLow ? styles.dateIconLow : undefined)]}>
                                    <MaterialCommunityIcons
                                        name={isOut ? 'alert-circle' : (isLow ? 'alert-circle-outline' : 'cube-outline')}
                                        size={18}
                                        color={isOut ? Colors.danger : (isLow ? Colors.accent : Colors.primary)}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.cardTitle}>{part.part_name}</Text>
                                    <Text style={styles.cardSubtitle}>ID: {part.id}</Text>
                                </View>
                                <View style={[styles.statusBadge, isOut ? styles.statusBadgeOut : (isLow ? styles.statusBadgeLow : styles.statusBadgeOk)]}>
                                    <Text style={[styles.statusText, { color: isOut ? Colors.danger : (isLow ? Colors.accent : Colors.primary) }]}>
                                        {isOut ? 'Out' : (isLow ? 'Low' : 'Tersedia')}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.infoRow}>
                                <View style={styles.infoBox}>
                                    <MaterialCommunityIcons name="cube-outline" size={14} color={Colors.primary} />
                                    <View>
                                        <Text style={styles.infoBoxValue}>{part.total_stock}</Text>
                                        <Text style={styles.infoBoxLabel}>Stok Admin</Text>
                                    </View>
                                </View>
                                <View style={[styles.infoBox, styles.infoBoxAlt]}>
                                    <MaterialCommunityIcons name="arrow-down" size={14} color={Colors.accent} />
                                    <View>
                                        <Text style={[styles.infoBoxValue, { color: Colors.accent }]}>{part.min_stock}</Text>
                                        <Text style={styles.infoBoxLabel}>Min</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.stockActionRow}>
                                <Pressable
                                    style={({ pressed }) => [styles.stockAdjustBtn, pressed && { opacity: 0.88 }]}
                                    onPress={() => openStockEditor(part, 'adjust')}
                                >
                                    <MaterialCommunityIcons name="pencil-outline" size={18} color="#FFFFFF" />
                                    <Text style={styles.stockAdjustBtnText}>Koreksi</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.stockAddBtn, pressed && { opacity: 0.88 }]}
                                    onPress={() => openStockEditor(part, 'add')}
                                >
                                    <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#08362E" />
                                    <Text style={styles.stockAddBtnText}>Add</Text>
                                </Pressable>
                            </View>

                            <Pressable style={styles.detailBtn} onPress={() => openEditPart(part)}>
                                <MaterialCommunityIcons name="cog-outline" size={16} color={Colors.textSecondary} />
                                <Text style={styles.detailBtnText}>Detail Part</Text>
                            </Pressable>
                        </View>
                    );
                }}
                ListEmptyComponent={
                    <View style={adminStyles.emptyState}>
                        <MaterialCommunityIcons name="package-variant-closed" size={48} color={Colors.textMuted} />
                        <Text style={adminStyles.emptyText}>{emptyInventoryMessage}</Text>
                    </View>
                }
            />

            <Portal>
                <Modal
                    visible={showPartModal}
                    onDismiss={closePartModal}
                    contentContainerStyle={styles.modal}
                >
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{editPart ? 'Detail Part' : 'Tambah Part Baru'}</Text>
                        <Pressable onPress={closePartModal}>
                            <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
                        </Pressable>
                    </View>

                    <TextInput
                        label="Part ID"
                        value={form.id}
                        onChangeText={(value) => setForm((prev) => ({ ...prev, id: value }))}
                        mode="outlined"
                        disabled={!!editPart}
                        style={styles.input}
                    />
                    <TextInput
                        label="Part Name"
                        value={form.part_name}
                        onChangeText={(value) => setForm((prev) => ({ ...prev, part_name: value }))}
                        mode="outlined"
                        style={styles.input}
                    />
                    <TextInput
                        label="Total Stock"
                        value={form.total_stock}
                        onChangeText={(value) => setForm((prev) => ({ ...prev, total_stock: sanitizeNumber(value) }))}
                        keyboardType="number-pad"
                        mode="outlined"
                        style={styles.input}
                    />
                    <TextInput
                        label="Minimum Stock"
                        value={form.min_stock}
                        onChangeText={(value) => setForm((prev) => ({ ...prev, min_stock: sanitizeNumber(value) }))}
                        keyboardType="number-pad"
                        mode="outlined"
                        style={styles.input}
                    />

                    <View style={styles.modalActionRow}>
                        <Button mode="outlined" onPress={closePartModal} style={styles.modalCancelBtn}>
                            Batal
                        </Button>
                        <Button mode="contained" onPress={savePart} style={styles.modalSaveBtn}>
                            Simpan
                        </Button>
                    </View>

                    {editPart ? (
                        <Button
                            mode="text"
                            onPress={() => deletePart(editPart.id)}
                            textColor={Colors.danger}
                            style={styles.deleteBtn}
                        >
                            Hapus Part
                        </Button>
                    ) : null}
                </Modal>

                <Modal
                    visible={!!stockEditorPart}
                    onDismiss={closeStockEditor}
                    contentContainerStyle={styles.modal}
                >
                    {stockEditorPart ? (
                        <>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>
                                    {stockEditorMode === 'add' ? 'Tambah Stok' : 'Koreksi Stok'}
                                </Text>
                                <Pressable onPress={closeStockEditor}>
                                    <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
                                </Pressable>
                            </View>

                            <Text style={styles.modalSubTitle}>{stockEditorPart.part_name}</Text>
                            <Text style={styles.modalCaption}>ID: {stockEditorPart.id}</Text>
                            <Text style={styles.modalCaption}>Stok saat ini: {stockEditorPart.total_stock} pcs</Text>

                            <TextInput
                                label={stockEditorMode === 'add' ? 'Jumlah Tambah' : 'Stok Baru'}
                                value={stockValue}
                                onChangeText={(value) => setStockValue(sanitizeNumber(value))}
                                keyboardType="number-pad"
                                mode="outlined"
                                style={styles.input}
                            />

                            <View style={styles.modalActionRow}>
                                <Button mode="outlined" onPress={closeStockEditor} style={styles.modalCancelBtn}>
                                    Batal
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={saveStock}
                                    style={styles.modalSaveBtn}
                                    loading={savingStock}
                                    disabled={savingStock}
                                >
                                    Simpan
                                </Button>
                            </View>
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
    pageHeader: {
        paddingTop: 20,
        marginBottom: 14,
    },
    searchBarInList: {
        marginBottom: 12,
    },
    addBtn: {
        borderRadius: 12,
        height: 38,
        backgroundColor: Colors.primary,
    },
    addBtnText: {
        color: '#08362E',
        fontWeight: '700',
        fontSize: 12,
    },
    summaryWrap: {
        marginBottom: 12,
        padding: 14,
        borderRadius: 18,
        backgroundColor: '#0A121D',
        borderWidth: 1,
        borderColor: '#1B2A3A',
        gap: 10,
    },
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },
    summaryHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    summaryTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: Colors.text,
        letterSpacing: -0.2,
    },
    summarySubtitle: {
        marginTop: 2,
        fontSize: 12,
        color: Colors.textSecondary,
    },
    exportBtn: {
        borderRadius: 12,
    },
    exportLabel: {
        color: Colors.primary,
        fontWeight: '700',
    },
    summaryRow: {
        marginTop: 2,
    },
    summaryScroll: {
        gap: 10,
        paddingRight: 6,
    },
    summaryCard: {
        width: 164,
        borderRadius: 16,
        paddingHorizontal: 13,
        paddingVertical: 12,
        borderWidth: 1,
        gap: 5,
    },
    summaryCardPrimary: {
        borderColor: Colors.primary + '50',
        backgroundColor: '#062828',
    },
    summaryCardWarning: {
        borderColor: Colors.accent + '55',
        backgroundColor: '#2C250F',
    },
    summaryCardInfo: {
        borderColor: Colors.info + '55',
        backgroundColor: Colors.info + '12',
    },
    summaryCardDanger: {
        borderColor: Colors.danger + '55',
        backgroundColor: Colors.danger + '14',
    },
    summaryValue: {
        fontSize: 22,
        lineHeight: 26,
        fontWeight: '800',
        color: Colors.text,
    },
    summaryLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
        fontWeight: '600',
    },
    quickFilterRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
    },
    quickChip: {
        borderRadius: 999,
        borderColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    quickChipActive: {
        borderColor: Colors.primary + '55',
        backgroundColor: Colors.primary + '20',
    },
    quickChipWarning: {
        borderColor: Colors.accent + '55',
        backgroundColor: Colors.accent + '20',
    },
    quickChipDanger: {
        borderColor: Colors.danger + '55',
        backgroundColor: Colors.danger + '20',
    },
    quickChipText: {
        color: Colors.text,
        fontSize: 10,
        fontWeight: '600',
    },
    quickBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        height: 30,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    quickBadgeText: {
        color: Colors.textSecondary,
        fontSize: 10,
        fontWeight: '500',
    },
    card: {
        backgroundColor: '#111827',
        borderRadius: 18,
        padding: 14,
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
    dateIconLow: {
        borderColor: Colors.accent,
        backgroundColor: Colors.accent + '18',
    },
    dateIconOut: {
        borderColor: Colors.danger,
        backgroundColor: Colors.danger + '18',
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
    statusBadgeOut: {
        borderColor: Colors.danger + '70',
        backgroundColor: Colors.danger + '20',
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
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 13,
    },
    stockAddBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: Colors.primary,
        borderRadius: 18,
        paddingVertical: 10,
    },
    stockAddBtnText: {
        color: '#08362E',
        fontWeight: '700',
        fontSize: 13,
    },
    detailBtn: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 12,
        paddingVertical: 8,
        backgroundColor: Colors.surface,
    },
    detailBtnText: {
        color: Colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    modal: {
        backgroundColor: Colors.card,
        margin: 20,
        borderRadius: 20,
        padding: 20,
        gap: 14,
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
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
    modalSubTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text,
    },
    modalCaption: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
    input: {
        backgroundColor: Colors.surface,
    },
    modalActionRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
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
    deleteBtn: {
        alignSelf: 'flex-start',
    },
});
