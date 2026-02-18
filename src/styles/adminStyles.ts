import { StyleSheet, Platform } from 'react-native';
import { Colors } from '../config/theme';

export const adminStyles = StyleSheet.create({
    // Layout
    container: { flex: 1, backgroundColor: Colors.bg },
    scrollContent: { paddingBottom: 100, paddingHorizontal: 20 },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20, paddingTop: 20 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
    headerSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

    // Controls & Search
    controls: { gap: 12, paddingHorizontal: 20, marginBottom: 16 },
    searchBar: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, elevation: 0 },
    searchBarWithMargin: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, elevation: 0, marginHorizontal: 20, marginBottom: 16 },

    // Cards (Compact)
    card: {
        backgroundColor: Colors.card, borderRadius: 12, padding: 12,
        borderWidth: 1, borderColor: Colors.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    cardBody: { marginBottom: 12, flex: 1 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },

    // Icons & Badges
    iconBox: {
        width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary + '15',
        justifyContent: 'center', alignItems: 'center',
    },
    badge: { backgroundColor: Colors.accent + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 4 },
    badgeText: { fontSize: 10, fontWeight: '700', color: Colors.accent },

    // Typography
    textBold: { fontWeight: '700', color: Colors.text },
    textMuted: { color: Colors.textMuted },
    textSecondary: { color: Colors.textSecondary },

    // Empty State
    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40, opacity: 0.6 },
    emptyText: { marginTop: 16, fontSize: 16, color: Colors.textSecondary, fontWeight: '500' },

    // Helpers
    row: { flexDirection: 'row', alignItems: 'center' },
    gap4: { gap: 4 },
    gap8: { gap: 8 },
    gap12: { gap: 12 },
});
