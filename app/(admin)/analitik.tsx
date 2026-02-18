import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, useWindowDimensions, Platform, UIManager, Share } from 'react-native';
import { Text, Button, Chip } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from 'react-native-chart-kit';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import { supabase } from '../../src/config/supabase';
import { useSupabaseRealtimeRefresh } from '../../src/hooks/useSupabaseRealtimeRefresh';
import { adminStyles } from '../../src/styles/adminStyles';
import { useAdminUiStore, ADMIN_SIDEBAR_WIDTH, ADMIN_SIDEBAR_COLLAPSED_WIDTH } from '../../src/stores/adminUiStore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type UsageReportAnalyticsRow = {
    engineer_id: string | null;
    date: string | null;
    items: any;
};

type EngineerProfileRow = {
    id: string;
    name: string | null;
    employee_id: string | null;
};

type TopPartUsage = {
    part_id: string;
    part_name: string;
    total_used: number;
    report_count: number;
};

type TopEngineerUsage = {
    engineer_id: string;
    engineer_name: string;
    employee_id: string | null;
    total_used: number;
    report_count: number;
};

type RequestStatusSummary = {
    status: string;
    count: number;
};

type DailyPartSeries = {
    part_id: string;
    part_name: string;
    total_used: number;
    color: string;
    data: number[];
};

type DailyPartChartData = {
    dayKeys: string[];
    labels: string[];
    series: DailyPartSeries[];
};

type RankPalette = {
    badgeBg: string;
    badgeBorder: string;
    rankText: string;
    valueText: string;
};

const getRankPalette = (rank: number): RankPalette => {
    if (rank === 1) {
        return {
            badgeBg: '#F59E0B22',
            badgeBorder: '#F59E0B66',
            rankText: '#FBBF24',
            valueText: '#FBBF24',
        };
    }
    if (rank === 2) {
        return {
            badgeBg: '#94A3B822',
            badgeBorder: '#94A3B866',
            rankText: '#CBD5E1',
            valueText: '#CBD5E1',
        };
    }
    if (rank === 3) {
        return {
            badgeBg: '#B4530922',
            badgeBorder: '#B4530966',
            rankText: '#FDBA74',
            valueText: '#FDBA74',
        };
    }
    return {
        badgeBg: Colors.surface,
        badgeBorder: Colors.border,
        rankText: Colors.textMuted,
        valueText: Colors.primary,
    };
};

const parseUsageItems = (rawItems: any): { partId: string; partName: string; quantity: number }[] => {
    let items = rawItems;
    if (typeof items === 'string') {
        try {
            items = JSON.parse(items);
        } catch (e) {
            console.warn('Failed to parse usage items JSON:', e);
            return [];
        }
    }

    if (!Array.isArray(items)) return [];

    return items
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
        .filter(item => item.partId && item.quantity > 0);
};

const escapeCsvValue = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const CHART_FILTER_ALL = '__top__';
const CHART_DEFAULT_PART_LIMIT = 4;
const chartLineColors = ['#2DD4BF', '#60A5FA', '#F59E0B', '#F472B6', '#A78BFA', '#34D399', '#F97316', '#22D3EE'];
const REQUEST_STATUS_ORDER = ['pending', 'approved', 'delivered', 'completed', 'rejected', 'cancelled'] as const;
const REQUEST_STATUS_COLORS: Record<string, string> = {
    pending: Colors.accent,
    approved: Colors.info,
    delivered: Colors.primary,
    completed: Colors.success,
    rejected: Colors.danger,
    cancelled: Colors.textMuted,
};

const formatDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const buildDailyPartChart = (rows: UsageReportAnalyticsRow[], days = 14): DailyPartChartData => {
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(endDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (days - 1));

    const dayKeys: string[] = [];
    for (let i = 0; i < days; i += 1) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + i);
        dayKeys.push(formatDateKey(day));
    }

    const partTotals = new Map<string, number>();
    const partNameMap = new Map<string, string>();
    const dayPartTotals = new Map<string, number>();

    for (const row of rows) {
        if (!row.date) continue;
        const reportDate = new Date(row.date);
        if (!Number.isFinite(reportDate.getTime())) continue;
        if (reportDate < startDate || reportDate >= nextDay) continue;

        const dayKey = formatDateKey(reportDate);
        const items = parseUsageItems(row.items);

        for (const item of items) {
            partTotals.set(item.partId, (partTotals.get(item.partId) || 0) + item.quantity);
            if (!partNameMap.has(item.partId)) partNameMap.set(item.partId, item.partName || item.partId);

            const dayPartKey = `${dayKey}|${item.partId}`;
            dayPartTotals.set(dayPartKey, (dayPartTotals.get(dayPartKey) || 0) + item.quantity);
        }
    }

    const sortedPartIds = [...partTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([partId]) => partId);

    const series: DailyPartSeries[] = sortedPartIds.map((partId, idx) => ({
        part_id: partId,
        part_name: partNameMap.get(partId) || partId,
        total_used: partTotals.get(partId) || 0,
        color: chartLineColors[idx % chartLineColors.length],
        data: dayKeys.map(dayKey => dayPartTotals.get(`${dayKey}|${partId}`) || 0),
    }));

    return {
        dayKeys,
        labels: dayKeys.map(dayKey => String(Number(dayKey.slice(8)))),
        series,
    };
};

const hexToRgba = (hexColor: string, opacity: number): string => {
    const hex = hexColor.replace('#', '');
    if (hex.length !== 6) return `rgba(96, 165, 250, ${opacity})`;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const fetchRequestStatusSummary = async (): Promise<RequestStatusSummary[]> => {
    const countQueries = REQUEST_STATUS_ORDER.map((status) =>
        supabase
            .from('monthly_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', status)
    );

    const results = await Promise.all(countQueries);
    const failed = results.find((res) => res.error);
    if (failed?.error) throw failed.error;

    return REQUEST_STATUS_ORDER.map((status, idx) => ({
        status,
        count: results[idx].count || 0,
    }));
};

const buildTopPartsByUsage = (rows: UsageReportAnalyticsRow[]): TopPartUsage[] => {
    const usageMap = new Map<string, TopPartUsage>();

    for (const row of rows) {
        const items = parseUsageItems(row.items);
        const seenInReport = new Set<string>();

        for (const item of items) {
            const existing = usageMap.get(item.partId) || {
                part_id: item.partId,
                part_name: item.partName || item.partId,
                total_used: 0,
                report_count: 0,
            };

            existing.total_used += item.quantity;
            if (!seenInReport.has(item.partId)) {
                existing.report_count += 1;
                seenInReport.add(item.partId);
            }

            usageMap.set(item.partId, existing);
        }
    }

    return [...usageMap.values()]
        .sort((a, b) => b.total_used - a.total_used || b.report_count - a.report_count || a.part_name.localeCompare(b.part_name))
        .slice(0, 10);
};

const buildTopEngineerMonthlyUsage = (
    rows: UsageReportAnalyticsRow[],
    engineers: EngineerProfileRow[]
): TopEngineerUsage[] => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

    const engineerMeta = new Map(
        engineers.map(eng => [
            eng.id,
            {
                name: eng.name || 'Unknown Engineer',
                employeeId: eng.employee_id,
            },
        ])
    );

    const usageMap = new Map<string, TopEngineerUsage>();

    for (const row of rows) {
        if (!row.engineer_id || !row.date) continue;

        const reportTime = new Date(row.date).getTime();
        if (!Number.isFinite(reportTime) || reportTime < monthStart || reportTime >= nextMonthStart) continue;

        const items = parseUsageItems(row.items);
        const totalInReport = items.reduce((sum, item) => sum + item.quantity, 0);
        if (totalInReport <= 0) continue;

        const meta = engineerMeta.get(row.engineer_id);
        const existing = usageMap.get(row.engineer_id) || {
            engineer_id: row.engineer_id,
            engineer_name: meta?.name || 'Unknown Engineer',
            employee_id: meta?.employeeId || null,
            total_used: 0,
            report_count: 0,
        };

        existing.total_used += totalInReport;
        existing.report_count += 1;
        usageMap.set(row.engineer_id, existing);
    }

    return [...usageMap.values()]
        .sort((a, b) => b.total_used - a.total_used || b.report_count - a.report_count || a.engineer_name.localeCompare(b.engineer_name))
        .slice(0, 10);
};

type AnalitikData = {
    requestStatus: RequestStatusSummary[];
    engineers: EngineerProfileRow[];
    usageRows: UsageReportAnalyticsRow[];
};

