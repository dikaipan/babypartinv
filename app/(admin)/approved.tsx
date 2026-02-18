import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, RefreshControl, useWindowDimensions, Pressable, Modal, ScrollView } from 'react-native';
import { Text, Button, Chip } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/config/supabase';
import { MonthlyRequest, RequestItem, Profile } from '../../src/types';
import { adminStyles } from '../../src/styles/adminStyles';
import { NotificationService } from '../../src/services/NotificationService';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { normalizeArea } from '../../src/utils/normalizeArea';

type DeliveryAdjustment = {
    partId: string;
    requestedQty: number;
    deliverQty: number;
};

type InventoryMeta = {
    part_name: string;
    total_stock: number;
};

type ApprovedAreaGroup = {
    area: string;
    requests: (MonthlyRequest & { engineer?: Profile })[];
    totalItems: number;
    totalQty: number;
    adjustedCount: number;
};

function toSafeQty(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
}

function aggregateRequestItems(items: RequestItem[]) {
    const qtyByPart = new Map<string, number>();
    for (const item of items || []) {
        if (!item?.partId) continue;
        const qty = toSafeQty(item.quantity);
        if (qty <= 0) continue;
        qtyByPart.set(item.partId, (qtyByPart.get(item.partId) || 0) + qty);
    }
    return qtyByPart;
}

function buildAdjustments(sourceItems: RequestItem[], draftAdjustments?: DeliveryAdjustment[]) {
    const requestedByPart = aggregateRequestItems(sourceItems);
    const draftByPart = new Map<string, number>();

    for (const item of draftAdjustments || []) {
        if (!item?.partId) continue;
        draftByPart.set(item.partId, toSafeQty(item.deliverQty));
    }

    return Array.from(requestedByPart.entries()).map(([partId, requestedQty]) => {
        const rawDraftQty = draftByPart.has(partId) ? draftByPart.get(partId)! : requestedQty;
        const deliverQty = Math.min(requestedQty, Math.max(0, rawDraftQty));
        return { partId, requestedQty, deliverQty };
    });
}

function hasAdjustedQty(items: DeliveryAdjustment[]) {
    return items.some((item) => item.deliverQty !== item.requestedQty);
}

function toDeliveredItems(items: DeliveryAdjustment[]) {
    return items
        .filter((item) => item.deliverQty > 0)
        .map((item) => ({ partId: item.partId, quantity: item.deliverQty }));
}

const fetchApprovedRequests = async (): Promise<(MonthlyRequest & { engineer?: Profile })[]> => {
    const { data, error } = await supabase
        .from('monthly_requests')
        .select('*, engineer:profiles!monthly_requests_engineer_id_fkey(*)')
        .eq('status', 'approved')
        .order('reviewed_at', { ascending: false });
    if (error) throw error;
    return data || [];
};

