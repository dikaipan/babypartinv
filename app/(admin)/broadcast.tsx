import { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, TextInput, Button, RadioButton } from 'react-native-paper';
import { Colors } from '../../src/config/theme';
import { adminStyles } from '../../src/styles/adminStyles';
import AppSnackbar from '../../src/components/AppSnackbar';
import { supabase } from '../../src/config/supabase';
import { NotificationService } from '../../src/services/NotificationService';

export default function BroadcastPage() {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [target, setTarget] = useState<'all' | 'admin' | 'engineer'>('all');
    const [sending, setSending] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const handleSend = async () => {
        const trimmedTitle = title.trim();
        const trimmedBody = body.trim();

        if (!trimmedTitle || !trimmedBody) {
            setError('Judul dan Pesan wajib diisi');
            return;
        }

        setSending(true);
        setError('');
        setSuccess('');

        try {
            let countQuery = supabase.from('profiles').select('id', { head: true, count: 'exact' });
            if (target !== 'all') {
                countQuery = countQuery.eq('role', target);
            }
            const { count, error: countError } = await countQuery;
            if (countError) throw new Error('Fetch users: ' + countError.message);

            const recipientCount = count || 0;
            if (recipientCount === 0) {
                setError('Tidak ada user ditemukan');
                return;
            }

            const pushResult = await NotificationService.broadcast(trimmedTitle, trimmedBody, target);
            if (pushResult) {
                setSuccess(`Broadcast diproses untuk ${recipientCount} user.`);
            } else {
                setSuccess(`Notifikasi in-app terkirim ke ${recipientCount} user, push belum terkirim (cek push gateway).`);
            }
            setTitle('');
            setBody('');
        } catch (e: unknown) {
            console.error('[Broadcast Error]', e);
            setError(e instanceof Error ? e.message : 'Gagal mengirim');
        } finally {
            setSending(false);
        }
    };

    return (
        <ScrollView style={adminStyles.container}>
            <View style={[adminStyles.card, { margin: 20, padding: 20 }]}>
                <Text style={styles.heading}>Broadcast Pesan</Text>
                <Text style={styles.subtitle}>Kirim notifikasi ke seluruh pengguna atau grup tertentu.</Text>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Target Penerima</Text>
                    <RadioButton.Group onValueChange={(val) => setTarget(val as 'all' | 'admin' | 'engineer')} value={target}>
                        <View style={styles.radioRow}>
                            <View style={styles.radioItem}>
                                <RadioButton value="all" color={Colors.primary} />
                                <Text onPress={() => setTarget('all')}>Semua User</Text>
                            </View>
                            <View style={styles.radioItem}>
                                <RadioButton value="engineer" color={Colors.primary} />
                                <Text onPress={() => setTarget('engineer')}>Engineer</Text>
                            </View>
                            <View style={styles.radioItem}>
                                <RadioButton value="admin" color={Colors.primary} />
                                <Text onPress={() => setTarget('admin')}>Admin</Text>
                            </View>
                        </View>
                    </RadioButton.Group>
                </View>

                <View style={styles.formGroup}>
                    <TextInput
                        label="Judul Notifikasi"
                        value={title}
                        onChangeText={setTitle}
                        mode="outlined"
                        outlineColor={Colors.border}
                        activeOutlineColor={Colors.primary}
                        style={{ backgroundColor: Colors.bg }}
                    />
                </View>

                <View style={styles.formGroup}>
                    <TextInput
                        label="Isi Pesan"
                        value={body}
                        onChangeText={setBody}
                        mode="outlined"
                        outlineColor={Colors.border}
                        activeOutlineColor={Colors.primary}
                        multiline
                        numberOfLines={4}
                        style={{ backgroundColor: Colors.bg, minHeight: 100 }}
                    />
                </View>

                <Button
                    mode="contained"
                    onPress={handleSend}
                    loading={sending}
                    disabled={sending}
                    style={styles.sendBtn}
                    labelStyle={{ fontSize: 16, fontWeight: '700', paddingVertical: 4 }}
                >
                    {sending ? 'Mengirim...' : 'Kirim Broadcast'}
                </Button>
            </View>

            <AppSnackbar visible={!!error} onDismiss={() => setError('')} style={{ backgroundColor: Colors.danger }}>{error}</AppSnackbar>
            <AppSnackbar visible={!!success} onDismiss={() => setSuccess('')} style={{ backgroundColor: Colors.success }}>{success}</AppSnackbar>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    heading: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 6 },
    subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
    formGroup: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 10 },
    radioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    radioItem: { flexDirection: 'row', alignItems: 'center' },
    sendBtn: { marginTop: 10, backgroundColor: Colors.primary, borderRadius: 10 },
});
