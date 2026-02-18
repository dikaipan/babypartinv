import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, useWindowDimensions, LayoutAnimation, Platform, UIManager, Modal, Share } from 'react-native';
import { Text, Chip, Searchbar, Button, SegmentedButtons } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import { supabase } from '../../src/config/supabase';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { Profile, EngineerStock, InventoryPart } from '../../src/types';
import { adminStyles } from '../../src/styles/adminStyles';
import { normalizeArea } from '../../src/utils/normalizeArea';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Tab = 'monitor' | 'pengiriman' | 'koreksi';
type MonitorWindow = '24h' | '7d' | '14d';
type AlertSeverity = 'critical' | 'warning' | 'info';

type MonitorRequestRow = {
    id: string;
    status: string;
    submitted_at: string | null;
    reviewed_at?: string | null;
    delivered_at?: string | null;
    confirmed_at?: string | null;
};

type UsageReportRow = {
    date: string | null;
    created_at?: string | null;
    items: any;
};

type MonitorAlert = {
    id: string;
    severity: AlertSeverity;
    title: string;
    detail: string;
    occurredAt?: string | null;
};

type RiskPartRow = {
    part_id: string;
    part_name: string;
    stock: number;
    min_stock: number;
    avgDaily: number;
    daysToStockout: number;
};

const MONITOR_WINDOW_OPTIONS: { value: MonitorWindow; label: string }[] = [
    { value: '24h', label: '24 jam' },
    { value: '7d', label: '7 hari' },
    { value: '14d', label: '14 hari' },
];

const REQUEST_OPEN_STATUSES = ['pending', 'approved', 'delivered'] as const;
const REQUEST_SLA_RISK_HOURS = 48;
const REQUEST_OVERDUE_HOURS = 72;
const RISK_STOCKOUT_THRESHOLD_DAYS = 14;

const monitorWindowToDays = (window: MonitorWindow): number => {
    if (window === '24h') return 1;
    if (window === '7d') return 7;
    return 14;
};

const safeDateMs = (value?: string | null): number | null => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
};

const formatRelativeTime = (value?: string | null): string => {
    const ms = safeDateMs(value);
    if (ms === null) return '-';
    const diffMs = Date.now() - ms;
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'baru saja';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'baru saja';
    if (minutes < 60) return `${minutes}m lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}j lalu`;
    const days = Math.floor(hours / 24);
    return `${days}h lalu`;
};

const formatDaysToStockout = (value: number): string => {
    if (!Number.isFinite(value)) return '-';
    if (value < 1) return '<1';
    if (value > 99) return '99+';
    return value.toFixed(1);
};

const formatDayKey = (ms: number): string => {
    const dt = new Date(ms);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const isUsageReportsDateMissingError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const message = String((error as { message?: unknown }).message || '').toLowerCase();
    return message.includes('usage_reports') && message.includes('date') && (
        message.includes('column')
        || message.includes('schema cache')
        || message.includes('could not find')
    );
};

const parseUsageItems = (rawItems: any): { partId: string; partName: string; quantity: number }[] => {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
        .map((raw: any) => {
            const partId = String(raw?.partId ?? raw?.part_id ?? '').trim();
            const partName = String(raw?.partName ?? raw?.part_name ?? partId).trim();
            const quantity = Number(raw?.quantity ?? raw?.qty ?? 0);
            return {
                partId,
                partName: partName || partId,
                quantity: Number.isFinite(quantity) ? quantity : 0,
            };
        })
        .filter((item) => item.partId && item.quantity > 0);
};

const getAlertVisual = (severity: AlertSeverity) => {
    if (severity === 'critical') {
        return {
            color: Colors.danger,
            icon: 'alert-circle',
        };
    }
    if (severity === 'warning') {
        return {
            color: Colors.accent,
            icon: 'alert-outline',
        };
    }
    return {
        color: Colors.info,
        icon: 'information-outline',
    };
};

type ReportsData = {
    profiles: Profile[];
    engineerStocks: EngineerStock[];
    parts: InventoryPart[];
    adjustments: any[];
    deliveries: any[];
    monitorRequests: MonitorRequestRow[];
    usageReports: UsageReportRow[];
    fetchedAt: string;
};

const fetchReportsData = async (): Promise<ReportsData> => {
    const fetchUsageRows = async () => {
        let response = await supabase.from('usage_reports').select('date, created_at, items');
        if (response.error && isUsageReportsDateMissingError(response.error)) {
            response = await supabase.from('usage_reports').select('created_at, items');
        }
        return response;
    };

    const [profilesRes, stockRes, partsRes, adjRes, delRes, openReqRes, usageRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'engineer'),
        supabase.from('engineer_stock').select('*'),
        supabase.from('inventory').select('*'),
        supabase.from('stock_adjustments').select('*').order('timestamp', { ascending: false }).limit(50),
        supabase.from('monthly_requests').select('*, engineer:profiles!monthly_requests_engineer_id_fkey(name, employee_id, location)').in('status', ['delivered', 'completed']).order('delivered_at', { ascending: false }).limit(50),
        supabase.from('monthly_requests').select('id, status, submitted_at, reviewed_at, delivered_at, confirmed_at').in('status', [...REQUEST_OPEN_STATUSES]),
        fetchUsageRows(),
    ]);

    const firstError = [
        profilesRes.error,
        stockRes.error,
        partsRes.error,
        adjRes.error,
        delRes.error,
        openReqRes.error,
        usageRes.error,
    ].find(Boolean);

    if (firstError) throw firstError;

    const usageReportsRaw = Array.isArray(usageRes.data) ? (usageRes.data as UsageReportRow[]) : [];
    const usageReports = usageReportsRaw.map((row) => ({
        date: row.date || row.created_at || null,
        items: row.items,
    }));

    return {
        profiles: profilesRes.data || [],
        engineerStocks: stockRes.data || [],
        parts: partsRes.data || [],
        adjustments: adjRes.data || [],
        deliveries: delRes.data || [],
        monitorRequests: (openReqRes.data || []) as MonitorRequestRow[],
        usageReports,
        fetchedAt: new Date().toISOString(),
    };
};

