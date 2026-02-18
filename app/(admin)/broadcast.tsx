import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { Text, TextInput, Button, RadioButton } from 'react-native-paper';
import { Colors } from '../../src/config/theme';
import { adminStyles } from '../../src/styles/adminStyles';
import AppSnackbar from '../../src/components/AppSnackbar';
import { supabase } from '../../src/config/supabase';

const ONESIGNAL_APP_ID = 'e71e2327-736b-4a58-a55f-c3d4f7358018';
const ONESIGNAL_REST_API_KEY = 'os_v2_app_44pcgj3tnnffrjk7ypkponmaddojnejae2neejnhpjymisc4252ylnzkx2gmmun6n7xskoegtuwg6pwhmf3hnhd2vrfng2fostbd76y';

export default function BroadcastPage() {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [target, setTarget] = useState<'all' | 'admin' | 'engineer'>('all');
    const [sending, setSending] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const handleSend = async () => {
        if (!title.trim() || !body.trim()) {
            setError('Judul dan Pesan wajib diisi');
            return;
        }

        setSending(true);
        setError('');
        setSuccess('');

        try {
            // Step 1: Get users
            let users: { id: string }[] = [];
            if (target === 'all') {
                const { data, error: e } = await supabase.from('profiles').select('id');
                if (e) throw new Error('Fetch users: ' + e.message);
                users = data || [];
            } else {
                const { data, error: e } = await supabase.from('profiles').select('id').eq('role', target);
                if (e) throw new Error('Fetch users: ' + e.message);
                users = data || [];
            }

            if (users.length === 0) {
                setError('Tidak ada user ditemukan');
                return;
            }

            // Step 2: Insert into notifications table (DB in-app notifications)
            const rows = users.map(u => ({
                user_id: u.id,
                title: title.trim(),
                body: body.trim(),
                data: {},
                is_read: false,
                type: 'broadcast',
            }));

            const { error: insertErr } = await supabase.from('notifications').insert(rows);
            if (insertErr) throw new Error('Insert: ' + insertErr.message);

            // Step 3: Fire OneSignal push completely in background (never blocks UI)
            const userIds = users.map(u => u.id);
            const t = title.trim();
            const b = body.trim();
            setTimeout(() => {
                fireOneSignalPush(t, b, target, userIds)
                    .then(r => console.log('[Push] Result:', JSON.stringify(r)))
                    .catch(e => console.warn('[Push] Failed:', e.message));
            }, 0);

            setSuccess(`Broadcast terkirim ke ${users.length} user! (Push dikirim di background)`);
            setTitle('');
            setBody('');
        } catch (e: any) {
            console.error('[Broadcast Error]', e);
            setError(e.message || 'Gagal mengirim');
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
                    <RadioButton.Group onValueChange={val => setTarget(val as any)} value={target}>
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

/**
 * Push notification via OneSignal REST API with 10s timeout.
 */
async function fireOneSignalPush(title: string, body: string, target: string, userIds: string[]): Promise<any> {
    const payload: any = {
        app_id: ONESIGNAL_APP_ID,
        headings: { en: title },
        contents: { en: body },
    };

    if (target === 'all') {
        payload.included_segments = ['Active Users', 'Subscribed Users'];
    } else {
        payload.include_aliases = { external_id: userIds };
        payload.target_channel = 'push';
    }

    console.log('[Push] Payload:', JSON.stringify(payload, null, 2));

    const timeout = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('Push timeout (10s)')), 10000)
    );

    const request = fetch('https://api.onesignal.com/notifications?c=push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
        },
        body: JSON.stringify(payload),
    }).then(async (r) => {
        const text = await r.text();
        let json: any = {};
        try {
            json = text ? JSON.parse(text) : {};
        } catch {
            json = { raw: text };
        }
        if (!r.ok) {
            throw new Error(`[OneSignal ${r.status}] ${JSON.stringify(json)}`);
        }
        return json;
    });

    const result = await Promise.race([request, timeout]);
    console.log('[Push] OneSignal result:', result);
    return result;
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
