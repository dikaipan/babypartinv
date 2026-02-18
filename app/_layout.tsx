import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform, LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { theme, Colors } from '../src/config/theme';
import { useAuthStore } from '../src/stores/authStore';
import { initOneSignal } from '../src/config/onesignal';



export default function RootLayout() {
    const { user, initialized, init, isRecovery } = useAuthStore();
    const segments = useSegments();
    const router = useRouter();
    const [fontsLoaded, fontError] = useFonts({
        // Serve icon font from public/ to avoid Cloudflare skipping assets under /assets/node_modules/.
        'material-community': '/fonts/MaterialCommunityIcons.ttf',
    });

    useEffect(() => {
        init();
        initOneSignal(); // Initialize OneSignal
    }, []);


    useEffect(() => {
        if (!initialized) return;

        if (isRecovery) {
            router.replace('/(auth)/update-password');
            return;
        }

        const inAuth = segments[0] === '(auth)';
        if (!user && !inAuth) {
            router.replace('/(auth)/login');
        } else if (user && inAuth) {
            if (user.role === 'admin') {
                router.replace('/(admin)/dashboard');
            } else {
                router.replace('/(engineer)/stok');
            }
        }
    }, [user, initialized, segments, isRecovery]);

    const isWeb = Platform.OS === 'web';
    const isAdmin = segments[0] === '(admin)';

    useEffect(() => {
        if (!isWeb) return;

        const scope = globalThis as any;
        const doc = scope?.document as Document | undefined;
        if (!doc) return;

        const styleId = 'admin-dark-scrollbar-style';
        const existing = doc.getElementById(styleId);

        if (!isAdmin) {
            if (existing) existing.remove();
            return;
        }

        if (existing) return;

        const styleEl = doc.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = `
            * {
                scrollbar-width: thin;
                scrollbar-color: #2B3A4E #0B1320;
            }
            *::-webkit-scrollbar {
                width: 10px;
                height: 10px;
            }
            *::-webkit-scrollbar-track {
                background: #0B1320;
            }
            *::-webkit-scrollbar-thumb {
                background-color: #2B3A4E;
                border-radius: 8px;
                border: 2px solid #0B1320;
            }
            *::-webkit-scrollbar-corner {
                background: #0B1320;
            }
        `;
        doc.head.appendChild(styleEl);

        return () => {
            const activeStyle = doc.getElementById(styleId);
            if (activeStyle) activeStyle.remove();
        };
    }, [isWeb, isAdmin]);

    useEffect(() => {
        if (!isWeb) return;

        const ignoredWarnings = [
            'Animated: `useNativeDriver` is not supported because the native animated module is missing.',
            "Added non-passive event listener to a scroll-blocking 'wheel' event.",
        ];

        LogBox.ignoreLogs(ignoredWarnings);

        const originalWarn = console.warn.bind(console);
        const originalError = console.error.bind(console);

        const shouldIgnore = (args: any[]) => {
            const message = args
                .map((arg) => (typeof arg === 'string' ? arg : ''))
                .join(' ');
            return ignoredWarnings.some((text) => message.includes(text));
        };

        console.warn = (...args: any[]) => {
            if (shouldIgnore(args)) return;
            originalWarn(...args);
        };

        console.error = (...args: any[]) => {
            if (shouldIgnore(args)) return;
            originalError(...args);
        };

        return () => {
            console.warn = originalWarn;
            console.error = originalError;
        };
    }, [isWeb]);

    if (!initialized || (!fontsLoaded && !fontError)) {
        return (
            <GestureHandlerRootView style={styles.flex}>
                <PaperProvider theme={theme}>
                    <View style={styles.loader}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                    <StatusBar style="light" />
                </PaperProvider>
            </GestureHandlerRootView>
        );
    }

    return (
        <GestureHandlerRootView style={styles.flex}>
            <PaperProvider theme={theme}>
                <View style={[styles.flex, isWeb && styles.webContainer]}>
                    <View style={[
                        styles.flex,
                        isWeb && (isAdmin ? styles.webContentAdmin : styles.webContentMobile)
                    ]}>
                        <Slot />
                    </View>
                </View>
                <StatusBar style="light" />
            </PaperProvider>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.bg,
    },
    webContainer: {
        alignItems: 'center',
        backgroundColor: '#000', // Darker background for the void
    },
    webContentMobile: {
        width: '100%',
        maxWidth: 480,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: Colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    webContentAdmin: {
        width: '100%',
        maxWidth: 1600,
    },
});
