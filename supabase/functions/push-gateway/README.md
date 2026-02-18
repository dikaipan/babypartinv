# Push Gateway (Supabase Edge Function)

## Tujuan
Function ini menerima request push dari app (pakai bearer token Supabase), lalu meneruskan ke OneSignal memakai secret server-side.

## Secrets yang wajib diset
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ONESIGNAL_REST_API_KEY`

## Deploy
```bash
supabase functions deploy push-gateway
```

## URL endpoint
```text
https://<PROJECT_REF>.functions.supabase.co/push-gateway
```

Set ke env app:
```text
EXPO_PUBLIC_PUSH_GATEWAY_URL=https://<PROJECT_REF>.functions.supabase.co/push-gateway
```

## Catatan auth
- Wajib `Authorization: Bearer <access_token>`.
- User non-admin tidak boleh kirim ke `included_segments`.
