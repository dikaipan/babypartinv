import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, useWindowDimensions, Pressable, Modal } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/config/supabase';
import { MonthlyRequest, RequestItem, Profile, EngineerStock } from '../../src/types';
import { adminStyles } from '../../src/styles/adminStyles';
import { normalizeArea } from '../../src/utils/normalizeArea';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { NotificationService } from '../../src/services/NotificationService';

type UrgencyLevel = 'Kritis' | 'Tinggi' | 'Normal';

interface AreaGroup {
    area: string;
    requests: (MonthlyRequest & { engineer?: Profile })[];
    totalItems: number;
    totalQty: number;
    urgency: UrgencyLevel;
    urgencyPct: number;
}

const URGENCY_CONFIG: Record<UrgencyLevel, { color: string; icon: string; label: string }> = {
    Kritis: { color: Colors.danger, icon: 'alert-circle', label: 'CRITICAL: AREA STOCK EMPTY' },
    Tinggi: { color: Colors.accent, icon: 'alert', label: 'WARNING: LOW AREA STOCK' },
    Normal: { color: Colors.primary, icon: 'check-circle', label: 'STOCK AVAILABLE' },
};

function getUrgency(pct: number): UrgencyLevel {
    if (pct >= 70) return 'Kritis';
    if (pct >= 40) return 'Tinggi';
    return 'Normal';
}

type ReviewData = {
    requests: (MonthlyRequest & { engineer?: Profile })[];
    allProfiles: Profile[];
    engineerStocks: EngineerStock[];
};

