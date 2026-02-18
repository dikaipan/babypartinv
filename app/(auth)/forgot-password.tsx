import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { Link, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const { resetPassword, loading } = useAuthStore();
    const router = useRouter();

    const handleReset = async () => {
        if (!email) {
            setError('Email wajib diisi');
            return;
        }
        try {
            await resetPassword(email.trim());
            setMessage('Link reset password telah dikirim ke email Anda. Silakan cek inbox/spam.');
        } catch (e: any) {
            setError(e.message || 'Gagal mengirim link reset password');
        }
    };

    return (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <View style={styles.contentContainer}>
                    <View style={styles.header}>
                        <View style={styles.iconContainer}>
                            <MaterialCommunityIcons name="lock-reset" size={48} color={Colors.primary} />
                        </View>
                        <Text style={styles.title}>Lupa Password</Text>
                        <Text style={styles.subtitle}>Masukkan email untuk reset password</Text>
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
                        <Button
                            mode="contained"
                            onPress={handleReset}
                            loading={loading}
                            disabled={loading}
                            style={styles.button}
                            contentStyle={styles.buttonContent}
                            labelStyle={styles.buttonLabel}
                        >
                            Kirim Link Reset
                        </Button>

                        <Button
                            mode="text"
                            onPress={() => router.back()}
                            style={styles.backButton}
                            labelStyle={styles.backButtonLabel}
                        >
                            Kembali ke Login
                        </Button>
                    </View>
                </View>
            </ScrollView>
            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000}>{error}</AppSnackbar>
            <AppSnackbar visible={!!message} onDismiss={() => setMessage('')} duration={5000}>{message}</AppSnackbar>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: Colors.bg },
    container: { flexGrow: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },
    contentContainer: { width: '100%', maxWidth: 480 },
    header: { alignItems: 'center', marginBottom: 40 },
    iconContainer: {
        width: 88,
        height: 88,
        borderRadius: 24,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.primary + '40',
        marginBottom: 16,
    },
    title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 16, textAlign: 'center' },
    form: { gap: 12 },
    input: { backgroundColor: Colors.surface },
    button: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        marginTop: 8,
    },
    buttonContent: { height: 52 },
    buttonLabel: { fontSize: 16, fontWeight: '600', color: '#000' },
    backButton: { marginTop: 8 },
    backButtonLabel: { color: Colors.textSecondary },
});
