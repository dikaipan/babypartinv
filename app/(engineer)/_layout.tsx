import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { Colors } from '../../src/config/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EngineerLayout() {
    const insets = useSafeAreaInsets();
    const tabBottomPadding = Math.max(insets.bottom, 10);
    const tabHeight = 56 + tabBottomPadding;

    return (
        <Tabs
            backBehavior="none"
            screenOptions={{
                headerShown: false,
                lazy: true,
                freezeOnBlur: Platform.OS !== 'android',
                tabBarStyle: {
                    backgroundColor: Colors.card,
                    borderTopColor: Colors.border,
                    height: tabHeight,
                    paddingBottom: tabBottomPadding,
                    paddingTop: 6,
                },
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.textMuted,
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                tabBarHideOnKeyboard: true,
            }}
        >
            <Tabs.Screen name="stok" options={{
                title: 'Stok',
                tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="package-variant" size={size} color={color} />,
            }} />
            <Tabs.Screen name="request" options={{
                title: 'Request',
                tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="clipboard-text" size={size} color={color} />,
            }} />
            <Tabs.Screen name="pemakaian" options={{
                title: 'Pemakaian',
                tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="file-document-edit" size={size} color={color} />,
            }} />
            <Tabs.Screen name="akun" options={{
                title: 'Akun',
                tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="account" size={size} color={color} />,
            }} />
        </Tabs>
    );
}
