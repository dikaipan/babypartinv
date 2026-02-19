/// <reference path="./types.d.ts" />

import { createClient } from 'npm:@supabase/supabase-js@2';

type SetPasswordRequest = {
    userId?: string;
    password?: string;
    email?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
};

const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    });

const sanitize = (value: unknown, max = 200) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return json(405, { ok: false, error: 'Method not allowed' });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
            return json(500, { ok: false, error: 'Secret function belum lengkap di environment.' });
        }

        const authHeader = req.headers.get('Authorization') ?? '';
        if (!authHeader.toLowerCase().startsWith('bearer ')) {
            return json(401, { ok: false, error: 'Missing bearer token.' });
        }

        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

        const {
            data: { user },
            error: userError,
        } = await userClient.auth.getUser();

        if (userError || !user) {
            return json(401, { ok: false, error: 'Token tidak valid.' });
        }

        const { data: profile, error: profileError } = await serviceClient
            .from('profiles')
            .select('id, role')
            .eq('id', user.id)
            .maybeSingle();

        if (profileError || !profile) {
            return json(403, { ok: false, error: 'Akses ditolak.' });
        }
        if (profile.role !== 'admin') {
            return json(403, { ok: false, error: 'Hanya admin yang boleh set password user lain.' });
        }

        let body: SetPasswordRequest;
        try {
            body = (await req.json()) as SetPasswordRequest;
        } catch {
            return json(400, { ok: false, error: 'Payload tidak valid.' });
        }

        const targetUserId = sanitize(body.userId, 100);
        const password = sanitize(body.password, 200);
        const email = sanitize(body.email, 200).toLowerCase();

        if (!targetUserId) {
            return json(400, { ok: false, error: 'userId wajib diisi.' });
        }
        if (!password && !email) {
            return json(400, { ok: false, error: 'Minimal salah satu dari password/email wajib diisi.' });
        }
        if (password && password.length < 6) {
            return json(400, { ok: false, error: 'Password minimal 6 karakter.' });
        }
        if (email && !EMAIL_REGEX.test(email)) {
            return json(400, { ok: false, error: 'Format email tidak valid.' });
        }

        const updatePayload: {
            password?: string;
            email?: string;
            email_confirm?: boolean;
        } = {};
        if (password) {
            updatePayload.password = password;
        }
        if (email) {
            updatePayload.email = email;
            updatePayload.email_confirm = true;
        }

        const { error: updateError } = await serviceClient.auth.admin.updateUserById(targetUserId, updatePayload);
        if (updateError) {
            return json(400, { ok: false, error: updateError.message || 'Gagal memperbarui password user.' });
        }

        return json(200, { ok: true, userId: targetUserId });
    } catch (error) {
        console.error('[admin-set-password] Unexpected error:', error);
        return json(500, { ok: false, error: 'Unexpected error.' });
    }
});
