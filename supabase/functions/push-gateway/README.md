# Push Gateway (Supabase Edge Function)

## Tujuan
Function ini menerima request push dari app (pakai bearer token Supabase), lalu meneruskan ke OneSignal memakai secret server-side.

## Secrets yang wajib diset
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ONESIGNAL_REST_API_KEY`

## Secret opsional (direkomendasikan)
- `ONESIGNAL_APP_ID`
  - Jika diset, `appId` dari payload client akan diabaikan/ditolak bila tidak cocok.

## Deploy
```bash
supabase functions deploy push-gateway --no-verify-jwt
```

`--no-verify-jwt` wajib untuk request dari browser karena preflight `OPTIONS` tidak membawa bearer token. Validasi token tetap aman karena function ini memverifikasi `Authorization` sendiri untuk request `POST`.

## URL endpoint
```text
https://<PROJECT_REF>.supabase.co/functions/v1/push-gateway
```

Set ke env app:
```text
EXPO_PUBLIC_PUSH_GATEWAY_URL=https://<PROJECT_REF>.supabase.co/functions/v1/push-gateway
```

## Catatan auth
- Wajib `Authorization: Bearer <access_token>`.
- User non-admin tidak boleh kirim ke `included_segments`.
- User non-admin tidak boleh kirim ke `include_player_ids`.
- User non-admin hanya boleh kirim ke `external_id` milik dirinya sendiri atau akun admin (maks 20 target).