const fetchReviewData = async (): Promise<ReviewData> => {
    const [reqRes, profilesRes, stockRes] = await Promise.all([
        supabase
            .from('monthly_requests')
            .select('*, engineer:profiles!monthly_requests_engineer_id_fkey(*)')
            .eq('status', 'pending')
            .order('submitted_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'engineer'),
        supabase.from('engineer_stock').select('*'),
    ]);

    if (reqRes.error) throw reqRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (stockRes.error) throw stockRes.error;

    return {
        requests: reqRes.data || [],
        allProfiles: profilesRes.data || [],
        engineerStocks: stockRes.data || [],
    };
};

/* ─── Custom Dropdown ─── */
function Dropdown({ label, icon, value, options, onChange, renderOption }: {
    label: string; icon: string; value: string; options: string[];
    onChange: (v: string) => void;
    renderOption?: (opt: string, isActive: boolean) => React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <View style={{ flex: 1, gap: 6 }}>
            <Text style={ddStyles.label}>{label}</Text>
            <Pressable style={ddStyles.trigger} onPress={() => setOpen(true)}>
                <MaterialCommunityIcons name={icon as any} size={18} color={Colors.textSecondary} />
                <Text style={ddStyles.triggerText} numberOfLines={1}>{value}</Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={Colors.textMuted} />
            </Pressable>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={ddStyles.overlay} onPress={() => setOpen(false)}>
                    <View style={ddStyles.menu}>
                        <Text style={ddStyles.menuTitle}>{label}</Text>
                        <ScrollView style={{ maxHeight: 300 }} indicatorStyle="black">
                            {options.map(opt => (
                                <Pressable key={opt} style={[ddStyles.option, value === opt && ddStyles.optionActive]}
                                    onPress={() => { onChange(opt); setOpen(false); }}>
                                    {renderOption ? renderOption(opt, value === opt) : (
                                        <Text style={[ddStyles.optionText, value === opt && ddStyles.optionTextActive]}>{opt}</Text>
                                    )}
                                    {value === opt && <MaterialCommunityIcons name="check" size={18} color={Colors.primary} />}
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const ddStyles = StyleSheet.create({
    label: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    trigger: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    triggerText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
    menu: {
        backgroundColor: Colors.card, borderRadius: 16, padding: 8, width: '85%', maxWidth: 400,
        borderWidth: 1, borderColor: Colors.border,
    },
    menuTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, paddingHorizontal: 12, paddingVertical: 10 },
    option: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10,
    },
    optionActive: { backgroundColor: Colors.primary + '15' },
    optionText: { fontSize: 14, color: Colors.text, fontWeight: '500' },
    optionTextActive: { color: Colors.primary, fontWeight: '700' },
});

/* ─── Main Page ─── */
export default function ReviewPage() {
    const { width } = useWindowDimensions();
    const { user } = useAuthStore();
    const [refreshing, setRefreshing] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [filterArea, setFilterArea] = useState('Semua Area');
    const [filterUrgency, setFilterUrgency] = useState('Semua Urgensi');
    const [selectedEngineer, setSelectedEngineer] = useState<(Profile & { stocks: { part_id: string; quantity: number }[] }) | null>(null);

    const isWide = width >= 900;
    const isCompact = width < 560;

    const reviewQuery = useQuery({
        queryKey: ['admin', 'review', 'pending'],
        queryFn: fetchReviewData,
        enabled: !!user,
    });

    const requests = reviewQuery.data?.requests || [];
    const allProfiles = reviewQuery.data?.allProfiles || [];
    const engineerStocks = reviewQuery.data?.engineerStocks || [];

    useSupabaseRealtimeRefresh(
        ['monthly_requests', 'engineer_stock', 'profiles'],
        () => {
            void reviewQuery.refetch();
        },
        { enabled: !!user },
    );

    useEffect(() => {
        if (!reviewQuery.error) return;
        const message = reviewQuery.error instanceof Error ? reviewQuery.error.message : 'Gagal memuat review.';
        setError(message);
    }, [reviewQuery.error]);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await reviewQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    };

    const approve = async (request: MonthlyRequest & { engineer?: Profile }) => {
        const id = request.id;
        const { error: err } = await supabase.from('monthly_requests').update({
            status: 'approved', reviewed_by: user!.id, reviewed_at: new Date().toISOString(),
        }).eq('id', id);
        if (err) { setError(err.message); return; }
        if (request.engineer_id) {
            void NotificationService.sendToUser(
                request.engineer_id,
                'Request Disetujui',
                'Request Anda telah disetujui admin.',
                { request_id: id, status: 'approved', type: 'request_progress' },
            ).catch((e) => console.error('[review.approve] Notification error:', e));
        }
        setSuccess('Request approved');
        await reviewQuery.refetch();
    };

    const reject = async (request: MonthlyRequest & { engineer?: Profile }) => {
        const id = request.id;
        const { error: err } = await supabase.from('monthly_requests').update({
            status: 'rejected', reviewed_by: user!.id, reviewed_at: new Date().toISOString(),
            rejection_reason: 'Ditolak oleh admin',
        }).eq('id', id);
        if (err) { setError(err.message); return; }
        if (request.engineer_id) {
            void NotificationService.sendToUser(
                request.engineer_id,
                'Request Ditolak',
                'Request Anda ditolak admin. Silakan cek detail request.',
                { request_id: id, status: 'rejected', type: 'request_progress' },
            ).catch((e) => console.error('[review.reject] Notification error:', e));
        }
        setSuccess('Request rejected');
        await reviewQuery.refetch();
    };

    // Area stock lookup: area -> partId -> total qty of that part across all engineers in area
    const areaStockMap = useMemo(() => {
        // Build engineer -> area lookup
        const engAreaMap: Record<string, string> = {};
        for (const p of allProfiles) engAreaMap[p.id] = p.location ? normalizeArea(p.location) : 'Unknown Area';
        // Build area -> partId -> sum(quantity)
        const map: Record<string, Record<string, number>> = {};
        for (const s of engineerStocks) {
            const area = engAreaMap[s.engineer_id] || 'Unknown Area';
            if (!map[area]) map[area] = {};
            map[area][s.part_id] = (map[area][s.part_id] || 0) + s.quantity;
        }
        return map;
    }, [allProfiles, engineerStocks]);

    const allAreas = useMemo(() => {
        const set = new Set(requests.map(r => (r.engineer as any)?.location ? normalizeArea((r.engineer as any).location) : 'Unknown Area'));
        return ['Semua Area', ...Array.from(set).sort()];
    }, [requests]);

    const areaGroups: AreaGroup[] = useMemo(() => {
        const grouped: Record<string, (MonthlyRequest & { engineer?: Profile })[]> = {};
        for (const r of requests) {
            const area = (r.engineer as any)?.location ? normalizeArea((r.engineer as any).location) : 'Unknown Area';
            if (!grouped[area]) grouped[area] = [];
            grouped[area].push(r);
        }
        const stockMap: Record<string, Record<string, number>> = {};
        for (const s of engineerStocks) {
            if (!stockMap[s.engineer_id]) stockMap[s.engineer_id] = {};
            stockMap[s.engineer_id][s.part_id] = s.quantity;
        }
        return Object.entries(grouped).map(([area, reqs]) => {
            const items = reqs.flatMap(r => (r.items as RequestItem[]));
            const totalItems = items.length;
            const totalQty = items.reduce((s, i) => s + i.quantity, 0);
            let zeroStockCount = 0;
            for (const r of reqs) {
                const engStock = stockMap[r.engineer_id] || {};
                for (const item of r.items as RequestItem[]) {
                    if ((engStock[item.partId] ?? 0) === 0) zeroStockCount++;
                }
            }
            const urgencyPct = totalItems > 0 ? Math.round((zeroStockCount / totalItems) * 100) : 0;
            return { area, requests: reqs, totalItems, totalQty, urgency: getUrgency(urgencyPct), urgencyPct };
        }).sort((a, b) => b.urgencyPct - a.urgencyPct);
    }, [requests, engineerStocks]);

    const filteredGroups = useMemo(() => {
        return areaGroups.filter(g => {
            if (filterArea !== 'Semua Area' && g.area !== filterArea) return false;
            if (filterUrgency !== 'Semua Urgensi' && g.urgency !== filterUrgency) return false;
            return true;
        });
    }, [areaGroups, filterArea, filterUrgency]);

    const pendingCount = requests.length;
    const totalItems = requests.reduce((sum, r) => sum + (r.items as RequestItem[]).length, 0);
    const totalQty = requests.reduce((sum, r) => sum + (r.items as RequestItem[]).reduce((s, i) => s + i.quantity, 0), 0);
    const filteredReqCount = filteredGroups.reduce((s, g) => s + g.requests.length, 0);

    // Per-request urgency based on area stock
    const getReqUrgency = useCallback((r: MonthlyRequest & { engineer?: Profile }): UrgencyLevel => {
        const items = r.items as RequestItem[];
        if (!items.length) return 'Normal';
        const area = (r.engineer as any)?.location ? normalizeArea((r.engineer as any).location) : 'Unknown Area';
        const areaStock = areaStockMap[area] || {};
        let zeroCount = 0;
        for (const item of items) {
            if ((areaStock[item.partId] ?? 0) === 0) zeroCount++;
        }
        const pct = Math.round((zeroCount / items.length) * 100);
        return getUrgency(pct);
    }, [areaStockMap]);

    const openEngineerStock = useCallback((engineer: Profile) => {
        const stocks = engineerStocks
            .filter(s => s.engineer_id === engineer.id && s.quantity > 0)
            .map(s => ({ part_id: s.part_id, quantity: s.quantity }))
            .sort((a, b) => a.part_id.localeCompare(b.part_id));
        setSelectedEngineer({ ...engineer, stocks });
    }, [engineerStocks]);

    return (
        <ScrollView
            style={adminStyles.container}
            indicatorStyle="black"
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
            {/* ═══ Section 1: Ringkasan ═══ */}
            <View style={[adminStyles.card, styles.section, isCompact && styles.sectionCompact]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <View>
                        <Text style={styles.sectionTitle}>Ringkasan Pending Request</Text>
                        <Text style={styles.sectionSub}>Jumlah request yang menunggu review admin.</Text>
                    </View>
                    <Button icon="refresh" mode="text" onPress={onRefresh} textColor={Colors.primary} compact>Refresh</Button>
                </View>
                <View style={[styles.statsRow, isCompact && styles.statsRowStack]}>
                    {[
                        { icon: 'clock-outline', val: pendingCount, label: 'Pending Request', clr: Colors.accent },
                        { icon: 'format-list-bulleted', val: totalItems, label: 'Total Item', clr: Colors.info },
                        { icon: 'pound', val: totalQty, label: 'Total Qty', clr: Colors.primary },
                    ].map((s, i) => (
                        <View key={i} style={[styles.statCard, { borderColor: s.clr + '40' }]}>
                            <MaterialCommunityIcons name={s.icon as any} size={20} color={s.clr} />
                            <Text style={styles.statVal}>{s.val}</Text>
                            <Text style={styles.statLabel}>{s.label}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* ═══ Section 2: Filter & Urgensi ═══ */}
            <View style={[adminStyles.card, styles.section, isCompact && styles.sectionCompact]}>
                <Text style={styles.sectionTitle}>Filter & Urgensi</Text>
                <Text style={[styles.sectionSub, { marginBottom: 14 }]}>Filter berdasarkan Area Group atau tingkat Urgensi (Stok Area).</Text>
                <View style={[styles.filterRow, !isWide && { flexDirection: 'column' }]}>
                    <Dropdown label="Filter Area Group" icon="map-marker-outline" value={filterArea} options={allAreas} onChange={setFilterArea} />
                    <Dropdown
                        label="Filter Urgensi" icon="alert-outline" value={filterUrgency}
                        options={['Semua Urgensi', 'Kritis', 'Tinggi', 'Normal']}
                        onChange={setFilterUrgency}
                        renderOption={(opt, isActive) => {
                            const clr = opt === 'Kritis' ? Colors.danger : opt === 'Tinggi' ? Colors.accent : opt === 'Normal' ? Colors.primary : Colors.text;
                            return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    {opt !== 'Semua Urgensi' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: clr }} />}
                                    <Text style={[ddStyles.optionText, isActive && { color: clr, fontWeight: '700' }]}>{opt}</Text>
                                </View>
                            );
                        }}
                    />
                </View>
            </View>

            {/* ═══ Section 3: Daftar Request ═══ */}
            <View style={[adminStyles.card, styles.section, isCompact && styles.sectionCompact]}>
                <Text style={styles.sectionTitle}>Daftar Request Pending</Text>
                <Text style={[styles.sectionSub, { marginBottom: 14 }]}>Menampilkan {filteredReqCount} request sesuai filter.</Text>

                {filteredGroups.length === 0 ? (
                    <View style={styles.empty}>
                        <MaterialCommunityIcons name="check-circle-outline" size={56} color={Colors.primary + '40'} />
                        <Text style={styles.emptyText}>Tidak ada request pending yang sesuai filter.</Text>
                    </View>
                ) : (
                    <View style={{ gap: 20 }}>
                        {filteredGroups.map(group => {
                            const urgCfg = URGENCY_CONFIG[group.urgency];
                            return (
                                <View key={group.area} style={[styles.areaCard, isCompact && styles.areaCardCompact, { borderLeftColor: urgCfg.color }]}>
                                    {/* Area Header */}
                                    <View style={styles.areaHeader}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                            <View style={[adminStyles.iconBox, { backgroundColor: Colors.primary + '15', width: 38, height: 38 }]}>
                                                <MaterialCommunityIcons name="map-marker" size={20} color={Colors.primary} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.areaName}>{group.area}</Text>
                                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                                    <View style={[styles.miniTag, { borderColor: Colors.primary + '50' }]}>
                                                        <Text style={[styles.miniTagText, { color: Colors.primary }]}>{group.requests.length} Request</Text>
                                                    </View>
                                                    <View style={[styles.miniTag, { borderColor: Colors.info + '50' }]}>
                                                        <Text style={[styles.miniTagText, { color: Colors.info }]}>{group.totalItems} Item</Text>
                                                    </View>
                                                    <View style={[styles.miniTag, { borderColor: Colors.accent + '50' }]}>
                                                        <Text style={[styles.miniTagText, { color: Colors.accent }]}>Total Qty: {group.totalQty}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                    </View>

                                    {/* 2-Column Grid of Request Cards */}
                                    <View style={[styles.reqGrid, !isWide && styles.reqGridStack]}>
                                        {group.requests.map(r => {
                                            const items = r.items as RequestItem[];
                                            const reqUrg = getReqUrgency(r);
                                            const reqUrgCfg = URGENCY_CONFIG[reqUrg];
                                            const submittedDate = new Date(r.submitted_at);
                                            const dateStr = submittedDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
                                            const timeStr = submittedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

                                            return (
                                                <View key={r.id} style={[styles.reqCard, isWide ? styles.reqCardWide : styles.reqCardFull]}>
                                                    <View style={{ flex: 1 }}>
                                                        {/* Card Header */}
                                                        <View style={styles.reqCardHeader}>
                                                            <View style={{ flex: 1 }}>
                                                                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => r.engineer && openEngineerStock(r.engineer)}>
                                                                    <MaterialCommunityIcons name="account-outline" size={16} color={Colors.textSecondary} />
                                                                    <Text style={styles.reqName} numberOfLines={1}>
                                                                        {(r.engineer as any)?.name || 'Unknown'}
                                                                    </Text>
                                                                </Pressable>
                                                                <View style={styles.reqMetaRow}>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                                        <MaterialCommunityIcons name="calendar-outline" size={12} color={Colors.textMuted} />
                                                                        <Text style={styles.reqDate}>{dateStr}</Text>
                                                                    </View>
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                                        <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textMuted} />
                                                                        <Text style={styles.reqDate}>{timeStr}</Text>
                                                                    </View>
                                                                </View>
                                                            </View>
                                                            <View style={[styles.itemCountBadge, { backgroundColor: Colors.primary + '20', borderColor: Colors.primary + '50' }]}>
                                                                <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.primary }}>{items.length} Items</Text>
                                                            </View>
                                                        </View>

                                                        {/* Urgency Badge */}
                                                        <View style={[styles.urgencyInline, { backgroundColor: reqUrgCfg.color + '12', borderColor: reqUrgCfg.color + '30' }]}>
                                                            <MaterialCommunityIcons name={reqUrgCfg.icon as any} size={13} color={reqUrgCfg.color} />
                                                            <Text style={{ fontSize: 10, fontWeight: '700', color: reqUrgCfg.color, textTransform: 'uppercase' }}>{reqUrgCfg.label}</Text>
                                                        </View>

                                                        {/* Item Chips with Area Stock */}
                                                        <View style={styles.itemsRow}>
                                                            {items.map((item, idx) => {
                                                                const engArea = (r.engineer as any)?.location ? normalizeArea((r.engineer as any).location) : 'Unknown Area';
                                                                const areaStock = (areaStockMap[engArea] || {})[item.partId] ?? 0;
                                                                const isLow = areaStock === 0;
                                                                return (
                                                                    <View key={idx} style={styles.itemChipRow}>
                                                                        <View style={styles.itemChip}>
                                                                            <Text style={styles.itemChipText}>
                                                                                <Text style={{ fontWeight: '800', color: Colors.text }}>{item.partId}</Text>
                                                                                {' '}<Text style={{ fontWeight: '800', color: Colors.primary }}>x{item.quantity}</Text>
                                                                            </Text>
                                                                        </View>
                                                                        <View style={[styles.stockTag, isLow ? { backgroundColor: Colors.danger + '20', borderColor: Colors.danger + '40' } : { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
                                                                            <Text style={[styles.stockTagText, { color: isLow ? Colors.danger : Colors.textSecondary }]}>Area: {areaStock}</Text>
                                                                        </View>
                                                                    </View>
                                                                );
                                                            })}
                                                        </View>

                                                    </View>
                                                    {/* Actions */}
                                                    <View style={styles.reqActions}>
                                                        <Pressable style={styles.btnReject} onPress={() => reject(r)}>
                                                            <MaterialCommunityIcons name="close-circle-outline" size={16} color={Colors.danger} />
                                                            <Text style={styles.btnRejectText}>Reject</Text>
                                                        </Pressable>
                                                        <Pressable style={styles.btnApprove} onPress={() => approve(r)}>
                                                            <MaterialCommunityIcons name="check-circle-outline" size={16} color="#fff" />
                                                            <Text style={styles.btnApproveText}>Approve</Text>
                                                        </Pressable>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>

            {/* ═══ Engineer Stock Modal ═══ */}
            <Modal visible={!!selectedEngineer} transparent animationType="fade" onRequestClose={() => setSelectedEngineer(null)}>
                <Pressable style={ddStyles.overlay} onPress={() => setSelectedEngineer(null)}>
                    <Pressable style={styles.stockModal} onPress={e => e.stopPropagation()}>
                        {selectedEngineer && (
                            <>
                                <View style={styles.stockModalHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.stockModalTitle}>{selectedEngineer.name}</Text>
                                        <Text style={styles.stockModalSub}>ID: {selectedEngineer.employee_id} • {selectedEngineer.location || 'No Area'}</Text>
                                    </View>
                                    <Pressable onPress={() => setSelectedEngineer(null)} style={styles.stockModalClose}>
                                        <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
                                    </Pressable>
                                </View>

                                <View style={styles.stockModalSummary}>
                                    <MaterialCommunityIcons name="package-variant" size={18} color={Colors.primary} />
                                    <Text style={styles.stockModalSummaryText}>
                                        {selectedEngineer.stocks.length} Part • Total Qty: {selectedEngineer.stocks.reduce((s, i) => s + i.quantity, 0)}
                                    </Text>
                                </View>

                                <ScrollView style={{ maxHeight: 350 }} indicatorStyle="black">
                                    {selectedEngineer.stocks.length === 0 ? (
                                        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                                            <MaterialCommunityIcons name="package-variant-remove" size={40} color={Colors.textMuted} />
                                            <Text style={{ color: Colors.textMuted, marginTop: 8, fontSize: 13 }}>Tidak ada stok</Text>
                                        </View>
                                    ) : (
                                        selectedEngineer.stocks.map((s, idx) => (
                                            <View key={idx} style={[styles.stockModalRow, idx % 2 === 0 && { backgroundColor: Colors.surface }]}>
                                                <Text style={styles.stockModalPartId}>{s.part_id}</Text>
                                                <View style={styles.stockModalQtyBadge}>
                                                    <Text style={styles.stockModalQtyText}>x{s.quantity}</Text>
                                                </View>
                                            </View>
                                        ))
                                    )}
                                </ScrollView>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000} style={{ backgroundColor: Colors.danger }}>{error}</AppSnackbar>
            <AppSnackbar visible={!!success} onDismiss={() => setSuccess('')} duration={2000} style={{ backgroundColor: Colors.success }}>{success}</AppSnackbar>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    section: { marginHorizontal: 20, marginTop: 16, padding: 16 },
    sectionCompact: { marginHorizontal: 12, padding: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
    sectionSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

    statsRow: { flexDirection: 'row', gap: 10 },
    statsRowStack: { flexDirection: 'column' },
    statCard: {
        flex: 1, backgroundColor: Colors.surface, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12,
        borderWidth: 1, gap: 4,
    },
    statVal: { fontSize: 26, fontWeight: '800', color: Colors.text },
    statLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

    filterRow: { flexDirection: 'row', gap: 12 },

    // Area card
    areaCard: {
        backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
    },
    areaCardCompact: { padding: 12 },
    areaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    areaName: { fontSize: 17, fontWeight: '800', color: Colors.text, textTransform: 'uppercase' },
    miniTag: {
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
        borderWidth: 1, backgroundColor: 'transparent',
    },
    miniTagText: { fontSize: 11, fontWeight: '700' },

    // 2-col grid
    reqGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16,
        justifyContent: 'space-between',
    },
    reqGridStack: { flexDirection: 'column' },

    // Request card
    reqCard: {
        minWidth: 0,
        backgroundColor: Colors.card, borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: Colors.border,
        flexDirection: 'column',
    },
    reqCardWide: { width: '48.5%' },
    reqCardFull: { width: '100%' },
    reqCardHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10,
    },
    reqName: { fontSize: 13, fontWeight: '700', color: Colors.text, flexShrink: 1 },
    reqMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
    reqDate: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
    itemCountBadge: {
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
        marginLeft: 8, flexShrink: 0,
    },

    // Urgency inline badge
    urgencyInline: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 6, borderWidth: 1, marginBottom: 10,
    },

    // Items
    itemsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
    itemChipRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
    itemChip: {
        backgroundColor: Colors.surface, paddingHorizontal: 8, paddingVertical: 5,
        borderTopLeftRadius: 6, borderBottomLeftRadius: 6,
        borderWidth: 1, borderColor: Colors.border, borderRightWidth: 0,
    },
    itemChipText: { fontSize: 11, color: Colors.text },
    stockTag: {
        paddingHorizontal: 6, paddingVertical: 5,
        borderTopRightRadius: 6, borderBottomRightRadius: 6,
        borderWidth: 1,
    },
    stockTagText: { fontSize: 10, fontWeight: '700' },

    // Actions
    reqActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    btnReject: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: 10,
        borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
    },
    btnRejectText: { fontSize: 13, fontWeight: '700', color: Colors.danger },
    btnApprove: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: 10,
        backgroundColor: Colors.primary,
    },
    btnApproveText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    empty: { alignItems: 'center', paddingVertical: 30, gap: 12 },
    emptyText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },

    // Engineer Stock Modal
    stockModal: {
        backgroundColor: Colors.card, borderRadius: 18, width: '90%', maxWidth: 420,
        borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    },
    stockModalHeader: {
        flexDirection: 'row', alignItems: 'center', padding: 18, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    stockModalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
    stockModalSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
    stockModalClose: {
        width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.surface,
        alignItems: 'center', justifyContent: 'center',
    },
    stockModalSummary: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 18, paddingVertical: 10,
        backgroundColor: Colors.primary + '10',
    },
    stockModalSummaryText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
    stockModalRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 18, paddingVertical: 10,
    },
    stockModalPartId: { fontSize: 13, fontWeight: '600', color: Colors.text },
    stockModalQtyBadge: {
        backgroundColor: Colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 6,
    },
    stockModalQtyText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
});