export default function ApprovedPage() {
    const { width } = useWindowDimensions();
    const { user } = useAuthStore();
    const [refreshing, setRefreshing] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [deliveringId, setDeliveringId] = useState<string | null>(null);
    const [adjustmentsByRequest, setAdjustmentsByRequest] = useState<Record<string, DeliveryAdjustment[]>>({});
    const [adjustingRequest, setAdjustingRequest] = useState<(MonthlyRequest & { engineer?: Profile }) | null>(null);
    const [adjustingItems, setAdjustingItems] = useState<DeliveryAdjustment[]>([]);
    const [adjustInventory, setAdjustInventory] = useState<Record<string, InventoryMeta>>({});
    const [adjustLoading, setAdjustLoading] = useState(false);

    const isWide = width >= 900;
    const approvedQuery = useQuery({
        queryKey: ['admin', 'approved'],
        queryFn: fetchApprovedRequests,
        enabled: !!user,
    });
    const requests = approvedQuery.data || [];

    const resolveAreaGroup = useCallback((request: MonthlyRequest & { engineer?: Profile }) => {
        const location = request.engineer?.location;
        return location ? normalizeArea(location) : 'Unknown Area';
    }, []);

    useEffect(() => {
        setAdjustmentsByRequest((prev) => {
            const next: Record<string, DeliveryAdjustment[]> = {};
            for (const row of requests) {
                const prevDraft = prev[row.id];
                if (!prevDraft) continue;
                const normalized = buildAdjustments((row.items as RequestItem[]) || [], prevDraft);
                if (hasAdjustedQty(normalized)) next[row.id] = normalized;
            }
            return next;
        });
    }, [requests]);

    useEffect(() => {
        if (!approvedQuery.error) return;
        const message = approvedQuery.error instanceof Error ? approvedQuery.error.message : 'Gagal memuat approved requests.';
        setError(message);
    }, [approvedQuery.error]);

    useSupabaseRealtimeRefresh(
        ['monthly_requests', 'inventory'],
        () => {
            void approvedQuery.refetch();
        },
        { enabled: !!user },
    );

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await approvedQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    };

    const getAdjustmentsForRequest = useCallback((request: MonthlyRequest & { engineer?: Profile }) => {
        return buildAdjustments((request.items as RequestItem[]) || [], adjustmentsByRequest[request.id]);
    }, [adjustmentsByRequest]);

    const groupedRequests = useMemo<ApprovedAreaGroup[]>(() => {
        const grouped: Record<string, (MonthlyRequest & { engineer?: Profile })[]> = {};

        for (const row of requests) {
            const area = resolveAreaGroup(row);
            if (!grouped[area]) grouped[area] = [];
            grouped[area].push(row);
        }

        return Object.entries(grouped)
            .map(([area, areaRequests]) => {
                const allItems = areaRequests.flatMap((row) => ((row.items as RequestItem[]) || []));
                const totalItems = allItems.length;
                const totalQty = allItems.reduce((sum, item) => sum + toSafeQty(item.quantity), 0);
                const adjustedCount = areaRequests.reduce((sum, row) => {
                    const adjusted = hasAdjustedQty(
                        buildAdjustments((row.items as RequestItem[]) || [], adjustmentsByRequest[row.id]),
                    );
                    return sum + (adjusted ? 1 : 0);
                }, 0);
                return {
                    area,
                    requests: areaRequests,
                    totalItems,
                    totalQty,
                    adjustedCount,
                };
            })
            .sort((a, b) => b.requests.length - a.requests.length || a.area.localeCompare(b.area));
    }, [adjustmentsByRequest, requests, resolveAreaGroup]);

    const closeAdjustModal = () => {
        setAdjustingRequest(null);
        setAdjustingItems([]);
        setAdjustInventory({});
        setAdjustLoading(false);
    };

    const openAdjustModal = useCallback(async (request: MonthlyRequest & { engineer?: Profile }) => {
        if (deliveringId) return;

        const nextAdjustments = getAdjustmentsForRequest(request);
        if (nextAdjustments.length === 0) {
            setError('Request tidak memiliki item untuk di-adjust.');
            return;
        }

        setAdjustingRequest(request);
        setAdjustingItems(nextAdjustments);
        setAdjustInventory({});
        setAdjustLoading(true);

        try {
            const partIds = nextAdjustments.map((item) => item.partId);
            const { data, error: inventoryError } = await supabase
                .from('inventory')
                .select('id, part_name, total_stock')
                .in('id', partIds);

            if (inventoryError) throw inventoryError;

            const inventoryMap: Record<string, InventoryMeta> = {};
            for (const row of data || []) {
                inventoryMap[row.id] = {
                    part_name: row.part_name,
                    total_stock: row.total_stock,
                };
            }
            setAdjustInventory(inventoryMap);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal memuat stok inventory.';
            setError(message);
        } finally {
            setAdjustLoading(false);
        }
    }, [deliveringId, getAdjustmentsForRequest]);

    const updateAdjustQty = (partId: string, delta: number) => {
        setAdjustingItems((prev) => prev.map((item) => {
            if (item.partId !== partId) return item;
            const nextQty = Math.min(item.requestedQty, Math.max(0, item.deliverQty + delta));
            return { ...item, deliverQty: nextQty };
        }));
    };

    const resetAdjustToRequested = () => {
        setAdjustingItems((prev) => prev.map((item) => ({ ...item, deliverQty: item.requestedQty })));
    };

    const saveAdjustments = () => {
        if (!adjustingRequest) return;

        const normalized = buildAdjustments((adjustingRequest.items as RequestItem[]) || [], adjustingItems);
        if (normalized.length === 0) {
            setError('Tidak ada item untuk disimpan.');
            return;
        }

        const changed = hasAdjustedQty(normalized);
        setAdjustmentsByRequest((prev) => {
            const next = { ...prev };
            if (changed) next[adjustingRequest.id] = normalized;
            else delete next[adjustingRequest.id];
            return next;
        });

        const totalDeliver = normalized.reduce((sum, item) => sum + item.deliverQty, 0);
        setSuccess(changed
            ? `Penyesuaian disimpan. Total kirim ${totalDeliver} pcs.`
            : 'Penyesuaian dibatalkan. Kembali ke qty request awal.');
        closeAdjustModal();
    };

    const markDelivered = async (request: MonthlyRequest & { engineer?: Profile }) => {
        const id = request.id;
        if (!user?.id || deliveringId) return;
        setDeliveringId(id);

        const decrementedRows: { partId: string; previousQty: number; nextQty: number }[] = [];

        try {
            const { data: requestRow, error: requestError } = await supabase
                .from('monthly_requests')
                .select('id, status, items')
                .eq('id', id)
                .eq('status', 'approved')
                .maybeSingle();

            if (requestError) throw requestError;
            if (!requestRow) {
                throw new Error('Request tidak ditemukan atau sudah diproses.');
            }

            const plannedAdjustments = buildAdjustments(
                (requestRow.items as RequestItem[]) || [],
                adjustmentsByRequest[id],
            );
            const deliveredItems = toDeliveredItems(plannedAdjustments);
            const isAdjustedDelivery = hasAdjustedQty(plannedAdjustments);

            const qtyByPart = aggregateRequestItems(deliveredItems);
            const partIds = Array.from(qtyByPart.keys());
            if (partIds.length === 0) {
                throw new Error('Semua qty kirim bernilai 0. Ubah penyesuaian item terlebih dulu.');
            }

            const { data: inventoryRows, error: inventoryError } = await supabase
                .from('inventory')
                .select('id, part_name, total_stock')
                .in('id', partIds);

            if (inventoryError) throw inventoryError;

            const inventoryMap = new Map<string, InventoryMeta>();
            for (const row of inventoryRows || []) {
                inventoryMap.set(row.id, {
                    part_name: row.part_name,
                    total_stock: row.total_stock,
                });
            }

            const missingPartId = partIds.find((partId) => !inventoryMap.has(partId));
            if (missingPartId) {
                throw new Error(`Part ${missingPartId} tidak ditemukan di inventory admin.`);
            }

            const insufficientRows = partIds
                .map((partId) => {
                    const available = inventoryMap.get(partId)?.total_stock || 0;
                    const required = qtyByPart.get(partId) || 0;
                    return { partId, required, available, partName: inventoryMap.get(partId)?.part_name || partId };
                })
                .filter((row) => row.required > row.available);

            if (insufficientRows.length > 0) {
                const detail = insufficientRows
                    .map((row) => `${row.partName} (butuh ${row.required}, stok ${row.available})`)
                    .join(', ');
                throw new Error(`Stok inventory admin tidak cukup: ${detail}`);
            }

            for (const partId of partIds) {
                const partMeta = inventoryMap.get(partId)!;
                const requiredQty = qtyByPart.get(partId)!;
                const previousQty = partMeta.total_stock;
                const nextQty = previousQty - requiredQty;

                const { data: updatedInventoryRow, error: updateInventoryError } = await supabase
                    .from('inventory')
                    .update({
                        total_stock: nextQty,
                        last_updated: new Date().toISOString(),
                    })
                    .eq('id', partId)
                    .eq('total_stock', previousQty)
                    .select('id')
                    .maybeSingle();

                if (updateInventoryError) throw updateInventoryError;
                if (!updatedInventoryRow) {
                    throw new Error('Stok inventory berubah saat proses kirim. Muat ulang lalu coba lagi.');
                }

                decrementedRows.push({
                    partId,
                    previousQty,
                    nextQty,
                });
            }

            const deliveredAt = new Date().toISOString();
            const updatePayload: Record<string, any> = {
                status: 'delivered',
                delivered_by: user.id,
                delivered_at: deliveredAt,
                items: deliveredItems,
            };

            if (isAdjustedDelivery) {
                updatePayload.last_edited_by = user.id;
                updatePayload.last_edited_at = deliveredAt;
            }

            const { data: deliveredRow, error: deliveryError } = await supabase
                .from('monthly_requests')
                .update(updatePayload)
                .eq('id', id)
                .eq('status', 'approved')
                .select('id, status, delivered_at')
                .maybeSingle();

            if (deliveryError) throw deliveryError;
            if (!deliveredRow || deliveredRow.status !== 'delivered') {
                let rollbackFailed = false;
                for (const row of decrementedRows) {
                    const { data: rollbackRow, error: rollbackError } = await supabase
                        .from('inventory')
                        .update({
                            total_stock: row.previousQty,
                            last_updated: new Date().toISOString(),
                        })
                        .eq('id', row.partId)
                        .eq('total_stock', row.nextQty)
                        .select('id')
                        .maybeSingle();

                    if (rollbackError || !rollbackRow) rollbackFailed = true;
                }

                if (rollbackFailed) {
                    throw new Error('Pengiriman gagal dan rollback stok tidak lengkap. Cek inventory admin.');
                }
                throw new Error('Pengiriman gagal disimpan. Stok inventory sudah dikembalikan.');
            }

            setAdjustmentsByRequest((prev) => {
                if (!prev[id]) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
            });

            // Notify Engineer
            if (request.engineer_id) {
                void NotificationService.sendToUser(
                    request.engineer_id,
                    'Barang Dikirim',
                    'Admin telah mengirim request Anda. Segera konfirmasi penerimaan.',
                    { request_id: id, status: 'delivered', type: 'request_progress' },
                ).catch((e) => console.error('[approved.markDelivered] Notification error:', e));
            }

            setSuccess('Pengiriman berhasil. Inventory admin diperbarui.');
            await approvedQuery.refetch();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal memproses pengiriman.';
            setError(message);
        } finally {
            setDeliveringId(null);
        }
    };

    const modalTotalRequested = adjustingItems.reduce((sum, item) => sum + item.requestedQty, 0);
    const modalTotalDeliver = adjustingItems.reduce((sum, item) => sum + item.deliverQty, 0);
    const modalIsAdjusted = hasAdjustedQty(adjustingItems);

    const renderRequestCard = (r: MonthlyRequest & { engineer?: Profile }, area: string) => {
        const requestAdjustments = getAdjustmentsForRequest(r);
        const deliverItems = requestAdjustments.filter((item) => item.deliverQty > 0);
        const isAdjusted = hasAdjustedQty(requestAdjustments);
        const totalRequested = requestAdjustments.reduce((sum, item) => sum + item.requestedQty, 0);
        const totalDeliver = requestAdjustments.reduce((sum, item) => sum + item.deliverQty, 0);

        return (
            <View key={r.id} style={[adminStyles.card, styles.reqCard, isWide ? styles.reqCardWide : styles.reqCardFull]}>
                <View style={adminStyles.cardHeader}>
                    <View style={styles.userInfo}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{(r.engineer?.name?.[0] || '?').toUpperCase()}</Text>
                        </View>
                        <View>
                            <Text style={styles.name}>{r.engineer?.name || 'Unknown'}</Text>
                            <Text style={styles.date}>{new Date(r.submitted_at).toLocaleDateString()} | {r.month}</Text>
                            <Text style={styles.areaInfo}>Area Group: {area}</Text>
                        </View>
                    </View>
                    <View style={styles.headerChips}>
                        <Chip style={styles.statusChip} textStyle={styles.statusText} icon="check-circle">Approved</Chip>
                        {isAdjusted && <Chip style={styles.adjustedChip} textStyle={styles.adjustedText} icon="tune">Adjusted</Chip>}
                    </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.itemsContainer}>
                    <Text style={styles.sectionLabel}>Items to Deliver ({totalDeliver}/{totalRequested} pcs):</Text>
                    {deliverItems.length === 0 ? (
                        <Text style={styles.emptyDeliverText}>Belum ada item untuk dikirim. Ubah qty kirim dulu.</Text>
                    ) : (
                        <View style={styles.itemsGrid}>
                            {deliverItems.map((item) => (
                                <View
                                    key={item.partId}
                                    style={[
                                        styles.itemBadge,
                                        isAdjusted && item.deliverQty < item.requestedQty && styles.itemBadgeAdjusted,
                                    ]}
                                >
                                    <MaterialCommunityIcons name="cube-outline" size={14} color={Colors.textSecondary} />
                                    <Text style={styles.itemText}>{item.partId}</Text>
                                    <View style={styles.qtyBadge}>
                                        <Text style={styles.qtyText}>x{item.deliverQty}</Text>
                                    </View>
                                    {isAdjusted && item.deliverQty < item.requestedQty && (
                                        <View style={styles.reqQtyBadge}>
                                            <Text style={styles.reqQtyText}>req {item.requestedQty}</Text>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={adminStyles.cardFooter}>
                    <View style={styles.footerActions}>
                        <Button
                            mode="outlined"
                            onPress={() => openAdjustModal(r)}
                            style={styles.adjustBtn}
                            contentStyle={{ height: 44 }}
                            labelStyle={styles.adjustBtnLabel}
                            icon="tune"
                            disabled={deliveringId !== null}
                        >
                            Adjust Item
                        </Button>
                        <Button
                            mode="contained"
                            onPress={() => markDelivered(r)}
                            style={styles.deliverBtn}
                            contentStyle={{ height: 44 }}
                            labelStyle={{ fontWeight: '700', fontSize: 14 }}
                            icon="truck-delivery-outline"
                            loading={deliveringId === r.id}
                            disabled={deliveringId !== null || deliverItems.length === 0}
                        >
                            {deliveringId === r.id ? 'Mengirim...' : 'Mark as Delivered'}
                        </Button>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={adminStyles.container}>
            <View style={adminStyles.header}>
                <View>
                    <Text style={adminStyles.headerTitle}>Approved Requests</Text>
                    <Text style={adminStyles.headerSub}>Ready for delivery fulfillment</Text>
                </View>
                <View style={styles.countBadge}>
                    <Text style={styles.countText}>{requests.length}</Text>
                </View>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                indicatorStyle="black"
                contentContainerStyle={[adminStyles.scrollContent, styles.groupListContent]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            >
                {groupedRequests.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="check-all" size={64} color={Colors.textMuted} />
                        <Text style={styles.emptyText}>No approved requests pending delivery.</Text>
                    </View>
                ) : (
                    groupedRequests.map((group) => (
                        <View key={group.area} style={styles.areaCard}>
                            <View style={styles.areaHeader}>
                                <View style={styles.areaHeaderMain}>
                                    <View style={[adminStyles.iconBox, { backgroundColor: Colors.primary + '15' }]}>
                                        <MaterialCommunityIcons name="map-marker" size={18} color={Colors.primary} />
                                    </View>
                                    <Text style={styles.areaName}>{group.area}</Text>
                                </View>
                                <View style={styles.areaTagRow}>
                                    <View style={[styles.areaTag, { borderColor: Colors.primary + '55' }]}>
                                        <Text style={[styles.areaTagText, { color: Colors.primary }]}>{group.requests.length} Request</Text>
                                    </View>
                                    <View style={[styles.areaTag, { borderColor: Colors.info + '55' }]}>
                                        <Text style={[styles.areaTagText, { color: Colors.info }]}>{group.totalItems} Item</Text>
                                    </View>
                                    <View style={[styles.areaTag, { borderColor: Colors.accent + '55' }]}>
                                        <Text style={[styles.areaTagText, { color: Colors.accent }]}>Total Qty: {group.totalQty}</Text>
                                    </View>
                                    {group.adjustedCount > 0 && (
                                        <View style={[styles.areaTag, { borderColor: Colors.warning + '55' }]}>
                                            <Text style={[styles.areaTagText, { color: Colors.warning }]}>{group.adjustedCount} Adjusted</Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            <View style={[styles.reqGrid, !isWide && styles.reqGridStack]}>
                                {group.requests.map((r) => renderRequestCard(r, group.area))}
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            <Modal
                visible={!!adjustingRequest}
                transparent
                animationType="fade"
                onRequestClose={closeAdjustModal}
            >
                <Pressable style={styles.modalOverlay} onPress={closeAdjustModal}>
                    <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>Adjust Items to Deliver</Text>
                                <Text style={styles.modalSub}>
                                    {(adjustingRequest?.engineer?.name || 'Engineer')} | {adjustingRequest?.month || '-'}
                                </Text>
                            </View>
                            <Pressable style={styles.modalCloseBtn} onPress={closeAdjustModal}>
                                <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
                            </Pressable>
                        </View>

                        <Text style={styles.modalHint}>Set qty kirim per item (0 sampai qty request).</Text>
                        {adjustLoading && (
                            <Text style={styles.modalLoading}>Memuat stok inventory...</Text>
                        )}

                        <ScrollView style={styles.modalList} indicatorStyle="black" contentContainerStyle={styles.modalListContent}>
                            {adjustingItems.map((item) => {
                                const stockInfo = adjustInventory[item.partId];
                                const stockNow = stockInfo?.total_stock;
                                const partName = stockInfo?.part_name || item.partId;
                                const exceedsStock = typeof stockNow === 'number' && item.deliverQty > stockNow;

                                return (
                                    <View key={item.partId} style={styles.modalItemRow}>
                                        <View style={styles.modalItemMeta}>
                                            <Text style={styles.modalItemName}>{partName}</Text>
                                            <Text style={styles.modalItemSub}>
                                                {item.partId} | Request {item.requestedQty} pcs
                                                {typeof stockNow === 'number' ? ` | Stok ${stockNow}` : ''}
                                            </Text>
                                            {exceedsStock && <Text style={styles.modalWarn}>Qty kirim melebihi stok saat ini.</Text>}
                                        </View>
                                        <View style={styles.qtyControl}>
                                            <Pressable
                                                style={[styles.qtyControlBtn, item.deliverQty <= 0 && styles.qtyControlBtnDisabled]}
                                                onPress={() => updateAdjustQty(item.partId, -1)}
                                                disabled={item.deliverQty <= 0}
                                            >
                                                <MaterialCommunityIcons name="minus" size={18} color={item.deliverQty <= 0 ? Colors.textMuted : Colors.primary} />
                                            </Pressable>
                                            <Text style={styles.qtyControlValue}>{item.deliverQty}</Text>
                                            <Pressable
                                                style={[styles.qtyControlBtn, item.deliverQty >= item.requestedQty && styles.qtyControlBtnDisabled]}
                                                onPress={() => updateAdjustQty(item.partId, 1)}
                                                disabled={item.deliverQty >= item.requestedQty}
                                            >
                                                <MaterialCommunityIcons name="plus" size={18} color={item.deliverQty >= item.requestedQty ? Colors.textMuted : Colors.primary} />
                                            </Pressable>
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.modalFooter}>
                            <Text style={styles.modalFooterText}>
                                Total kirim: {modalTotalDeliver}/{modalTotalRequested} pcs
                            </Text>
                            <View style={styles.modalFooterActions}>
                                <Button mode="text" onPress={resetAdjustToRequested} disabled={adjustingItems.length === 0}>
                                    Reset
                                </Button>
                                <Button mode="contained" onPress={saveAdjustments} disabled={adjustLoading || adjustingItems.length === 0}>
                                    {modalIsAdjusted ? 'Simpan Penyesuaian' : 'Simpan'}
                                </Button>
                            </View>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <AppSnackbar
                visible={!!error}
                onDismiss={() => setError('')}
                duration={3200}
                style={{ backgroundColor: Colors.danger }}
            >
                {error}
            </AppSnackbar>
            <AppSnackbar
                visible={!!success}
                onDismiss={() => setSuccess('')}
                duration={2000}
                style={{ backgroundColor: Colors.success }}
            >
                {success}
            </AppSnackbar>
        </View>
    );
}

const styles = StyleSheet.create({
    countBadge: { backgroundColor: Colors.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    countText: { color: Colors.primary, fontWeight: '800', fontSize: 16 },

    groupListContent: { paddingBottom: 120, gap: 16 },
    areaCard: {
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: Colors.border,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
    },
    areaHeader: { gap: 10, marginBottom: 14 },
    areaHeaderMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    areaName: { fontSize: 17, fontWeight: '800', color: Colors.text, textTransform: 'uppercase' },
    areaTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    areaTag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor: Colors.card,
    },
    areaTagText: { fontSize: 11, fontWeight: '700' },
    reqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
    reqGridStack: { flexDirection: 'column' },
    reqCard: { minWidth: 0 },
    reqCardWide: { width: '48.8%' },
    reqCardFull: { width: '100%' },

    userInfo: { flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 },
    avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary + '15', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 18, fontWeight: '800', color: Colors.primary },
    name: { fontSize: 16, fontWeight: '700', color: Colors.text },
    date: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
    areaInfo: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    headerChips: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
    statusChip: { backgroundColor: Colors.success + '15', height: 28 },
    statusText: { color: Colors.success, fontSize: 11, fontWeight: '700' },
    adjustedChip: { backgroundColor: Colors.warning + '15', height: 28 },
    adjustedText: { color: Colors.warning, fontSize: 11, fontWeight: '700' },

    divider: { height: 1, backgroundColor: Colors.border, marginBottom: 16 },

    itemsContainer: { marginBottom: 20 },
    sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    emptyDeliverText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' },
    itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    itemBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.surface,
        paddingLeft: 10,
        paddingRight: 6,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    itemBadgeAdjusted: { borderColor: Colors.warning + '60', backgroundColor: Colors.warning + '12' },
    itemText: { fontSize: 13, color: Colors.text, fontWeight: '500' },
    qtyBadge: { backgroundColor: Colors.text, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    qtyText: { color: Colors.bg, fontSize: 11, fontWeight: '700' },
    reqQtyBadge: {
        backgroundColor: Colors.warning + '22',
        borderWidth: 1,
        borderColor: Colors.warning + '55',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    reqQtyText: { color: Colors.warning, fontSize: 10, fontWeight: '700' },

    footerActions: { flexDirection: 'row', gap: 10, width: '100%' },
    adjustBtn: { borderRadius: 12, borderColor: Colors.warning + '80', backgroundColor: 'transparent', flex: 1 },
    adjustBtnLabel: { color: Colors.warning, fontWeight: '700', fontSize: 13 },
    deliverBtn: { borderRadius: 12, backgroundColor: Colors.primary, elevation: 0, flex: 1 },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.62)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 18,
    },
    modalCard: {
        width: '100%',
        maxWidth: 560,
        maxHeight: '88%',
        backgroundColor: Colors.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 14,
    },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
    modalSub: { marginTop: 2, fontSize: 13, color: Colors.textSecondary },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
    },
    modalHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
    modalLoading: { fontSize: 12, color: Colors.info, marginBottom: 10, fontWeight: '600' },
    modalList: { maxHeight: 380 },
    modalListContent: { gap: 10, paddingBottom: 8 },
    modalItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    modalItemMeta: { flex: 1, gap: 2 },
    modalItemName: { color: Colors.text, fontSize: 14, fontWeight: '700' },
    modalItemSub: { color: Colors.textSecondary, fontSize: 12 },
    modalWarn: { color: Colors.danger, fontSize: 11, fontWeight: '700', marginTop: 2 },
    qtyControl: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    qtyControlBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.card,
    },
    qtyControlBtnDisabled: { opacity: 0.45 },
    qtyControlValue: { minWidth: 24, textAlign: 'center', color: Colors.text, fontSize: 14, fontWeight: '800' },
    modalFooter: { marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, gap: 8 },
    modalFooterText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
    modalFooterActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },

    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, opacity: 0.6 },
    emptyText: { marginTop: 16, fontSize: 16, color: Colors.textSecondary, fontWeight: '500' },
});
