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

const buildOneSignalPayload = (req: PushRequest) => {
    const headings = { en: normalizeText(req.title, 120) };
    const contents = { en: normalizeText(req.body, 2000) };
    const appId = normalizeText(req.appId, 100);
    const externalIds = sanitizeIds(req.include_aliases?.external_id, 2000);
    const playerIds = sanitizeIds(req.include_player_ids, 2000);
    const segments = sanitizeIds(req.included_segments, 20);

    if (!headings.en || !contents.en || !appId) {
        throw new Error('Payload wajib berisi title, body, dan appId.');
    }

    const payload: Record<string, unknown> = {
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

    let payload: Record<string, unknown>;
    try {
        const body = (await req.json()) as PushRequest;
        payload = buildOneSignalPayload(body);
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
    const hasSegments = Array.isArray((payload as { included_segments?: unknown }).included_segments);
    if (hasSegments && !isAdmin) {
        return json(403, { error: 'Hanya admin yang boleh kirim ke segments.' });
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
