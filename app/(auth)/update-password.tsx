import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const { updateUserPassword, loading } = useAuthStore();
    const router = useRouter();

    const handleUpdate = async () => {
        if (!password || !confirmPassword) {
            setError('Password wajib diisi');
            return;
        }
        if (password !== confirmPassword) {
            setError('Password tidak sama');
            return;
        }
        if (password.length < 8) {
            setError('Password minimal 8 karakter');
            return;
        }

        try {
            await updateUserPassword(password);
            setMessage('Password berhasil diperbarui. Silakan login kembali.');
            setTimeout(() => {
                router.replace('/(auth)/login');
            }, 2000);
        } catch (e: any) {
            setError(e.message || 'Gagal memperbarui password');
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
                        <Text style={styles.title}>Update Password</Text>
                        <Text style={styles.subtitle}>Masukkan password baru Anda</Text>
                    </View>

                    <View style={styles.form}>
                        <TextInput
                            mode="outlined"
                            label="Password Baru"
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
                        <TextInput
                            mode="outlined"
                            label="Konfirmasi Password"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry={!showConfirmPassword}
                            left={<TextInput.Icon icon="lock-check-outline" />}
                            right={
                                <TextInput.Icon
                                    icon={showConfirmPassword ? 'eye-off' : 'eye'}
                                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                />
                            }
                            style={styles.input}
                            outlineColor={Colors.border}
                            activeOutlineColor={Colors.primary}
                            textColor={Colors.text}
                        />

                        <Button
                            mode="contained"
                            onPress={handleUpdate}
                            loading={loading}
                            disabled={loading}
                            style={styles.button}
                            contentStyle={styles.buttonContent}
                            labelStyle={styles.buttonLabel}
                        >
                            Simpan Password
                        </Button>
                    </View>
                </View>
            </ScrollView>
            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000}>{error}</AppSnackbar>
            <AppSnackbar visible={!!message} onDismiss={() => setMessage('')} duration={3000}>{message}</AppSnackbar>
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
});
