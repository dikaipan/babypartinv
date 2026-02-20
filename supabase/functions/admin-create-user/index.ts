/// <reference path="./types.d.ts" />

import { createClient } from 'npm:@supabase/supabase-js@2';

type CreateUserRequest = {
    name?: string;
    email?: string;
    password?: string;
    employee_id?: string;
    location?: string;
    role?: 'admin' | 'engineer';
    is_active?: boolean;
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

const sanitizeText = (value: unknown, max = 200) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
};

const normalizeRole = (value: unknown): 'admin' | 'engineer' =>
    value === 'admin' ? 'admin' : 'engineer';

const normalizeArea = (value: string) => value.trim().toUpperCase();

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

        if (profileError || !profile || profile.role !== 'admin') {
            return json(403, { ok: false, error: 'Hanya admin yang boleh membuat user baru.' });
        }

        let body: CreateUserRequest;
        try {
            body = (await req.json()) as CreateUserRequest;
        } catch {
            return json(400, { ok: false, error: 'Payload tidak valid.' });
        }

        const name = sanitizeText(body.name, 120);
        const email = sanitizeText(body.email, 200).toLowerCase();
        const password = sanitizeText(body.password, 200);
        const employeeId = sanitizeText(body.employee_id, 120);
        const location = sanitizeText(body.location, 120);
        const role = normalizeRole(body.role);
        const isActive = typeof body.is_active === 'boolean' ? body.is_active : true;

        if (!name || !email || !password) {
            return json(400, { ok: false, error: 'Nama, email, dan password wajib diisi.' });
        }
        if (!EMAIL_REGEX.test(email)) {
            return json(400, { ok: false, error: 'Format email tidak valid.' });
        }
        if (password.length < 6) {
            return json(400, { ok: false, error: 'Password minimal 6 karakter.' });
        }
        if (role === 'engineer' && (!employeeId || !location)) {
            return json(400, { ok: false, error: 'ID Engineer dan Area Group wajib diisi untuk role engineer.' });
        }

        const normalizedLocation = location ? normalizeArea(location) : null;
        const normalizedEmployeeId = employeeId || null;

        const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name,
                employee_id: normalizedEmployeeId,
                location: normalizedLocation,
                role,
                is_active: isActive,
            },
        });

        if (createError) {
            return json(400, { ok: false, error: createError.message || 'Gagal membuat akun auth user.' });
        }

        const createdUserId = created.user?.id;
        if (!createdUserId) {
            return json(500, { ok: false, error: 'Akun berhasil dibuat tapi user ID tidak tersedia.' });
        }

        const { error: profileUpsertError } = await serviceClient
            .from('profiles')
            .upsert({
                id: createdUserId,
                name,
                email,
                role,
                employee_id: normalizedEmployeeId,
                location: normalizedLocation,
                is_active: isActive,
                updated_at: new Date().toISOString(),
            });

        if (profileUpsertError) {
            const { error: rollbackError } = await serviceClient.auth.admin.deleteUser(createdUserId);
            if (rollbackError) {
                console.error('[admin-create-user] Rollback auth user failed:', rollbackError);
            }
            return json(500, { ok: false, error: profileUpsertError.message || 'Gagal menyimpan profil user.' });
        }

        return json(200, {
            ok: true,
            userId: createdUserId,
            email,
        });
    } catch (error) {
        console.error('[admin-create-user] Unexpected error:', error);
        return json(500, { ok: false, error: 'Unexpected error.' });
    }
});
