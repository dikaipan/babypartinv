/// <reference path="./types.d.ts" />

import { createClient } from 'npm:@supabase/supabase-js@2';

type PushRequest = {
    title?: string;
    body?: string;
    appId?: string;
    include_player_ids?: string[];
    include_aliases?: { external_id?: string[] };
    included_segments?: string[];
    target_channel?: 'push';
    data?: unknown;
};

type OneSignalPayload = {
    app_id: string;
    headings: { en: string };
    contents: { en: string };
    data?: unknown;
    include_aliases?: { external_id?: string[] };
    include_player_ids?: string[];
    included_segments?: string[];
    target_channel?: 'push';
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    });

const normalizeText = (value: unknown, maxLen: number) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed.slice(0, maxLen);
};

const sanitizeIds = (value: unknown, maxItems: number) => {
    if (!Array.isArray(value)) return [] as string[];
    return value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .slice(0, maxItems);
};

const buildOneSignalPayload = (req: PushRequest, configuredAppId?: string): OneSignalPayload => {
    const headings = { en: normalizeText(req.title, 120) };
    const contents = { en: normalizeText(req.body, 2000) };
    const forcedAppId = normalizeText(configuredAppId, 100);
    const requestAppId = normalizeText(req.appId, 100);
    if (forcedAppId && requestAppId && requestAppId !== forcedAppId) {
        throw new Error('appId payload tidak sesuai konfigurasi server.');
    }
    const appId = forcedAppId || requestAppId;
    const externalIds = sanitizeIds(req.include_aliases?.external_id, 2000);
    const playerIds = sanitizeIds(req.include_player_ids, 2000);
    const segments = sanitizeIds(req.included_segments, 20);

    if (!headings.en || !contents.en || !appId) {
        throw new Error('Payload wajib berisi title dan body (appId dari env server atau request).');
    }

    const payload: OneSignalPayload = {
        app_id: appId,
        headings,
        contents,
    };

    if (req.data !== undefined) {
        payload.data = req.data;
    }

    if (externalIds.length > 0) {
        payload.include_aliases = { external_id: externalIds };
        payload.target_channel = 'push';
        return payload;
    }

    if (playerIds.length > 0) {
        payload.include_player_ids = playerIds;
        return payload;
    }

    if (segments.length > 0) {
        payload.included_segments = segments;
        return payload;
    }

    throw new Error('Target push tidak valid. Isi include_aliases / include_player_ids / included_segments.');
};

const parseJsonSafe = async (response: Response) => {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !oneSignalApiKey) {
        return json(500, { error: 'Secret function belum lengkap di environment.' });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return json(401, { error: 'Missing bearer token.' });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
    });

    const {
        data: { user },
        error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
        return json(401, { error: 'Token tidak valid.' });
    }

    let payload: OneSignalPayload;
    try {
        const body = (await req.json()) as PushRequest;
        payload = buildOneSignalPayload(body, oneSignalAppId);
    } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : 'Payload tidak valid.' });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: profile } = await serviceClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    const isAdmin = profile?.role === 'admin';
    const targetExternalIds = sanitizeIds(payload.include_aliases?.external_id, 2000);
    const hasSegments = Array.isArray(payload.included_segments) && payload.included_segments.length > 0;
    const hasPlayerIds = Array.isArray(payload.include_player_ids) && payload.include_player_ids.length > 0;

    if (!isAdmin) {
        if (hasSegments || hasPlayerIds) {
            return json(403, { error: 'Hanya admin yang boleh kirim ke segments/player_ids.' });
        }

        if (targetExternalIds.length === 0) {
            return json(403, { error: 'User non-admin hanya boleh kirim ke external_id.' });
        }

        if (targetExternalIds.length > 20) {
            return json(403, { error: 'Maksimal 20 penerima untuk non-admin.' });
        }

        const sendingToSelfOnly = targetExternalIds.length === 1 && targetExternalIds[0] === user.id;
        if (!sendingToSelfOnly) {
            const { data: targetProfiles, error: targetProfilesError } = await serviceClient
                .from('profiles')
                .select('id, role')
                .in('id', targetExternalIds);

            if (targetProfilesError) {
                return json(500, { error: 'Gagal memverifikasi target notifikasi.' });
            }

            const targetById = new Map((targetProfiles || []).map((item) => [item.id, item.role]));
            const hasInvalidTarget = targetExternalIds.some((targetId) => targetById.get(targetId) !== 'admin');
            if (hasInvalidTarget) {
                return json(403, { error: 'Non-admin hanya boleh kirim ke akun admin atau dirinya sendiri.' });
            }
        }
    }

    const oneSignalRes = await fetch('https://api.onesignal.com/notifications?c=push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Key ${oneSignalApiKey}`,
        },
        body: JSON.stringify(payload),
    });

    const oneSignalBody = await parseJsonSafe(oneSignalRes);
    if (!oneSignalRes.ok) {
        return json(502, {
            error: 'OneSignal request failed.',
            detail: oneSignalBody,
        });
    }

    return json(200, {
        ok: true,
        sender: user.id,
        result: oneSignalBody,
    });
});