/* ─── Custom Dropdown ─── */
function Dropdown({ label, icon, value, options, onChange }: {
    label: string; icon: string; value: string; options: string[];
    onChange: (v: string) => void;
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
                                    <Text style={[ddStyles.optionText, value === opt && ddStyles.optionTextActive]}>{opt}</Text>
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

/* ─── Types for grouped data ─── */
interface EngineerWithStock {
    profile: Profile;
    stocks: { part_id: string; part_name: string; quantity: number }[];
    missingParts: { part_id: string; part_name: string }[];
    totalQty: number;
}

interface AreaGroupData {
    area: string;
    engineers: EngineerWithStock[];
    totalParts: number;
    totalQty: number;
    engineerCount: number;
}

/* ─── Main Page ─── */
export default function ReportsPage() {
    const { width } = useWindowDimensions();
    const [tab, setTab] = useState<Tab>('monitor');
    const [monitorWindow, setMonitorWindow] = useState<MonitorWindow>('7d');
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [filterArea, setFilterArea] = useState('Semua Area');
    const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');
    const reportsQuery = useQuery({
        queryKey: ['admin', 'reports'],
        queryFn: fetchReportsData,
    });
    const lastUpdatedAt = reportsQuery.data?.fetchedAt || null;
    const profiles = reportsQuery.data?.profiles || [];
    const engineerStocks = reportsQuery.data?.engineerStocks || [];
    const parts = reportsQuery.data?.parts || [];
    const monitorRequests = reportsQuery.data?.monitorRequests || [];
    const usageReports = reportsQuery.data?.usageReports || [];
    const adjustments = reportsQuery.data?.adjustments || [];
    const deliveries = reportsQuery.data?.deliveries || [];

    const isWide = width >= 768;

    useEffect(() => {
        if (!reportsQuery.error) return;
        const message = reportsQuery.error instanceof Error ? reportsQuery.error.message : 'Gagal memuat data reports.';
        setError(message);
    }, [reportsQuery.error]);

    useSupabaseRealtimeRefresh(
        ['profiles', 'engineer_stock', 'inventory', 'stock_adjustments', 'monthly_requests', 'usage_reports'],
        () => {
            void reportsQuery.refetch();
        },
    );

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await reportsQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    };

    // Build part name lookup
    const partNameMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const p of parts) map[p.id] = p.part_name;
        return map;
    }, [parts]);

    // Build area groups
    const areaGroups: AreaGroupData[] = useMemo(() => {
        const grouped: Record<string, Profile[]> = {};
        for (const p of profiles) {
            const area = p.location ? normalizeArea(p.location) : 'Unknown Area';
            if (!grouped[area]) grouped[area] = [];
            grouped[area].push(p);
        }

        // Build engineer stock lookup
        const stockByEng: Record<string, { part_id: string; quantity: number }[]> = {};
        for (const s of engineerStocks) {
            if (!stockByEng[s.engineer_id]) stockByEng[s.engineer_id] = [];
            stockByEng[s.engineer_id].push({ part_id: s.part_id, quantity: s.quantity });
        }

        return Object.entries(grouped).map(([area, engList]) => {
            const engineers: EngineerWithStock[] = engList.map(p => {
                const raw = stockByEng[p.id] || [];
                const stocks = raw
                    .filter(s => s.quantity > 0)
                    .map(s => ({ part_id: s.part_id, part_name: partNameMap[s.part_id] || s.part_id, quantity: s.quantity }))
                    .sort((a, b) => a.part_id.localeCompare(b.part_id));
                const ownedPartIds = new Set(stocks.map(s => s.part_id));
                const missingParts = parts
                    .filter(p => !ownedPartIds.has(p.id))
                    .map(p => ({ part_id: p.id, part_name: p.part_name }))
                    .sort((a, b) => a.part_id.localeCompare(b.part_id));
                return { profile: p, stocks, missingParts, totalQty: stocks.reduce((sum, s) => sum + s.quantity, 0) };
            }).sort((a, b) => a.profile.name.localeCompare(b.profile.name));

            const totalParts = engineers.reduce((s, e) => s + e.stocks.length, 0);
            const totalQty = engineers.reduce((s, e) => s + e.totalQty, 0);
            return { area, engineers, totalParts, totalQty, engineerCount: engineers.length };
        }).sort((a, b) => a.area.localeCompare(b.area));
    }, [profiles, engineerStocks, partNameMap]);

    const allAreas = useMemo(() => ['Semua Area', ...areaGroups.map(g => g.area)], [areaGroups]);

    // Filter
    const filteredGroups = useMemo(() => {
        let groups = areaGroups;
        if (filterArea !== 'Semua Area') groups = groups.filter(g => g.area === filterArea);

        if (search.trim()) {
            const q = search.toLowerCase();
            groups = groups.map(g => {
                const filtered = g.engineers.filter(e =>
                    e.profile.name.toLowerCase().includes(q) ||
                    (e.profile.employee_id || '').toLowerCase().includes(q) ||
                    e.stocks.some(s => s.part_id.toLowerCase().includes(q) || s.part_name.toLowerCase().includes(q))
                );
                if (filtered.length === 0) return null;
                return {
                    ...g,
                    engineers: filtered,
                    engineerCount: filtered.length,
                    totalParts: filtered.reduce((s, e) => s + e.stocks.length, 0),
                    totalQty: filtered.reduce((s, e) => s + e.totalQty, 0),
                };
            }).filter(Boolean) as AreaGroupData[];
        }
        return groups;
    }, [areaGroups, filterArea, search]);

    const toggleArea = (area: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedAreas(prev => {
            const next = new Set(prev);
            if (next.has(area)) next.delete(area); else next.add(area);
            return next;
        });
    };

    // Summary stats
    const totalEngineers = profiles.length;
    const totalStockQty = useMemo(() => engineerStocks.reduce((s, e) => s + e.quantity, 0), [engineerStocks]);
    const engineersWithZero = useMemo(() => {
        const engIds = new Set(engineerStocks.filter(s => s.quantity > 0).map(s => s.engineer_id));
        return profiles.filter(p => !engIds.has(p.id)).length;
    }, [profiles, engineerStocks]);
    const monitorWindowDays = useMemo(() => monitorWindowToDays(monitorWindow), [monitorWindow]);
    const monitorWindowLabel = useMemo(
        () => MONITOR_WINDOW_OPTIONS.find((opt) => opt.value === monitorWindow)?.label || monitorWindow,
        [monitorWindow]
    );
    const monitorCutoffMs = useMemo(() => Date.now() - (monitorWindowDays * 24 * 60 * 60 * 1000), [monitorWindowDays]);
    const monitorOpenRequests = useMemo(
        () => monitorRequests.filter((row) => {
            const submittedMs = safeDateMs(row.submitted_at);
            return submittedMs !== null && submittedMs >= monitorCutoffMs;
        }),
        [monitorRequests, monitorCutoffMs]
    );

    const openRequestCount = monitorOpenRequests.length;
    const overdueRequestCount = useMemo(
        () => monitorOpenRequests.filter((row) => {
            if (row.status !== 'pending' && row.status !== 'approved') return false;
            const submittedMs = safeDateMs(row.submitted_at);
            if (submittedMs === null) return false;
            const ageHours = (Date.now() - submittedMs) / (1000 * 60 * 60);
            return ageHours >= REQUEST_OVERDUE_HOURS;
        }).length,
        [monitorOpenRequests]
    );
    const slaRiskCount = useMemo(
        () => monitorOpenRequests.filter((row) => {
            if (row.status !== 'pending' && row.status !== 'approved') return false;
            const submittedMs = safeDateMs(row.submitted_at);
            if (submittedMs === null) return false;
            const ageHours = (Date.now() - submittedMs) / (1000 * 60 * 60);
            return ageHours >= REQUEST_SLA_RISK_HOURS && ageHours < REQUEST_OVERDUE_HOURS;
        }).length,
        [monitorOpenRequests]
    );

    const outOfStockCount = useMemo(
        () => parts.filter((part) => Number(part.total_stock) <= 0).length,
        [parts]
    );
    const lowStockCount = useMemo(
        () => parts.filter((part) => Number(part.total_stock) > 0 && Number(part.total_stock) <= Number(part.min_stock)).length,
        [parts]
    );
    const criticalPartCount = outOfStockCount + lowStockCount;

    const averageLeadTimeHours = useMemo(() => {
        const leadTimes = deliveries
            .map((row) => {
                const submittedMs = safeDateMs(row?.submitted_at);
                const terminalMs = safeDateMs(row?.confirmed_at || row?.delivered_at);
                if (submittedMs === null || terminalMs === null || terminalMs < submittedMs || terminalMs < monitorCutoffMs) return null;
                return (terminalMs - submittedMs) / (1000 * 60 * 60);
            })
            .filter((value): value is number => value !== null);

        if (leadTimes.length === 0) return null;
        return leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length;
    }, [deliveries, monitorCutoffMs]);
    const averageLeadTimeLabel = averageLeadTimeHours === null
        ? '-'
        : `${averageLeadTimeHours.toFixed(1)} jam`;

    const partUsageByWindow = useMemo(() => {
        const usageMap = new Map<string, { total: number; part_name: string }>();
        for (const row of usageReports) {
            const reportMs = safeDateMs(row.date);
            if (reportMs === null || reportMs < monitorCutoffMs) continue;

            for (const item of parseUsageItems(row.items)) {
                const existing = usageMap.get(item.partId) || {
                    total: 0,
                    part_name: partNameMap[item.partId] || item.partName || item.partId,
                };
                existing.total += item.quantity;
                usageMap.set(item.partId, existing);
            }
        }
        return usageMap;
    }, [usageReports, monitorCutoffMs, partNameMap]);

    const riskParts = useMemo<RiskPartRow[]>(() => {
        const rows: RiskPartRow[] = [];
        for (const part of parts) {
            const usage = partUsageByWindow.get(part.id);
            const avgDaily = usage ? usage.total / monitorWindowDays : 0;
            const stock = Number(part.total_stock) || 0;
            const minStock = Number(part.min_stock) || 0;
            const daysToStockout = avgDaily > 0 ? stock / avgDaily : Number.POSITIVE_INFINITY;
            const isCriticalStock = stock <= minStock;
            const isProjectedRisk = avgDaily > 0 && daysToStockout <= RISK_STOCKOUT_THRESHOLD_DAYS;
            if (!isCriticalStock && !isProjectedRisk) continue;

            rows.push({
                part_id: part.id,
                part_name: part.part_name || part.id,
                stock,
                min_stock: minStock,
                avgDaily,
                daysToStockout,
            });
        }

        return rows
            .sort((a, b) => {
                const aPriority = a.stock <= 0 ? 0 : Number.isFinite(a.daysToStockout) ? 1 : 2;
                const bPriority = b.stock <= 0 ? 0 : Number.isFinite(b.daysToStockout) ? 1 : 2;
                if (aPriority !== bPriority) return aPriority - bPriority;
                const aDays = Number.isFinite(a.daysToStockout) ? a.daysToStockout : Number.POSITIVE_INFINITY;
                const bDays = Number.isFinite(b.daysToStockout) ? b.daysToStockout : Number.POSITIVE_INFINITY;
                if (aDays !== bDays) return aDays - bDays;
                if (a.stock !== b.stock) return a.stock - b.stock;
                return a.part_name.localeCompare(b.part_name);
            })
            .slice(0, 6);
    }, [parts, partUsageByWindow, monitorWindowDays]);

    const usageSpikeAlerts = useMemo(() => {
        const todayKey = formatDayKey(Date.now());
        const dayTotalsByPart = new Map<string, Map<string, number>>();

        for (const report of usageReports) {
            const reportMs = safeDateMs(report.date);
            if (reportMs === null || reportMs < monitorCutoffMs) continue;
            const dayKey = formatDayKey(reportMs);

            for (const item of parseUsageItems(report.items)) {
                if (!dayTotalsByPart.has(item.partId)) dayTotalsByPart.set(item.partId, new Map<string, number>());
                const dayMap = dayTotalsByPart.get(item.partId)!;
                dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + item.quantity);
            }
        }

        const spikes: { partId: string; todayQty: number; baseline: number; ratio: number }[] = [];
        for (const [partId, dayMap] of dayTotalsByPart.entries()) {
            const todayQty = dayMap.get(todayKey) || 0;
            const history = [...dayMap.entries()]
                .filter(([day]) => day !== todayKey)
                .map(([, qty]) => qty)
                .filter((qty) => qty > 0);
            if (history.length < 2 || todayQty <= 0) continue;

            const baseline = history.reduce((sum, qty) => sum + qty, 0) / history.length;
            if (baseline <= 0) continue;

            const ratio = todayQty / baseline;
            if (todayQty >= 5 && ratio >= 2) {
                spikes.push({ partId, todayQty, baseline, ratio });
            }
        }

        return spikes.sort((a, b) => b.ratio - a.ratio).slice(0, 2);
    }, [usageReports, monitorCutoffMs]);

    const monitorAlerts = useMemo<MonitorAlert[]>(() => {
        const alerts: MonitorAlert[] = [];

        if (outOfStockCount > 0) {
            alerts.push({
                id: 'stock-empty',
                severity: 'critical',
                title: 'Stok habis',
                detail: `${outOfStockCount} part berada di stok 0.`,
            });
        }
        if (overdueRequestCount > 0) {
            alerts.push({
                id: 'request-overdue',
                severity: 'critical',
                title: 'Request overdue',
                detail: `${overdueRequestCount} request pending/approved lebih dari 3 hari.`,
            });
        }
        if (slaRiskCount > 0) {
            alerts.push({
                id: 'request-sla-risk',
                severity: 'warning',
                title: 'SLA terancam',
                detail: `${slaRiskCount} request mendekati overdue (48-72 jam).`,
            });
        }
        if (lowStockCount > 0) {
            alerts.push({
                id: 'stock-low',
                severity: 'warning',
                title: 'Stok menipis',
                detail: `${lowStockCount} part berada di batas minimum.`,
            });
        }
        for (const spike of usageSpikeAlerts) {
            alerts.push({
                id: `spike-${spike.partId}`,
                severity: 'warning',
                title: 'Pemakaian spike',
                detail: `${partNameMap[spike.partId] || spike.partId} naik ${spike.ratio.toFixed(1)}x (hari ini ${spike.todayQty} pcs).`,
            });
        }
        if (alerts.length === 0) {
            alerts.push({
                id: 'monitor-ok',
                severity: 'info',
                title: 'Kondisi stabil',
                detail: `Tidak ada alert prioritas pada rentang ${monitorWindowLabel}.`,
            });
        }

        return alerts.slice(0, 6);
    }, [
        lowStockCount,
        monitorWindowLabel,
        outOfStockCount,
        overdueRequestCount,
        partNameMap,
        slaRiskCount,
        usageSpikeAlerts,
    ]);

    // Export Logic
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        if (exporting) return;
        setExporting(true);

        try {
            const now = new Date();
            const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = `Full_Report_Matrix_${dateStr}.csv`;

            const escapeCsv = (val: any) => {
                const str = String(val ?? '');
                if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
                return str;
            };

            const csvRows: string[] = [];
            const pushRow = (row: any[]) => csvRows.push(row.map(escapeCsv).join(','));
            const pushEmpty = () => csvRows.push('');
            const pushSectionTitle = (title: string) => {
                pushRow([`=== ${title} ===`]);
            };

            // 1. SNAPSHOT STATS
            pushSectionTitle('SNAPSHOT STATS');
            pushRow(['Metric', 'Value']);
            pushRow(['Generated At', now.toLocaleString('id-ID')]);
            pushRow(['Open Requests', openRequestCount]);
            pushRow(['SLA Risk', slaRiskCount]);
            pushRow(['Critical Parts', criticalPartCount]);
            pushRow(['Avg Lead Time', averageLeadTimeLabel]);
            pushRow(['Total Engineers', totalEngineers]);
            pushRow(['Total Stock Qty', totalStockQty]);
            pushRow(['Engineers w/ Zero Stock', engineersWithZero]);
            pushEmpty();

            // 2. PRIORITY ALERTS
            pushSectionTitle('PRIORITY ALERTS');
            pushRow(['Severity', 'Title', 'Detail']);
            if (monitorAlerts.length === 0) {
                pushRow(['(No active alerts)']);
            } else {
                monitorAlerts.forEach(a => pushRow([a.severity, a.title, a.detail]));
            }
            pushEmpty();

            // 3. ENGINEER STOCK (MATRIX)
            pushSectionTitle('ENGINEER STOCK MATRIX');

            // Sort parts for consistent columns
            const sortedParts = [...parts].sort((a, b) => a.part_name.localeCompare(b.part_name));

            // Header Row: Area, Name, ID, ...PartNames
            const headerRow = ['Area', 'Engineer Name', 'Employee ID', ...sortedParts.map(p => p.part_name)];
            pushRow(headerRow);

            const groupsToExport = filteredGroups.length > 0 ? filteredGroups : areaGroups;
            let engineerCount = 0;

            for (const group of groupsToExport) {
                for (const eng of group.engineers) {
                    const row: any[] = [
                        group.area,
                        eng.profile.name || '',
                        eng.profile.employee_id || ''
                    ];

                    // Create lookup for this engineer's stock
                    const stockMap = new Map<string, number>();
                    eng.stocks.forEach(s => stockMap.set(s.part_id, s.quantity));

                    // Fill columns
                    for (const part of sortedParts) {
                        const qty = stockMap.get(part.id) || 0;
                        row.push(qty);
                    }

                    pushRow(row);
                    engineerCount++;
                }
            }

            if (engineerCount === 0) pushRow(['(No engineer data available)']);
            pushEmpty();

            // 4. DELIVERY HISTORY
            pushSectionTitle('DELIVERY HISTORY (LATEST 50)');
            pushRow(['Delivered At', 'Engineer Name', 'Items Count', 'Part Details']);

            if (deliveries.length === 0) {
                pushRow(['(No deliveries found)']);
            } else {
                deliveries.forEach(d => {
                    const engName = (d.engineer as any)?.name || 'Unknown';
                    const date = d.delivered_at ? new Date(d.delivered_at).toLocaleString('id-ID') : '-';
                    const items = (d.items as any[]) || [];
                    const itemDetails = items.map(i => `${i.partId} (x${i.quantity})`).join('; ');

                    pushRow([
                        date,
                        engName,
                        items.length,
                        itemDetails
                    ]);
                });
            }

            const csvContent = '\uFEFF' + csvRows.join('\n');

            if (Platform.OS === 'web') {
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                return;
            }

            // Mobile specific sharing
            await Share.share({
                title: 'Export Full Matrix Report',
                message: 'Berikut adalah laporan lengkap (Matrix Stok & Pengiriman).',
                url: `data:text/csv;base64,${Buffer.from(csvContent).toString('base64')}`, // Try base64 for file sharing if supported or just share text
            }).catch(async () => {
                // Fallback to simple text share if file share fails
                await Share.share({
                    message: csvContent,
                });
            });

        } catch (e) {
            console.error('Export failed:', e);
            alert('Gagal melakukan export data.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <>
            <ScrollView
                style={styles.container}
                indicatorStyle="black"
                contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            >
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Reports</Text>
                    <Text style={styles.sub}>Monitoring stok engineer & activity logs</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                        icon="download"
                        mode="contained-tonal"
                        onPress={handleExport}
                        loading={exporting}
                        disabled={exporting}
                        compact
                    >
                        Export All
                    </Button>
                    <Button icon="refresh" mode="text" onPress={onRefresh} textColor={Colors.primary}>
                        Refresh
                    </Button>
                </View>
            </View>

            <View style={styles.tabContainer}>
                <SegmentedButtons
                    value={tab}
                    onValueChange={v => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setTab(v as Tab);
                    }}
                    buttons={[
                        { value: 'monitor', label: 'Monitor', icon: 'chart-box-outline' },
                        { value: 'pengiriman', label: 'Delivery', icon: 'truck-delivery-outline' },
                        { value: 'koreksi', label: 'Logs', icon: 'history' },
                    ]}
                    style={styles.segmentedBtn}
                    theme={{ colors: { secondaryContainer: Colors.primary + '20', onSecondaryContainer: Colors.primary } }}
                />
            </View>

            {/* ═══ Monitor Tab ═══ */}
            {tab === 'monitor' && (
                <View style={{ gap: 16 }}>
                    <View style={[adminStyles.card, styles.monitorControlCard]}>
                        <View style={[styles.monitorControlHead, !isWide && { alignItems: 'flex-start' }]}>
                            <View>
                                <Text style={styles.monitorSectionTitle}>Monitor Snapshot</Text>
                                <Text style={styles.monitorSectionHint}>Rentang aktif: {monitorWindowLabel}</Text>
                            </View>
                            <Text style={styles.monitorUpdatedAt}>Last updated {formatRelativeTime(lastUpdatedAt)}</Text>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.monitorWindowChipRow}
                        >
                            {MONITOR_WINDOW_OPTIONS.map((option) => {
                                const isActive = option.value === monitorWindow;
                                return (
                                    <Chip
                                        key={option.value}
                                        mode={isActive ? 'flat' : 'outlined'}
                                        selected={isActive}
                                        onPress={() => setMonitorWindow(option.value)}
                                        style={[
                                            styles.monitorWindowChip,
                                            isActive && styles.monitorWindowChipActive,
                                        ]}
                                        textStyle={[
                                            styles.monitorWindowChipText,
                                            isActive && styles.monitorWindowChipTextActive,
                                        ]}
                                    >
                                        {option.label}
                                    </Chip>
                                );
                            })}
                        </ScrollView>
                    </View>

                    <View style={[styles.statsRow, !isWide && { flexWrap: 'wrap' }]}>
                        {[
                            {
                                icon: 'file-document-multiple-outline',
                                val: openRequestCount,
                                label: `Open Request (${monitorWindowLabel})`,
                                clr: Colors.primary,
                            },
                            {
                                icon: 'alert-circle-outline',
                                val: slaRiskCount,
                                label: 'SLA Terancam',
                                clr: Colors.accent,
                            },
                            {
                                icon: 'package-variant-remove',
                                val: criticalPartCount,
                                label: 'Part Critical',
                                clr: Colors.danger,
                            },
                            {
                                icon: 'clock-time-eight-outline',
                                val: averageLeadTimeLabel,
                                label: 'Avg Lead Time',
                                clr: Colors.info,
                            },
                        ].map((s, i) => (
                            <View key={i} style={[styles.statCard, { borderColor: s.clr + '40' }]}>
                                <View style={[styles.statIcon, { backgroundColor: s.clr + '15' }]}>
                                    <MaterialCommunityIcons name={s.icon as any} size={18} color={s.clr} />
                                </View>
                                <Text style={styles.statVal}>{s.val}</Text>
                                <Text style={styles.statLabel}>{s.label}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={[adminStyles.card, { padding: 14, gap: 10 }]}>
                        <Text style={styles.monitorSectionTitle}>Priority Alerts</Text>
                        <Text style={styles.monitorSectionHint}>Urutan critical, warning, info.</Text>
                        <View style={styles.alertList}>
                            {monitorAlerts.map((alert) => {
                                const visual = getAlertVisual(alert.severity);
                                return (
                                    <View key={alert.id} style={[styles.alertCard, { borderColor: visual.color + '35' }]}>
                                        <View style={[styles.alertIcon, { backgroundColor: visual.color + '15' }]}>
                                            <MaterialCommunityIcons name={visual.icon as any} size={16} color={visual.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.alertTitle}>{alert.title}</Text>
                                            <Text style={styles.alertDetail}>{alert.detail}</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    <View style={adminStyles.card}>
                        <Text style={styles.monitorSectionTitle}>Top Risk Parts</Text>
                        <Text style={styles.monitorSectionHint}>
                            Proyeksi stockout berdasarkan rata-rata pemakaian {monitorWindowLabel}.
                        </Text>
                        {riskParts.length === 0 ? (
                            <Text style={styles.monitorEmptyText}>Belum ada part dengan risiko tinggi.</Text>
                        ) : (
                            <View style={styles.riskTable}>
                                <View style={[styles.riskRow, styles.riskHeaderRow]}>
                                    <Text style={[styles.riskCell, styles.riskCellPart]}>Part</Text>
                                    <Text style={[styles.riskCell, styles.riskCellSm]}>Stok</Text>
                                    <Text style={[styles.riskCell, styles.riskCellMd]}>Avg/hari</Text>
                                    <Text style={[styles.riskCell, styles.riskCellMd]}>Days left</Text>
                                </View>
                                {riskParts.map((part) => (
                                    <View key={part.part_id} style={styles.riskRow}>
                                        <View style={[styles.riskCell, styles.riskCellPart]}>
                                            <Text style={styles.riskPartName} numberOfLines={1}>{part.part_name}</Text>
                                            <Text style={styles.riskPartId} numberOfLines={1}>{part.part_id}</Text>
                                        </View>
                                        <Text style={[styles.riskCell, styles.riskCellSm, part.stock <= part.min_stock && { color: Colors.danger }]}>
                                            {part.stock}
                                        </Text>
                                        <Text style={[styles.riskCell, styles.riskCellMd]}>{part.avgDaily.toFixed(1)}</Text>
                                        <Text style={[styles.riskCell, styles.riskCellMd, Number.isFinite(part.daysToStockout) && part.daysToStockout <= RISK_STOCKOUT_THRESHOLD_DAYS && { color: Colors.danger }]}>
                                            {formatDaysToStockout(part.daysToStockout)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    <View style={[adminStyles.card, styles.monitorCoverageCard]}>
                        <Text style={styles.monitorSectionTitle}>Engineer Coverage</Text>
                        <Text style={styles.monitorSectionHint}>Ringkasan distribusi stok engineer lintas area.</Text>
                        <View style={[styles.statsRow, !isWide && { flexWrap: 'wrap' }]}>
                            {[
                                { icon: 'account-group-outline', val: totalEngineers, label: 'Total Engineer', clr: Colors.info },
                                { icon: 'map-marker-multiple-outline', val: areaGroups.length, label: 'Area Group', clr: Colors.primary },
                                { icon: 'package-variant', val: totalStockQty, label: 'Total Stok Qty', clr: Colors.accent },
                                { icon: 'alert-circle-outline', val: engineersWithZero, label: 'Tanpa Stok', clr: Colors.danger },
                            ].map((s, i) => (
                                <View key={i} style={[styles.statCard, { borderColor: s.clr + '40' }]}>
                                    <View style={[styles.statIcon, { backgroundColor: s.clr + '15' }]}>
                                        <MaterialCommunityIcons name={s.icon as any} size={18} color={s.clr} />
                                    </View>
                                    <Text style={styles.statVal}>{s.val}</Text>
                                    <Text style={styles.statLabel}>{s.label}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Filter & Search */}
                    <View style={[adminStyles.card, { padding: 14, gap: 12 }]}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary }}>Filter & Pencarian</Text>
                        <View style={[styles.filterRow, !isWide && { flexDirection: 'column' }]}>
                            <Dropdown label="Area Group" icon="map-marker-outline" value={filterArea} options={allAreas} onChange={setFilterArea} />
                            <View style={{ flex: 1, gap: 6 }}>
                                <Text style={ddStyles.label}>Cari Engineer / Part</Text>
                                <Searchbar
                                    placeholder="Nama, ID, atau Part..."
                                    value={search}
                                    onChangeText={setSearch}
                                    style={styles.search}
                                    inputStyle={{ color: Colors.text, fontSize: 14 }}
                                    iconColor={Colors.primary}
                                    placeholderTextColor={Colors.textMuted}
                                    elevation={0}
                                />
                            </View>
                        </View>
                    </View>

                    {/* Area Group Cards */}
                    {filteredGroups.length === 0 ? (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="magnify-close" size={48} color={Colors.textMuted} />
                            <Text style={styles.emptyText}>Tidak ditemukan data yang cocok.</Text>
                        </View>
                    ) : (
                        filteredGroups.map(group => {
                            const isExpanded = expandedAreas.has(group.area);
                            return (
                                <View key={group.area} style={styles.areaCard}>
                                    {/* Area Header — clickable to expand */}
                                    <Pressable style={styles.areaHeader} onPress={() => toggleArea(group.area)}>
                                        <View style={styles.areaHeaderLeft}>
                                            <View style={[styles.areaIcon, { backgroundColor: Colors.primary + '15' }]}>
                                                <MaterialCommunityIcons name="map-marker" size={20} color={Colors.primary} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.areaName}>{group.area}</Text>
                                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                                    <View style={[styles.miniTag, { borderColor: Colors.info + '50' }]}>
                                                        <Text style={[styles.miniTagText, { color: Colors.info }]}>{group.engineerCount} Engineer</Text>
                                                    </View>
                                                    <View style={[styles.miniTag, { borderColor: Colors.accent + '50' }]}>
                                                        <Text style={[styles.miniTagText, { color: Colors.accent }]}>{group.totalParts} Part</Text>
                                                    </View>
                                                    <View style={[styles.miniTag, { borderColor: Colors.primary + '50' }]}>
                                                        <Text style={[styles.miniTagText, { color: Colors.primary }]}>Qty: {group.totalQty}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                        <MaterialCommunityIcons
                                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                            size={22} color={Colors.textSecondary}
                                        />
                                    </Pressable>

                                    {/* Expanded Engineer List */}
                                    {isExpanded && (
                                        <View style={styles.engineerList}>
                                            {group.engineers.map(eng => (
                                                <View key={eng.profile.id} style={styles.engineerRow}>
                                                    <View style={styles.engineerHeader}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                            <View style={[styles.engAvatar, eng.totalQty === 0 && { backgroundColor: Colors.danger + '20', borderColor: Colors.danger + '40' }]}>
                                                                <MaterialCommunityIcons
                                                                    name="account" size={16}
                                                                    color={eng.totalQty === 0 ? Colors.danger : Colors.primary}
                                                                />
                                                            </View>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.engName}>{eng.profile.name}</Text>
                                                                <Text style={styles.engId}>ID: {eng.profile.employee_id || '-'}</Text>
                                                            </View>
                                                        </View>
                                                        <View style={[styles.engQtyBadge, eng.totalQty === 0 && { backgroundColor: Colors.danger + '15', borderColor: Colors.danger + '40' }]}>
                                                            <Text style={[styles.engQtyText, eng.totalQty === 0 && { color: Colors.danger }]}>
                                                                {eng.totalQty === 0 ? 'Kosong' : `${eng.stocks.length}/${eng.stocks.length + eng.missingParts.length} Part`}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    {/* Dimiliki */}
                                                    {eng.stocks.length > 0 && (
                                                        <View style={{ gap: 6 }}>
                                                            <View style={styles.stockSectionLabel}>
                                                                <MaterialCommunityIcons name="check-circle" size={14} color={Colors.success} />
                                                                <Text style={[styles.stockSectionLabelText, { color: Colors.success }]}>Dimiliki ({eng.stocks.length})</Text>
                                                            </View>
                                                            <View style={styles.stockChipsRow}>
                                                                {eng.stocks.map((s, idx) => (
                                                                    <View key={idx} style={[styles.stockChip, { borderColor: Colors.success + '30' }]}>
                                                                        <Text style={styles.stockChipText}>
                                                                            <Text style={{ fontWeight: '800', color: Colors.text }}>{s.part_id}</Text>
                                                                            {' '}<Text style={{ fontWeight: '800', color: Colors.primary }}>x{s.quantity}</Text>
                                                                        </Text>
                                                                    </View>
                                                                ))}
                                                            </View>
                                                        </View>
                                                    )}

                                                    {/* Tidak Dimiliki */}
                                                    {eng.missingParts.length > 0 && (
                                                        <View style={{ gap: 6 }}>
                                                            <View style={styles.stockSectionLabel}>
                                                                <MaterialCommunityIcons name="close-circle" size={14} color={Colors.danger} />
                                                                <Text style={[styles.stockSectionLabelText, { color: Colors.danger }]}>Tidak Dimiliki ({eng.missingParts.length})</Text>
                                                            </View>
                                                            <View style={styles.stockChipsRow}>
                                                                {eng.missingParts.map((s, idx) => (
                                                                    <View key={idx} style={[styles.stockChip, { borderColor: Colors.danger + '30', backgroundColor: Colors.danger + '08' }]}>
                                                                        <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.danger + 'CC' }}>{s.part_id}</Text>
                                                                    </View>
                                                                ))}
                                                            </View>
                                                        </View>
                                                    )}
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    )}
                </View>
            )}

            {/* ═══ Delivery Tab ═══ */}
            {tab === 'pengiriman' && (
                <View style={styles.listContainer}>
                    {deliveries.length === 0 ? (
                        <Text style={{ textAlign: 'center', color: Colors.textMuted, marginTop: 20 }}>No deliveries found.</Text>
                    ) : (
                        deliveries.map((d, i) => (
                            <View key={i} style={adminStyles.card}>
                                <View style={adminStyles.cardHeader}>
                                    <View style={styles.logIconInfo}>
                                        <View style={[adminStyles.iconBox, { backgroundColor: Colors.primary + '15' }]}>
                                            <MaterialCommunityIcons name="truck-delivery-outline" size={20} color={Colors.primary} />
                                        </View>
                                        <View>
                                            <Text style={styles.logTitle}>{(d.engineer as any)?.name || 'Unknown'}</Text>
                                            <Text style={styles.logTime}>{d.delivered_at ? new Date(d.delivered_at).toLocaleDateString() : '-'} • {d.delivered_at ? new Date(d.delivered_at).toLocaleTimeString() : '-'}</Text>
                                        </View>
                                    </View>
                                    <Chip textStyle={{ fontSize: 10, fontWeight: '700' }} style={{ height: 24 }}>{(d.items as any[])?.length || 0} Items</Chip>
                                </View>
                                <View style={adminStyles.cardBody}>
                                    <View style={styles.listItems}>
                                        {((d.items || []) as any[]).map((item: any, idx: number) => (
                                            <View key={idx} style={styles.itemChip}>
                                                <Text style={styles.itemText}>{item.partId} <Text style={{ fontWeight: '700' }}>x{item.quantity}</Text></Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        ))
                    )}
                </View>
            )}

            {/* ═══ Logs Tab ═══ */}
            {tab === 'koreksi' && (
                <View style={styles.listContainer}>
                    {adjustments.length === 0 ? (
                        <Text style={{ textAlign: 'center', color: Colors.textMuted, marginTop: 20 }}>No adjustments found.</Text>
                    ) : (
                        adjustments.map((log, i) => (
                            <View key={i} style={adminStyles.card}>
                                <View style={adminStyles.cardHeader}>
                                    <View style={styles.logIconInfo}>
                                        <View style={[adminStyles.iconBox, { backgroundColor: Colors.accent + '15' }]}>
                                            <MaterialCommunityIcons name="file-document-edit-outline" size={20} color={Colors.accent} />
                                        </View>
                                        <View>
                                            <Text style={styles.logTitle}>{log.part_name} ({log.part_id})</Text>
                                            <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleDateString()} • {(log.engineer_name || 'Admin')}</Text>
                                        </View>
                                    </View>
                                    <Text style={{ fontWeight: '700', fontSize: 16, color: log.delta >= 0 ? Colors.success : Colors.danger }}>
                                        {log.delta >= 0 ? '+' : ''}{log.delta}
                                    </Text>
                                </View>

                                {(log.reason || log.notes) && (
                                    <View style={[adminStyles.cardBody, { marginBottom: 0, paddingBottom: 0 }]}>
                                        <Text style={styles.notes}>"{log.reason || log.notes}"</Text>
                                    </View>
                                )}

                                <View style={[adminStyles.cardFooter, { marginTop: 8 }]}>
                                    <View style={styles.metaRow}>
                                        <Text style={styles.metaLabel}>Before: <Text style={styles.metaValue}>{log.previous_quantity}</Text></Text>
                                        <MaterialCommunityIcons name="arrow-right" size={14} color={Colors.textMuted} style={{ marginHorizontal: 8 }} />
                                        <Text style={styles.metaLabel}>After: <Text style={styles.metaValue}>{log.new_quantity}</Text></Text>
                                    </View>
                                </View>
                            </View>
                        ))
                    )}
                </View>
            )}
            </ScrollView>
            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3200} style={{ backgroundColor: Colors.danger }}>
                {error}
            </AppSnackbar>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 20 },
    title: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    sub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

    tabContainer: { marginBottom: 20 },
    segmentedBtn: { borderRadius: 12 },

    monitorControlCard: { padding: 14, gap: 12 },
    monitorControlHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    monitorSectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
    monitorSectionHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
    monitorUpdatedAt: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
    monitorWindowChipRow: { gap: 8 },
    monitorWindowChip: { backgroundColor: Colors.surface, borderColor: Colors.border },
    monitorWindowChipActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary + '50' },
    monitorWindowChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
    monitorWindowChipTextActive: { color: Colors.primary, fontWeight: '700' },

    // Summary stats
    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: {
        flex: 1, minWidth: 140, backgroundColor: Colors.card, paddingVertical: 14, paddingHorizontal: 12,
        borderRadius: 12, borderWidth: 1, gap: 6,
    },
    statIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    statVal: { fontSize: 24, fontWeight: '800', color: Colors.text },
    statLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
    monitorCoverageCard: { padding: 14, gap: 12 },

    monitorEmptyText: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },

    alertList: { gap: 8 },
    alertCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        borderRadius: 10,
        borderWidth: 1,
        backgroundColor: Colors.surface,
        padding: 10,
    },
    alertIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    alertTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
    alertDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },

    riskTable: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
        marginTop: 6,
    },
    riskHeaderRow: { backgroundColor: Colors.surface },
    riskRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        minHeight: 48,
    },
    riskCell: {
        paddingHorizontal: 8,
        paddingVertical: 8,
        color: Colors.text,
        fontSize: 12,
        fontWeight: '600',
    },
    riskCellPart: { flex: 1.8 },
    riskCellSm: { flex: 0.7, textAlign: 'center' },
    riskCellMd: { flex: 0.9, textAlign: 'center' },
    riskPartName: { fontSize: 12, fontWeight: '700', color: Colors.text },
    riskPartId: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },

    // Filter
    filterRow: { flexDirection: 'row', gap: 12 },
    search: {
        backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
        height: 46, elevation: 0,
    },

    // Area cards
    areaCard: {
        backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
        overflow: 'hidden',
    },
    areaHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 14, gap: 10,
    },
    areaHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    areaIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    areaName: { fontSize: 16, fontWeight: '800', color: Colors.text, textTransform: 'uppercase' },
    miniTag: {
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
        borderWidth: 1, backgroundColor: 'transparent',
    },
    miniTagText: { fontSize: 11, fontWeight: '700' },

    // Engineer list
    engineerList: {
        borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 10, paddingVertical: 8, gap: 6,
    },
    engineerRow: {
        backgroundColor: Colors.surface, borderRadius: 10, padding: 12, gap: 8,
    },
    engineerHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    engAvatar: {
        width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.primary + '15',
        borderWidth: 1, borderColor: Colors.primary + '30',
        justifyContent: 'center', alignItems: 'center',
    },
    engName: { fontSize: 13, fontWeight: '700', color: Colors.text },
    engId: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
    engQtyBadge: {
        backgroundColor: Colors.primary + '15', paddingHorizontal: 10, paddingVertical: 4,
        borderRadius: 8, borderWidth: 1, borderColor: Colors.primary + '30',
    },
    engQtyText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

    // Stock chips
    stockChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    stockChip: {
        backgroundColor: Colors.card, paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 6, borderWidth: 1, borderColor: Colors.border,
    },
    stockChipText: { fontSize: 11 },

    // Stock section labels
    stockSectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    stockSectionLabelText: { fontSize: 11, fontWeight: '700' },

    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
    emptyText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },

    // List styles (Delivery & Logs)
    listContainer: { gap: 12 },
    logIconInfo: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    logTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
    logTime: { fontSize: 12, color: Colors.textSecondary },
    listItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    itemChip: { backgroundColor: Colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: Colors.border },
    itemText: { fontSize: 12, color: Colors.textSecondary },
    notes: { fontSize: 12, fontStyle: 'italic', color: Colors.textMuted },
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    metaLabel: { fontSize: 12, color: Colors.textMuted },
    metaValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
});
