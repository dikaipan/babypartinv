import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform, LogBox, ScrollView, FlatList, SectionList, VirtualizedList, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { QueryClientProvider } from '@tanstack/react-query';
import { theme, Colors } from '../src/config/theme';
import { useAuthStore } from '../src/stores/authStore';
import { initOneSignal } from '../src/config/onesignal';
import { getQueryClient } from '../src/config/queryClient';

const hideScrollIndicatorsByDefault = (Component: any) => {
    Component.defaultProps = {
        ...(Component.defaultProps || {}),
        showsVerticalScrollIndicator: false,
        showsHorizontalScrollIndicator: false,
    };
};

if (Platform.OS === 'android') {
    hideScrollIndicatorsByDefault(ScrollView);
    hideScrollIndicatorsByDefault(FlatList);
    hideScrollIndicatorsByDefault(SectionList);
    hideScrollIndicatorsByDefault(VirtualizedList);
}



export default function RootLayout() {
    const { user, session, initialized, init, isRecovery } = useAuthStore();
    const segments = useSegments();
    const router = useRouter();
    const queryClient = getQueryClient();
    const { width } = useWindowDimensions();
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
        // Keep user on protected routes while session is present but profile is still syncing.
        if (!user && !session && !inAuth) {
            router.replace('/(auth)/login');
        } else if (user && inAuth) {
            if (user.role === 'admin') {
                router.replace('/(admin)/dashboard');
            } else {
                router.replace('/(engineer)/stok');
            }
        }
    }, [user, session, initialized, segments, isRecovery]);

    const isWeb = Platform.OS === 'web';
    const isAdmin = segments[0] === '(admin)';
    const isWebMobile = isWeb && width < 768;

    useEffect(() => {
        if (!isWeb) return;

        const scope = globalThis as any;
        const doc = scope?.document as Document | undefined;
        if (!doc) return;

        const adminStyleId = 'admin-dark-scrollbar-style';
        const mobileStyleId = 'mobile-hide-scrollbar-style';
        const removeStyle = (id: string) => {
            const existing = doc.getElementById(id);
            if (existing) existing.remove();
        };
        const upsertStyle = (id: string, cssText: string) => {
            let styleEl = doc.getElementById(id) as HTMLStyleElement | null;
            if (!styleEl) {
                styleEl = doc.createElement('style');
                styleEl.id = id;
                doc.head.appendChild(styleEl);
            }
            if (styleEl.textContent !== cssText) {
                styleEl.textContent = cssText;
            }
        };

        if (isWebMobile) {
            removeStyle(adminStyleId);
            upsertStyle(mobileStyleId, `
                html,
                body,
                #root,
                #expo-root {
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                * {
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                *::-webkit-scrollbar {
                    width: 0 !important;
                    height: 0 !important;
                    display: none;
                }
            `);
        } else if (isAdmin) {
            removeStyle(mobileStyleId);
            upsertStyle(adminStyleId, `
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
            `);
        } else {
            removeStyle(adminStyleId);
            removeStyle(mobileStyleId);
        }

        return () => {
            removeStyle(adminStyleId);
            removeStyle(mobileStyleId);
        };
    }, [isWeb, isAdmin, isWebMobile]);

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
                <QueryClientProvider client={queryClient}>
                    <PaperProvider theme={theme}>
                        <View style={styles.loader}>
                            <ActivityIndicator size="large" color={Colors.primary} />
                        </View>
                        <StatusBar style="light" />
                    </PaperProvider>
                </QueryClientProvider>
            </GestureHandlerRootView>
        );
    }

    return (
        <GestureHandlerRootView style={styles.flex}>
            <QueryClientProvider client={queryClient}>
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
            </QueryClientProvider>
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
