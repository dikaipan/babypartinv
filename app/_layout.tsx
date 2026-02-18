import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { theme, Colors } from '../src/config/theme';
import { useAuthStore } from '../src/stores/authStore';
import { initOneSignal } from '../src/config/onesignal';



export default function RootLayout() {
    const { user, initialized, init, isRecovery } = useAuthStore();
    const segments = useSegments();
    const router = useRouter();

    // Inject font via CDN to ensure it works on web (bypassing bundler issues)
    useEffect(() => {
        if (Platform.OS === 'web') {
            const style = document.createElement('style');
            style.textContent = `
                @font-face {
                    font-family: 'MaterialCommunityIcons';
                    src: url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/fonts/materialdesignicons-webfont.woff2') format('woff2');
                }
            `;
            document.head.appendChild(style);
        }
    }, []);

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

    if (!initialized) {
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
