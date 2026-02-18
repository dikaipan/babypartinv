import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../config/theme';

type Props = {
    enabled: boolean;
    pullDistance: number;
    ready: boolean;
    refreshing: boolean;
};

export default function WebPullToRefreshBanner({ enabled, pullDistance, ready, refreshing }: Props) {
    const visibleHeight = refreshing
        ? 42
        : enabled
            ? Math.max(0, Math.min(42, pullDistance * 0.6))
            : 0;

    if (visibleHeight <= 0) return null;

    return (
        <View style={[styles.wrap, { height: visibleHeight }]}>
            <Text style={styles.text}>
                {refreshing ? 'Menyegarkan data...' : ready ? 'Lepas untuk refresh' : 'Tarik ke bawah untuk refresh'}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: Colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
});
