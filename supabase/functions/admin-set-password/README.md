# Admin Update User Auth (Supabase Edge Function)

## Tujuan
Memungkinkan admin mengganti password dan/atau email login user langsung dari halaman Users, tanpa user target harus online.

## Secrets yang wajib diset
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy
```bash
supabase functions deploy admin-set-password --no-verify-jwt
```

`--no-verify-jwt` dipakai agar preflight `OPTIONS` dari browser tidak gagal. Validasi token tetap dilakukan manual di function untuk request `POST`.

## URL endpoint
```text
https://<PROJECT_REF>.supabase.co/functions/v1/admin-set-password
```

## Kontrak request
Method: `POST`  
Header: `Authorization: Bearer <access_token>`

Body JSON:
```json
{
  "userId": "uuid-user-target",
  "password": "password-baru",
  "email": "email-baru@example.com"
}
```

## Aturan akses
- Hanya requester dengan role `admin` di tabel `profiles` yang diizinkan.
- Minimal salah satu dari `password` atau `email` wajib diisi.
- Password minimal 6 karakter.
- Email (jika dikirim) harus valid.
