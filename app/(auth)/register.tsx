import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors } from '../../src/config/theme';
import AppSnackbar from '../../src/components/AppSnackbar';
import { normalizeArea } from '../../src/utils/normalizeArea';

export default function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [employeeId, setEmployeeId] = useState('');
    const [location, setLocation] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const { signUp, loading } = useAuthStore();
    const router = useRouter();

    const toTitleCase = (s: string) =>
        s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase());

    const handleRegister = async () => {
        if (!name || !email || !password || !employeeId || !location) {
            setError('Nama, Email, Password, ID Engineer, dan Area Group wajib diisi');
            return;
        }
        if (password.length < 6) {
            setError('Password minimal 6 karakter');
            return;
        }
        try {
            const result = await signUp(
                email.trim(),
                password,
                toTitleCase(name.trim()),
                employeeId.trim(),
                normalizeArea(location),
            );
            setSuccessMessage(
                result.requiresEmailConfirmation
                    ? 'Registrasi berhasil. Cek email untuk konfirmasi akun sebelum login.'
                    : 'Registrasi berhasil. Silakan login.',
            );
            setTimeout(() => router.replace('/(auth)/login'), 2500);
        } catch (e: any) {
            setError(e.message || 'Registrasi gagal');
        }
    };

    return (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <View style={styles.contentContainer}>
                    <View style={styles.header}>
                        <MaterialCommunityIcons name="account-plus" size={40} color={Colors.primary} />
                        <Text style={styles.title}>Daftar Akun</Text>
                        <Text style={styles.subtitle}>Buat akun engineer baru dan konfirmasi lewat email.</Text>
                    </View>

                    <View style={styles.form}>
                        <TextInput mode="outlined" label="Nama Lengkap" value={name} onChangeText={setName}
                            left={<TextInput.Icon icon="account" />} style={styles.input}
                            outlineColor={Colors.border} activeOutlineColor={Colors.primary} textColor={Colors.text} />
                        <TextInput mode="outlined" label="ID Engineer *" placeholder="Contoh: IDH60020" value={employeeId}
                            onChangeText={setEmployeeId} autoCapitalize="characters"
                            left={<TextInput.Icon icon="badge-account" />} style={styles.input}
                            outlineColor={Colors.border} activeOutlineColor={Colors.primary} textColor={Colors.text} />
                        <TextInput mode="outlined" label="Email" value={email} onChangeText={setEmail}
                            keyboardType="email-address" autoCapitalize="none"
                            left={<TextInput.Icon icon="email-outline" />} style={styles.input}
                            outlineColor={Colors.border} activeOutlineColor={Colors.primary} textColor={Colors.text} />
                        <TextInput mode="outlined" label="Password" value={password} onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            left={<TextInput.Icon icon="lock-outline" />}
                            right={
                                <TextInput.Icon
                                    icon={showPassword ? 'eye-off' : 'eye'}
                                    onPress={() => setShowPassword((prev) => !prev)}
                                    forceTextInputFocus={false}
                                />
                            }
                            style={styles.input}
                            outlineColor={Colors.border} activeOutlineColor={Colors.primary} textColor={Colors.text} />
                        <TextInput mode="outlined" label="Area Group *" placeholder="Contoh: AMBON, JAKARTA"
                            value={location} onChangeText={setLocation} autoCapitalize="characters"
                            left={<TextInput.Icon icon="map-marker" />} style={styles.input}
                            outlineColor={Colors.border} activeOutlineColor={Colors.primary} textColor={Colors.text} />

                        <Button mode="contained" onPress={handleRegister} loading={loading} disabled={loading}
                            style={styles.button} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel}>
                            Daftar
                        </Button>
                        <Button mode="text" onPress={() => router.back()} textColor={Colors.textSecondary}>
                            Sudah punya akun? Masuk
                        </Button>
                    </View>
                </View>
            </ScrollView>
            <AppSnackbar visible={!!error} onDismiss={() => setError('')} duration={3000}>{error}</AppSnackbar>
            <AppSnackbar visible={!!successMessage} onDismiss={() => setSuccessMessage('')} duration={3200}
                style={{ backgroundColor: Colors.success }}>{successMessage}</AppSnackbar>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: Colors.bg },
    container: { flexGrow: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },
    contentContainer: { width: '100%', maxWidth: 480 },
    header: { alignItems: 'center', marginBottom: 32, gap: 8 },
    title: { fontSize: 24, fontWeight: '700', color: Colors.text },
    subtitle: { fontSize: 14, color: Colors.textSecondary },
    form: { gap: 12 },
    input: { backgroundColor: Colors.surface },
    button: { backgroundColor: Colors.primary, borderRadius: 12, marginTop: 8 },
    buttonContent: { height: 52 },
    buttonLabel: { fontSize: 16, fontWeight: '600', color: '#000' },
});
