import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../config/theme';

interface NotificationBellProps {
    unreadCount: number;
    onPress: () => void;
    size?: number;
}

export default function NotificationBell({ unreadCount, onPress, size = 24 }: NotificationBellProps) {
    return (
        <Pressable onPress={onPress} style={styles.container} hitSlop={8}>
            <MaterialCommunityIcons
                name={unreadCount > 0 ? 'bell-ring-outline' : 'bell-outline'}
                size={size}
                color={Colors.text}
            />
            {unreadCount > 0 && (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                </View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top: 4,
        right: 2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: Colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
        lineHeight: 12,
    },
});
