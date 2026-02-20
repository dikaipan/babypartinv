# Admin Create User (Supabase Edge Function)

## Tujuan
Memungkinkan admin mendaftarkan user baru secara manual dari halaman Users, termasuk pembuatan akun auth dan row profile.

## Secrets yang wajib diset
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy
```bash
supabase functions deploy admin-create-user --no-verify-jwt
```

## URL endpoint
```text
https://<PROJECT_REF>.supabase.co/functions/v1/admin-create-user
```

## Kontrak request
Method: `POST`  
Header: `Authorization: Bearer <access_token>`

Body JSON:
```json
{
  "name": "Nama User",
  "email": "user@example.com",
  "password": "password-baru",
  "employee_id": "IDH60020",
  "location": "JAKARTA",
  "role": "engineer",
  "is_active": true
}
```

## Aturan akses
- Hanya requester dengan role `admin` di tabel `profiles` yang diizinkan.
- `name`, `email`, `password` wajib diisi.
- Password minimal 6 karakter.
- Jika `role = engineer`, maka `employee_id` dan `location` wajib diisi.
