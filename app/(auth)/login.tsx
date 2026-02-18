import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image, Pressable } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const { signIn, loading } = useAuthStore();

    const toLoginErrorMessage = (err: any) => {
        const rawMessage = typeof err?.message === 'string' ? err.message : '';
        const message = rawMessage.toLowerCase();
        if (message.includes('email not confirmed')) {
            return 'Email belum dikonfirmasi. Cek inbox/spam lalu klik link konfirmasi.';
        }
        if (message.includes('invalid login credentials')) {
            return 'Email atau password salah.';
        }
        return rawMessage || 'Login gagal';
    };

    const handleLogin = async () => {
        if (!email || !password) {
            setError('Email dan password wajib diisi');
            return;
        }
        try {
            await signIn(email.trim(), password);
        } catch (e: any) {
            setError(toLoginErrorMessage(e));
        }
    };

    return (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <View style={styles.contentContainer}>
                    <View style={styles.header}>
                        <View style={styles.iconContainer}>
                            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
                        </View>
                        <Text style={styles.title}>Babyparts Inventory</Text>
                        <Text style={styles.subtitle}>Login dengan email & password yang sudah terdaftar.</Text>
                    </View>

                    <View style={styles.form}>
                        <TextInput
                            mode="outlined"
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            left={<TextInput.Icon icon="email-outline" />}
                            style={styles.input}
                            outlineColor={Colors.border}
                            activeOutlineColor={Colors.primary}
                            textColor={Colors.text}
                        />
                        <TextInput
                            mode="outlined"
                            label="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            left={<TextInput.Icon icon="lock-outline" />}
                            right={
                                <TextInput.Icon
                                    icon={showPassword ? 'eye-off' : 'eye'}
                                    onPress={() => setShowPassword(!showPassword)}
                                />
                            }
                            style={styles.input}
                            outlineColor={Colors.border}
                            activeOutlineColor={Colors.primary}
                            textColor={Colors.text}
                        />

                        <View style={{ alignItems: 'flex-end', marginBottom: 24, marginTop: -4 }}>
                            <Link href="/(auth)/forgot-password" asChild>
                                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '600' }}>
                                    Lupa Password?
                                </Text>
                            </Link>
                        </View>

                        <Button
                            mode="contained"
                            onPress={handleLogin}
                            loading={loading}
                            disabled={loading}
                            style={styles.button}
                            contentStyle={styles.buttonContent}
                            labelStyle={styles.buttonLabel}
                        >
                            Masuk
                        </Button>

                        <View style={styles.registerRow}>
                            <Text style={styles.registerText}>Belum punya akun? </Text>
                            <Link href="/(auth)/register" asChild>
                                <Text style={styles.registerLink}>Daftar</Text>
                            </Link>
                        </View>
                    </View>

                    <View style={styles.footerContainer}>
                        <Text style={styles.footer}>
                            © 2026 Babyparts Inventory. All rights reserved.
                        </Text>
                        <Link href="https://github.com/dikaipan" asChild>
                            <Pressable style={styles.githubContainer}>
                                <MaterialCommunityIcons name="github" size={20} color={Colors.textMuted} />
                                <Text style={styles.githubText}>Developed by Handika</Text>
                            </Pressable>
                        </Link>
                    </View>
                </View>
            </ScrollView>
            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000}>{error}</AppSnackbar>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: Colors.bg },
    container: { flexGrow: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },
    contentContainer: { width: '100%', maxWidth: 480 },
    header: { alignItems: 'center', marginBottom: 40 },
    iconContainer: {
        marginBottom: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 180,
        height: 180,
    },
    title: { fontSize: 28, fontWeight: '700', color: Colors.text, textAlign: 'center' },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
    form: { gap: 12 },
    input: { backgroundColor: Colors.surface },
    button: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        marginTop: 8,
    },
    buttonContent: { height: 52 },
    buttonLabel: { fontSize: 16, fontWeight: '600', color: '#000' },
    registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
    registerText: { color: Colors.textSecondary, fontSize: 14 },
    registerLink: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
    footerContainer: {
        marginTop: 40,
        alignItems: 'center',
        gap: 8,
    },
    footer: { textAlign: 'center', color: Colors.textMuted, fontSize: 12 },
    githubContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    githubText: {
        color: Colors.textMuted,
        fontSize: 12,
        fontWeight: '500',
    },
});