const fetchAnalitikData = async (): Promise<AnalitikData> => {
    const [statusSummary, usageRowsRes, engineersRes] = await Promise.all([
        fetchRequestStatusSummary(),
        supabase.from('usage_reports').select('*').order('date', { ascending: false }),
        supabase.from('profiles').select('id, name, employee_id').eq('role', 'engineer'),
    ]);

    if (usageRowsRes.error) throw usageRowsRes.error;
    if (engineersRes.error) throw engineersRes.error;

    const rawUsageRows = Array.isArray(usageRowsRes.data) ? usageRowsRes.data : [];
    const mappedUsageRows: UsageReportAnalyticsRow[] = rawUsageRows.map((r: any) => ({
        engineer_id: r.engineer_id,
        items: r.items,
        date: r.date || r.created_at || null,
    }));
    const engineers = Array.isArray(engineersRes.data) ? (engineersRes.data as EngineerProfileRow[]) : [];

    return {
        requestStatus: statusSummary,
        engineers,
        usageRows: mappedUsageRows,
    };
};

export default function AnalitikPage() {
    const { width } = useWindowDimensions();
    const [refreshing, setRefreshing] = useState(false);
    const [chartPartFilter, setChartPartFilter] = useState<string>(CHART_FILTER_ALL);
    const [exportingCsv, setExportingCsv] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const analitikQuery = useQuery({
        queryKey: ['admin', 'analitik'],
        queryFn: fetchAnalitikData,
    });
    const requestStatus = analitikQuery.data?.requestStatus || [];
    const engineers = analitikQuery.data?.engineers || [];
    const usageRows = analitikQuery.data?.usageRows || [];
    const topUsage = useMemo(() => buildTopPartsByUsage(usageRows), [usageRows]);
    const topEngineersMonthly = useMemo(
        () => buildTopEngineerMonthlyUsage(usageRows, engineers),
        [usageRows, engineers],
    );

    const isWide = width >= 768;
    const sidebarOpen = useAdminUiStore((state) => state.sidebarOpen);
    const sidebarWidth = isWide ? (sidebarOpen ? ADMIN_SIDEBAR_WIDTH : ADMIN_SIDEBAR_COLLAPSED_WIDTH) : 0;
    const effectiveWidth = width - sidebarWidth;
    const currentMonthLabel = useMemo(
        () => new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
        []
    );
    const totalRequestStatusCount = useMemo(
        () => requestStatus.reduce((sum, row) => sum + row.count, 0),
        [requestStatus]
    );

    useEffect(() => {
        if (!analitikQuery.error) return;
        const message = analitikQuery.error instanceof Error ? analitikQuery.error.message : 'Terjadi kesalahan saat memuat data.';
        setError(message);
    }, [analitikQuery.error]);

    useSupabaseRealtimeRefresh(
        ['usage_reports', 'monthly_requests', 'profiles'],
        () => {
            void analitikQuery.refetch();
        },
    );

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await analitikQuery.refetch();
        } finally {
            setRefreshing(false);
        }
    };

    const dailyPartChart = useMemo(() => buildDailyPartChart(usageRows, 14), [usageRows]);
    const topChartParts = useMemo(() => dailyPartChart.series.slice(0, CHART_DEFAULT_PART_LIMIT), [dailyPartChart]);
    const chartPartOptions = useMemo(() => dailyPartChart.series.slice(0, 8), [dailyPartChart]);
    const activeChartSeries = useMemo(() => {
        if (chartPartFilter === CHART_FILTER_ALL) return topChartParts;

        const picked = dailyPartChart.series.find(part => part.part_id === chartPartFilter);
        return picked ? [picked] : topChartParts;
    }, [chartPartFilter, dailyPartChart, topChartParts]);
    const chartWidth = useMemo(() => Math.max(300, effectiveWidth - 64), [effectiveWidth]);
    const chartConfig = useMemo(() => ({
        backgroundColor: Colors.card,
        backgroundGradientFrom: Colors.card,
        backgroundGradientTo: Colors.card,
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
        labelColor: (opacity = 1) => Colors.textSecondary,
        useShadowColorFromDataset: true,
        style: { borderRadius: 16 },
        propsForDots: { r: '4', strokeWidth: '1', stroke: Colors.card },
    }), []);

    useEffect(() => {
        if (chartPartFilter === CHART_FILTER_ALL) return;
        const stillExists = dailyPartChart.series.some(part => part.part_id === chartPartFilter);
        if (!stillExists) setChartPartFilter(CHART_FILTER_ALL);
    }, [chartPartFilter, dailyPartChart]);

    const chartData = useMemo(() => {
        if (!activeChartSeries.length) return null;
        return {
            labels: dailyPartChart.labels,
            datasets: activeChartSeries.map((part, idx) => ({
                data: part.data,
                color: (opacity = 1) => hexToRgba(part.color, opacity),
                strokeWidth: idx === 0 ? 3 : 2,
            })),
        };
    }, [dailyPartChart, activeChartSeries]);

    const exportCsv = useCallback(async () => {
        if (exportingCsv) return;

        setExportingCsv(true);
        setError('');
        setSuccess('');
        try {
            const now = new Date();
            const pad = (val: number) => String(val).padStart(2, '0');
            const fileStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            const fileName = `analytics_detail_${fileStamp}.csv`;

            const engineerLookup = new Map(
                engineers.map((eng) => [
                    eng.id,
                    {
                        name: eng.name || 'Unknown Engineer',
                        employeeId: eng.employee_id || '',
                    },
                ])
            );

            const totalUsedQty = usageRows.reduce((sum, row) => {
                const totalInReport = parseUsageItems(row.items).reduce((acc, item) => acc + item.quantity, 0);
                return sum + totalInReport;
            }, 0);

            const usageDetailRows: Array<Array<string | number>> = [];
            usageRows.forEach((row, reportIdx) => {
                const items = parseUsageItems(row.items);
                const meta = row.engineer_id ? engineerLookup.get(row.engineer_id) : null;
                const reportDate = row.date && Number.isFinite(new Date(row.date).getTime())
                    ? new Date(row.date).toLocaleString('id-ID')
                    : (row.date || '-');
                const engineerId = row.engineer_id || '-';
                const engineerName = meta?.name || 'Unknown Engineer';
                const employeeId = meta?.employeeId || '-';

                if (items.length === 0) {
                    usageDetailRows.push([
                        reportIdx + 1,
                        reportDate,
                        engineerId,
                        engineerName,
                        employeeId,
                        '-',
                        '-',
                        0,
                    ]);
                    return;
                }

                items.forEach((item, itemIdx) => {
                    usageDetailRows.push([
                        `${reportIdx + 1}.${itemIdx + 1}`,
                        reportDate,
                        engineerId,
                        engineerName,
                        employeeId,
                        item.partId,
                        item.partName,
                        item.quantity,
                    ]);
                });
            });

            const trendRows: Array<Array<string | number>> = [];
            dailyPartChart.dayKeys.forEach((dayKey, dayIndex) => {
                dailyPartChart.series.forEach((series) => {
                    const qty = series.data[dayIndex] || 0;
                    if (qty <= 0) return;
                    trendRows.push([
                        dayKey,
                        series.part_id,
                        series.part_name,
                        qty,
                    ]);
                });
            });

            const csvLines: string[] = [];
            const pushRow = (row: Array<string | number | null | undefined>) => {
                csvLines.push(row.map((cell) => escapeCsvValue(cell)).join(','));
            };
            const pushSection = (
                title: string,
                headers: string[],
                rows: Array<Array<string | number | null | undefined>>
            ) => {
                pushRow([title]);
                pushRow(headers);
                if (rows.length === 0) {
                    pushRow(['(tidak ada data)']);
                } else {
                    rows.forEach(pushRow);
                }
                csvLines.push('');
            };

            pushSection('SECTION: RINGKASAN ANALITIK', ['Metric', 'Value'], [
                ['Generated At', now.toLocaleString('id-ID')],
                ['Total Request', totalRequestStatusCount],
                ['Total Usage Reports', usageRows.length],
                ['Total Qty Used', totalUsedQty],
                ['Top Part Count', topUsage.length],
                ['Top Engineer Bulanan Count', topEngineersMonthly.length],
                ['Trend Window (Days)', dailyPartChart.dayKeys.length],
                ['Trend Range', dailyPartChart.dayKeys.length > 0 ? `${dailyPartChart.dayKeys[0]} s/d ${dailyPartChart.dayKeys[dailyPartChart.dayKeys.length - 1]}` : '-'],
            ]);

            pushSection(
                'SECTION: STATUS REQUEST',
                ['No', 'Status', 'Count', 'Percentage'],
                requestStatus.map((row, idx) => {
                    const percentage = totalRequestStatusCount > 0
                        ? Number(((row.count / totalRequestStatusCount) * 100).toFixed(1))
                        : 0;
                    return [idx + 1, row.status, row.count, `${percentage}%`];
                })
            );

            pushSection(
                'SECTION: TOP ENGINEER BULANAN',
                ['Rank', 'Engineer ID', 'Engineer Name', 'Employee ID', 'Total Used', 'Laporan'],
                topEngineersMonthly.map((eng, idx) => ([
                    idx + 1,
                    eng.engineer_id,
                    eng.engineer_name,
                    eng.employee_id || '-',
                    eng.total_used,
                    eng.report_count,
                ]))
            );

            pushSection(
                'SECTION: TOP PARTS BY USAGE',
                ['Rank', 'Part ID', 'Part Name', 'Total Used', 'Dipakai di Berapa Laporan'],
                topUsage.map((part, idx) => ([
                    idx + 1,
                    part.part_id,
                    part.part_name,
                    part.total_used,
                    part.report_count,
                ]))
            );

            pushSection(
                'SECTION: TREND HARIAN PART (14 HARI)',
                ['Date', 'Part ID', 'Part Name', 'Qty Used'],
                trendRows
            );

            pushSection(
                'SECTION: DETAIL PEMAKAIAN PER LAPORAN',
                ['No', 'Report Date', 'Engineer ID', 'Engineer Name', 'Employee ID', 'Part ID', 'Part Name', 'Qty'],
                usageDetailRows
            );

            const csvContent = '\uFEFF' + csvLines.join('\n');

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
                setSuccess(`CSV detail berhasil diunduh (${usageDetailRows.length} baris detail).`);
                return;
            }

            await Share.share({
                title: 'Export Analytics Detail CSV',
                message: csvContent,
            });
            setSuccess(`CSV detail siap dibagikan (${usageDetailRows.length} baris detail).`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Gagal export CSV.';
            setError(message);
        } finally {
            setExportingCsv(false);
        }
    }, [dailyPartChart, engineers, exportingCsv, requestStatus, topEngineersMonthly, topUsage, totalRequestStatusCount, usageRows]);

    return (
        <ScrollView
            style={adminStyles.container}
            indicatorStyle="black"
            contentContainerStyle={adminStyles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
            <View style={adminStyles.header}>
                <View>
                    <Text style={adminStyles.headerTitle}>Analytics</Text>
                    <Text style={adminStyles.headerSub}>Performance metrics & insights</Text>
                </View>
                <View style={styles.headerActions}>
                    <Button
                        icon="download"
                        mode="contained-tonal"
                        onPress={exportCsv}
                        loading={exportingCsv}
                        disabled={exportingCsv}
                        compact
                        labelStyle={styles.exportLabel}
                        style={styles.exportBtn}
                    >
                        Export CSV
                    </Button>
                    <Button icon="refresh" mode="text" onPress={onRefresh} textColor={Colors.primary}>
                        Refresh
                    </Button>
                </View>
            </View>

            {/* Request Status Distribution */}
            {requestStatus && requestStatus.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Request Status</Text>
                    <View style={styles.statusGrid}>
                        {requestStatus.map((s) => {
                            const color = REQUEST_STATUS_COLORS[s.status] || Colors.textMuted;
                            const percentage = totalRequestStatusCount > 0
                                ? Number(((s.count / totalRequestStatusCount) * 100).toFixed(1))
                                : 0;
                            return (
                                <View
                                    key={s.status}
                                    style={[
                                        styles.statusCard,
                                        isWide ? styles.statusCardHalf : styles.statusCardFull,
                                        { borderColor: hexToRgba(color, 0.35) },
                                    ]}
                                >
                                    <View style={[styles.statusDot, { backgroundColor: color }]} />
                                    <View style={styles.statusContent}>
                                        <Text style={styles.statusName}>{s.status}</Text>
                                        <View style={styles.statusValueRow}>
                                            <Text style={[styles.statusVal, { color }]}>{s.count} requests</Text>
                                            <View style={[styles.statusPill, { backgroundColor: hexToRgba(color, 0.16), borderColor: hexToRgba(color, 0.35) }]}>
                                                <Text style={[styles.statusPillText, { color }]}>{percentage}%</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>
            )}

            {/* Chart */}
            <View style={adminStyles.card}>
                <Text style={styles.chartTitle}>Daily Part Used (Last 14 Days)</Text>
                <Text style={styles.chartHint}>
                    {chartPartFilter === CHART_FILTER_ALL
                        ? 'Mode: Top 4 part paling sering dipakai (pin mengikuti warna tiap part)'
                        : 'Mode: Fokus 1 part terpilih (pin mengikuti warna part)'}
                </Text>
                {chartData ? (
                    <>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartChipList}>
                            <Chip
                                mode={chartPartFilter === CHART_FILTER_ALL ? 'flat' : 'outlined'}
                                selected={chartPartFilter === CHART_FILTER_ALL}
                                onPress={() => setChartPartFilter(CHART_FILTER_ALL)}
                                style={[
                                    styles.chartChip,
                                    chartPartFilter === CHART_FILTER_ALL && styles.chartChipActive,
                                ]}
                                textStyle={[
                                    styles.chartChipText,
                                    chartPartFilter === CHART_FILTER_ALL && styles.chartChipTextActive,
                                ]}
                            >
                                Top 4 Part
                            </Chip>
                            {chartPartOptions.map(part => {
                                const isActive = chartPartFilter === part.part_id;
                                return (
                                    <Chip
                                        key={part.part_id}
                                        mode={isActive ? 'flat' : 'outlined'}
                                        selected={isActive}
                                        onPress={() => setChartPartFilter(part.part_id)}
                                        style={[
                                            styles.chartChip,
                                            isActive && [styles.chartChipActive, { borderColor: part.color, backgroundColor: hexToRgba(part.color, 0.18) }],
                                        ]}
                                        textStyle={[
                                            styles.chartChipText,
                                            isActive && [styles.chartChipTextActive, { color: part.color }],
                                        ]}
                                    >
                                        {part.part_name}
                                    </Chip>
                                );
                            })}
                        </ScrollView>

                        <LineChart
                            data={chartData}
                            width={chartWidth}
                            height={220}
                            withDots
                            chartConfig={chartConfig}
                            bezier
                            style={{ marginVertical: 8, borderRadius: 16 }}
                        />

                        <View style={styles.chartLegend}>
                            {activeChartSeries.map(part => (
                                <View key={part.part_id} style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: part.color }]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.legendName} numberOfLines={1}>{part.part_name}</Text>
                                        <Text style={styles.legendMeta}>{part.total_used} pcs / 14 hari</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </>
                ) : (
                    <Text style={{ textAlign: 'center', margin: 20, color: Colors.textMuted }}>Belum ada data pemakaian part 14 hari terakhir.</Text>
                )}
            </View>

            <View style={[styles.rankingGrid, { marginTop: 24 }, !isWide && styles.rankingGridStack]}>
                <View style={[styles.rankingSection, isWide ? styles.rankingSectionHalf : styles.rankingSectionStack]}>
                    <View style={styles.rankingHeader}>
                        <Text style={styles.sectionTitle}>Top Engineer Rajin Bulanan</Text>
                        <Text style={styles.sectionHint}>Berdasarkan total pemakaian baby part ({currentMonthLabel})</Text>
                    </View>
                    <View style={styles.topList}>
                        {topEngineersMonthly.length === 0 ? (
                            <View style={[adminStyles.card, styles.topCard]}>
                                <Text style={styles.emptyText}>Belum ada data pemakaian engineer bulan ini.</Text>
                            </View>
                        ) : (
                            topEngineersMonthly.map((eng, i) => {
                                const rank = i + 1;
                                const rankPalette = getRankPalette(rank);
                                return (
                                    <View key={eng.engineer_id} style={[adminStyles.card, styles.topCard]}>
                                        <View style={adminStyles.cardHeader}>
                                            <View style={styles.topIdentity}>
                                                <View style={[styles.rankBadge, { backgroundColor: rankPalette.badgeBg, borderColor: rankPalette.badgeBorder }]}>
                                                    <Text style={[styles.rankText, { color: rankPalette.rankText }]} numberOfLines={1}>
                                                        #{rank}
                                                    </Text>
                                                </View>
                                                <View>
                                                    <Text style={styles.topName}>{eng.engineer_name}</Text>
                                                    <Text style={styles.topId}>{eng.employee_id ? `ID: ${eng.employee_id}` : eng.engineer_id}</Text>
                                                </View>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={[styles.topVal, { color: rankPalette.valueText }]}>{eng.total_used}</Text>
                                                <Text style={styles.topLabel}>pcs used</Text>
                                                <Text style={styles.topMeta}>{eng.report_count} laporan</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>
                </View>

                <View style={[styles.rankingSection, isWide ? styles.rankingSectionHalf : styles.rankingSectionStack]}>
                    <View style={styles.rankingHeader}>
                        <Text style={styles.sectionTitle}>Top Parts by Usage</Text>
                        <Text style={styles.sectionHint}>Akumulasi total pemakaian baby part</Text>
                    </View>
                    <View style={styles.topList}>
                        {topUsage.length === 0 ? (
                            <View style={[adminStyles.card, styles.topCard]}>
                                <Text style={styles.emptyText}>Belum ada data pemakaian part.</Text>
                            </View>
                        ) : (
                            topUsage.map((p, i) => {
                                const rank = i + 1;
                                const rankPalette = getRankPalette(rank);
                                return (
                                    <View key={p.part_id} style={[adminStyles.card, styles.topCard]}>
                                        <View style={adminStyles.cardHeader}>
                                            <View style={styles.topIdentity}>
                                                <View style={[styles.rankBadge, { backgroundColor: rankPalette.badgeBg, borderColor: rankPalette.badgeBorder }]}>
                                                    <Text style={[styles.rankText, { color: rankPalette.rankText }]} numberOfLines={1}>
                                                        #{rank}
                                                    </Text>
                                                </View>
                                                <View>
                                                    <Text style={styles.topName}>{p.part_name || 'Unknown Part'}</Text>
                                                    <Text style={styles.topId}>{p.part_id}</Text>
                                                </View>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={[styles.topVal, { color: rankPalette.valueText }]}>{p.total_used}</Text>
                                                <Text style={styles.topLabel}>pcs used</Text>
                                                <Text style={styles.topMeta}>{p.report_count} laporan</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>
                </View>
            </View>

            <AppSnackbar
                visible={!!error}
                onDismiss={() => setError('')}
                duration={3600}
                action={{ label: 'Tutup', onPress: () => setError('') }}
            >
                {error}
            </AppSnackbar>

            <AppSnackbar
                visible={!!success}
                onDismiss={() => setSuccess('')}
                duration={3000}
                action={{ label: 'OK', onPress: () => setSuccess('') }}
            >
                {success}
            </AppSnackbar>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    exportBtn: { borderColor: Colors.primary + '44' },
    exportLabel: { fontSize: 12, fontWeight: '700' },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 12 },
    sectionHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

    rankingGrid: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    rankingGridStack: { flexDirection: 'column' },
    rankingSection: { minWidth: 0 },
    rankingSectionHalf: { flex: 1, width: '49%' },
    rankingSectionStack: { width: '100%', flexGrow: 0, flexShrink: 0 },
    rankingHeader: { minHeight: 56, marginBottom: 12 },

    statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
    statusCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: Colors.card,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    statusCardHalf: { width: '48.8%' },
    statusCardFull: { width: '100%' },
    statusContent: { flex: 1, gap: 6 },
    statusValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    statusDot: { width: 8, height: 40, borderRadius: 999 },
    statusName: { fontSize: 11, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: '700' },
    statusVal: { fontSize: 29, fontWeight: '800', marginTop: 1 },
    statusPill: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    statusPillText: { fontSize: 11, fontWeight: '700' },

    chartTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 2 },
    chartHint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
    chartChipList: { gap: 8, paddingBottom: 8, paddingTop: 2 },
    chartChip: { backgroundColor: Colors.surface, borderColor: Colors.border },
    chartChipActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary + '55' },
    chartChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
    chartChipTextActive: { color: Colors.primary, fontWeight: '700' },
    chartLegend: { marginTop: 8, gap: 8 },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    legendDot: { width: 10, height: 10, borderRadius: 999 },
    legendName: { fontSize: 13, fontWeight: '700', color: Colors.text },
    legendMeta: { fontSize: 11, color: Colors.textSecondary },

    topList: { gap: 12 },
    topCard: { width: '100%' },
    topIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 },
    rankBadge: {
        minWidth: 42,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rankText: { fontSize: 24, fontWeight: '900', lineHeight: 24 },
    emptyText: { textAlign: 'center', color: Colors.textMuted, fontSize: 13 },
    topName: { fontSize: 14, fontWeight: '700', color: Colors.text, flexWrap: 'wrap', maxWidth: 220 },
    topId: { fontSize: 12, color: Colors.textSecondary },
    topVal: { fontSize: 16, fontWeight: '800', color: Colors.primary },
    topLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase' },
    topMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});
