import { StyleSheet } from 'react-native';
import { Colors } from '../config/theme';

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pageTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600', color: Colors.text },
    sectionTitle: { fontSize: 24, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 16 },

    // Stats Cards
    stats: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#111827', borderRadius: 16, padding: 12,
        borderWidth: 1, borderColor: Colors.border
    },
    statIcon: {
        width: 36, height: 36, borderRadius: 10,
        justifyContent: 'center', alignItems: 'center'
    },
    statValue: { fontSize: 18, fontWeight: '700', color: Colors.primary },
    statLabel: { fontSize: 12, color: Colors.textSecondary },

    // Filters
    filters: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    filterPill: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#1F2937', paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1, borderColor: '#374151'
    },
    filterPillActive: { backgroundColor: '#1F2937', borderColor: Colors.primary },
    filterText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
    filterTextActive: { color: Colors.primary, fontWeight: '600' },

    // Card
    card: { backgroundColor: '#111827', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#1F2937' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    dateIcon: {
        width: 38, height: 38, borderRadius: 11,
        backgroundColor: '#0D3D30', justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: Colors.primary
    },
    dateDay: { fontSize: 14, fontWeight: '700', color: Colors.text },
    dateTime: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    statusBadge: {
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10,
        borderWidth: 1
    },
    statusText: { fontSize: 11, fontWeight: '600' },

    // Info Row
    infoRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    infoBox: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#0D3D30', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
        borderWidth: 1, borderColor: Colors.primary + '40'
    },
    infoBoxValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
    infoBoxLabel: { fontSize: 10, color: Colors.textMuted },

    // Items
    itemsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    itemChip: { backgroundColor: '#1F2937', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14 },
    itemText: { fontSize: 11, color: Colors.textSecondary },

    // Actions
    actionRow: { flexDirection: 'row', gap: 8 },
    btnCancel: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: Colors.textSecondary
    },
    btnCancelText: { color: Colors.text, fontWeight: '600', fontSize: 13 },
    btnEdit: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: '#2F4F4F', borderRadius: 18, paddingVertical: 10
    },
    btnEditText: { color: '#FFF', fontWeight: '600', fontSize: 13 },

    fab: { position: 'absolute', bottom: 16, right: 16, backgroundColor: Colors.primary, borderRadius: 16 },
    empty: { alignItems: 'center', marginTop: 40, gap: 12 },
    emptyText: { color: Colors.textMuted },

    fullScreenModal: {
        backgroundColor: Colors.bg,
        flex: 1,
        margin: 0,
    },
    createRoot: {
        flex: 1,
        backgroundColor: '#030A0E',
    },
    createHeader: {
        height: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
    },
    createHeaderTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text,
    },
    headerSpacer: { width: 48 },
    createBody: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 4,
    },
    sectionBlock: {
        marginBottom: 12,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    createSectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    inputHint: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    periodInput: {
        height: 52,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#26343A',
        paddingHorizontal: 16,
        justifyContent: 'center',
        backgroundColor: '#061015',
    },
    periodInputText: {
        fontSize: 16,
        color: Colors.text,
        fontWeight: '500',
    },
    sectionDivider: {
        height: 1,
        backgroundColor: '#17252C',
        marginVertical: 14,
    },
    itemsHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    addButton: {
        height: 50,
        minWidth: 124,
        borderRadius: 14,
        backgroundColor: '#304047',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 14,
    },
    addButtonText: {
        fontSize: 14,
        color: Colors.text,
        fontWeight: '600',
    },
    emptyItemsCard: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#1A2A31',
        backgroundColor: '#111E24',
        minHeight: 130,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 20,
    },
    emptyItemsText: {
        color: Colors.textSecondary,
        fontSize: 14,
    },
    selectedItemsList: {
        flex: 1,
    },
    selectedItemsContent: {
        gap: 8,
        paddingBottom: 6,
    },
    selectedItemCard: {
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
    selectedItemIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#0A2624',
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectedItemName: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text,
    },
    selectedItemQty: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginTop: 1,
    },
    deleteItemButton: {
        width: 30,
        height: 28,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.danger + '45',
        backgroundColor: Colors.danger + '12',
        alignItems: 'center',
        justifyContent: 'center',
    },
    createFooter: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    sendButton: {
        height: 54,
        borderRadius: 16,
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    sendButtonText: {
        color: Colors.bg,
        fontSize: 15,
        fontWeight: '700',
    },
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
        fontSize: 17,
        fontWeight: '700',
        color: Colors.text,
        textAlign: 'center',
        marginBottom: 10,
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
        fontSize: 13,
        color: Colors.text,
    },
    partListContent: {
        paddingBottom: 24,
        gap: 8,
    },
    partRow: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#242A36',
        backgroundColor: '#10131A',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 10,
    },
    partRowIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0D2D2A',
    },
    partRowName: {
        fontSize: 15,
        color: Colors.text,
        fontWeight: '700',
    },
    partRowId: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    emptyPartState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        gap: 8,
    },
    emptyPartText: {
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
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1D2029',
        alignItems: 'center',
        justifyContent: 'center',
    },
    qtyLabel: {
        fontSize: 14,
        color: Colors.text,
        fontWeight: '600',
    },
    qtyPartName: {
        fontSize: 15,
        color: Colors.text,
        fontWeight: '700',
        marginTop: 2,
    },
    qtyPill: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#393D48',
        backgroundColor: '#1B1F28',
        minHeight: 66,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
    },
    qtyActionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#0F171C',
        alignItems: 'center',
        justifyContent: 'center',
    },
    qtyActionButtonDisabled: {
        backgroundColor: '#171B23',
    },
    qtyValue: {
        fontSize: 38,
        color: Colors.primary,
        fontWeight: '700',
        minWidth: 64,
        textAlign: 'center',
    },
    qtyLimitText: {
        fontSize: 12,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    addToRequestButton: {
        height: 54,
        borderRadius: 16,
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    addToRequestText: {
        color: Colors.bg,
        fontSize: 15,
        fontWeight: '700',
    },
});

export default styles;
