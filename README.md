# WASH POS

Sistem Point of Sale (POS) berbasis web untuk usaha pencucian kendaraan **motor dan mobil**.
Dibangun dengan React + TypeScript + Vite + Tailwind CSS + shadcn/ui, dengan Supabase
(Authentication + PostgreSQL) sebagai backend.

## Status Pengembangan

| Fase | Ruang Lingkup | Status |
|------|---------------|--------|
| 1 | Fondasi proyek + skema database (migrations, RLS, RPC, seed) | ✅ Selesai |
| 2 | Supabase client, autentikasi admin, layout + sidebar | ✅ Selesai |
| 3 | Dashboard + CRUD layanan | ⏳ Belum |
| 4 | POS transaksi, invoice, struk | ⏳ Belum |
| 5 | Riwayat transaksi + pembatalan | ⏳ Belum |
| 6 | Laporan pendapatan + export | ⏳ Belum |
| 7 | Testing, keamanan, dokumentasi lengkap | ⏳ Belum |

## Struktur Database (`supabase/migrations`)

Jalankan **berurutan** di Supabase Dashboard → **SQL Editor** (atau via Supabase CLI):

| File | Isi |
|------|-----|
| `001_initial_schema.sql` | Tabel `profiles`, `services`, `transactions`, `transaction_items`, FK, constraint, index, trigger `updated_at` & auto-profil admin |
| `002_rls_policies.sql` | Row Level Security semua tabel + kebijakan akses + penguatan privilege (client tidak bisa menulis transaksi langsung) |
| `003_functions_rpc.sql` | RPC atomik: `create_transaction`, `cancel_transaction`, `get_dashboard_summary`, `get_report` (zona waktu Asia/Jakarta) |
| `004_seed.sql` | Seed 8 layanan contoh motor & mobil |

## Environment Variables

Salin `.env.example` menjadi `.env` lalu isi dari **Supabase Dashboard → Project Settings → API**:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

> Kedua nilai ini aman untuk frontend (anon key dilindungi Row Level Security).
> **Jangan pernah** menaruh `SUPABASE_SERVICE_ROLE_KEY` di file `.env` frontend.

## Menjalankan Aplikasi

```bash
npm install      # pasang dependencies
npm run dev      # jalankan development server
npm run build    # build produksi + verifikasi TypeScript
```

## Membuat Akun Admin

Akun admin **tidak didaftarkan lewat aplikasi** (tanpa registrasi publik).
Buat lewat Supabase Dashboard → **Authentication → Users → Add user** (email + password).
Trigger di migrasi 001 otomatis membuat baris profil admin-nya.

*(Panduan lengkap ditulis ulang pada Fase 7.)*
