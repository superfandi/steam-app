# WASH POS

Sistem Point of Sale (POS) berbasis web untuk usaha pencucian kendaraan **motor dan mobil**.
Dibangun dengan React + TypeScript + Vite + Tailwind CSS + shadcn/ui, dengan Supabase
(Authentication + PostgreSQL) sebagai satu-satunya backend — tanpa server tambahan.

## Fitur

| Modul | Kemampuan |
|-------|-----------|
| **Autentikasi** | Login admin saja (tanpa registrasi publik), sesi persisten, guard seluruh area admin |
| **Dashboard** | 4 kartu statistik hari ini, grafik pendapatan 14 hari, ringkasan metode bayar, 8 transaksi terbaru |
| **Manajemen Layanan** | CRUD layanan motor/mobil, harga Rupiah, pencarian, filter, aktif/nonaktif, proteksi hapus |
| **Kasir (POS)** | Dua panel (layanan + keranjang), diskon nominal, 3 metode bayar, kembalian otomatis, verifikasi QRIS/Transfer |
| **Struk** | Pratinjau & cetak thermal 80mm (`window.print()`), banner khusus transaksi dibatalkan |
| **Riwayat** | Pencarian invoice/polisi, filter tanggal–kendaraan–metode–status, pagination server-side, detail + cetak ulang, pembatalan ber-alasan |
| **Laporan** | Preset periode + rentang kustom (zona WIB), grafik harian, breakdown metode bayar, rekap harian, **export CSV** (ringkasan & per-transaksi) |

## Teknologi

- **React 19** + **TypeScript 7** (strict) + **Vite 8**
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI) + **lucide-react**
- **React Router 7**, **React Hook Form + Zod**, **Recharts 3**, **sonner**
- **Supabase JS 2** (PostgreSQL + Row Level Security + RPC)
- Code-splitting per halaman (React.lazy + Suspense)

## Prasyarat

- Node.js ≥ 20 dan npm
- Akun Supabase (paket gratis sudah cukup)

---

## 1. Setup Database (Supabase)

1. Buat project baru di [supabase.com](https://supabase.com), catat password database-nya.
2. Buka **SQL Editor**, jalankan **berurutan** (satu file per kali jalan):

   | Urutan | File | Isi |
   |--------|------|-----|
   | 1 | `supabase/migrations/001_initial_schema.sql` | Tabel `profiles`, `services`, `transactions`, `transaction_items`, FK, constraint, index, trigger `updated_at` & auto-profil admin |
   | 2 | `supabase/migrations/002_rls_policies.sql` | Row Level Security semua tabel, kebijakan akses, revoke privilege (client tidak bisa menulis transaksi langsung) |
   | 3 | `supabase/migrations/003_functions_rpc.sql` | RPC `create_transaction`, `cancel_transaction`, `get_dashboard_summary`, `get_report` (zona Asia/Jakarta) + grant ke role `authenticated` |
   | 4 | `supabase/migrations/004_seed.sql` | 8 layanan contoh motor & mobil (idempotent) |

3. **Pengaturan keamanan penting** — buka **Authentication → Providers → Email**
   dan **matikan "Allow new users to sign up"**. Setiap user auth baru otomatis
   mendapat profil admin (trigger `on_auth_user_created`), jadi hanya Anda
   yang boleh membuat akun lewat dashboard.

## 2. Buat Akun Admin

Akun admin **tidak bisa didaftarkan lewat aplikasi** (by design).

1. Supabase Dashboard → **Authentication → Users → Add user**
2. Isi **email + password**, centang *Auto Confirm User*
3. Trigger database otomatis membuat baris profil admin-nya — nama tampilan
   bisa diubah dari metadata user (`full_name`) atau langsung di tabel `profiles`.

## 3. Konfigurasi Environment

```bash
cp .env.example .env
```

Isi dari **Supabase Dashboard → Project Settings → API**:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-anon-key>
```

> Kedua nilai ini **aman untuk frontend** (anon/publishable key tetap dilindungi RLS).
> **Jangan pernah** menaruh `service_role` key (`sb_secret_...`) di project ini —
> key tersebut melewati Row Level Security.

## 4. Menjalankan Aplikasi

```bash
npm install      # pasang dependencies
npm run dev      # development server → http://localhost:5173
npm run build    # build produksi + verifikasi TypeScript (tsc -b)
npm run preview  # pratinjau hasil build produksi
```

---

## Struktur Proyek

```
src/
├── components/
│   ├── pos/                 # ServiceCard, CheckoutConfirmDialog, CheckoutSuccessDialog, Receipt
│   ├── history/             # CancelTransactionDialog
│   ├── shared/              # PageHeader, StatCard, EmptyState, ErrorState, badges, FullScreenLoader
│   ├── ui/                  # komponen shadcn/ui
│   ├── ProtectedRoute.tsx   # guard sesi admin
│   └── AppErrorBoundary.tsx # batas error aplikasi
├── hooks/                   # useAuth, useDashboard, usePosCart, usePosServices,
│                            # useTransactions, useReport, useDebouncedValue
├── layouts/AdminLayout.tsx  # sidebar gelap (lg+) + drawer (mobile) + topbar
├── lib/                     # supabase.ts, format.ts (WIB), constants.ts, periods.ts, csv.ts
├── pages/                   # Dashboard, Pos, Services, History, HistoryDetail, Reports, Login, NotFound
├── services/                # transaction.service.ts, services.service.ts, dashboard.service.ts
└── types/database.types.ts  # tipe hasil skema & RPC
supabase/migrations/         # 4 file SQL (schema → RLS → RPC → seed)
```

## Model Database

- **`profiles`** — profil admin (1:1 `auth.users`), dibuat otomatis oleh trigger.
- **`services`** — master layanan; nama unik per jenis kendaraan, harga > 0,
  `is_active`; **tidak boleh dihapus** jika sudah dipakai transaksi (FK restrict).
- **`transactions`** — header: nomor invoice unik `INV-YYMMDD-NNNN` (sequence
  harian WIB + advisory lock), subtotal/diskon/total dengan constraint
  `total = subtotal − discount`, konsistensi tunai (`cash_received ≥ total`
  untuk cash, `null` untuk QRIS/transfer).
- **`transaction_items`** — detail dengan **snapshot** nama & harga layanan;
  perubahan harga master tidak memengaruhi riwayat lama.

Status pembayaran: `pending` → `paid` → `cancelled` (dengan alasan wajib ≥ 3 karakter).

## Aturan Bisnis di Sisi Database

Keamanan dirancang agar frontend **tidak bisa** mengubah angka penting:

1. Semua tabel ber-**RLS**; `anon` (belum login) tidak punya akses apa pun.
2. Client **tidak punya grant insert/update/delete** pada tabel transaksi —
   penulisan hanya lewat RPC `security definer`:
   - `create_transaction` — harga diambil murni dari tabel `services`
     (frontend hanya mengirim `service_id` + quantity), validasi layanan aktif
     & cocok jenis kendaraan, diskon ≤ subtotal, tunai ≥ total, atomic.
   - `cancel_transaction` — hanya admin, alasan wajib, tidak bisa dua kali.
3. Hanya **publishable/anon key** yang dipakai frontend.
4. Export/laporan membaca lewat kebijakan select `authenticated`.

## Zona Waktu

Semua batas "hari ini"/rentang dihitung di **Asia/Jakarta (WIB)** — di database
(RPC) dan di aplikasi (`src/lib/format.ts`, `src/lib/periods.ts`). Laporan &
export CSV memakai tanggal WIB, termasuk kolom `Tanggal (WIB)`.

## Cetak Struk Thermal 80mm

- Struk ber-class `.print-area`; CSS `@media print` menyembunyikan UI lain dan
  memakai `@page { size: 80mm auto; margin: 4mm; }`.
- Cetak dari dialog sukses kasir atau tombol **Cetak Struk** di detail transaksi.
- Transaksi yang dibatalkan mencetak dengan banner merah **TRANSAKSI DIBATALKAN**.
- Pratinjau browser: atur printer ke ukuran kertas 80mm (roll) & margin none.

## Deployment

1. `npm run build` → hasil di `dist/`.
2. Vercel / Netlify / Cloudflare Pages:
   - Build command `npm run build`, output `dist`.
   - Tambahkan env `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY`
     (nilai `VITE_*` dibaca saat build, bukan runtime).
   - Aktifkan SPA fallback (rewrite semua rute ke `/index.html`) agar
     refresh di `/pos`, `/history`, dst. tidak 404.

---

## Checklist Pengujian Manual

**Auth**
- [ ] Akses `/` tanpa login → dialihkan ke `/login`; setelah login kembali ke halaman semula.
- [ ] Logout → sesi hilang, refresh tetap keluar.

**Layanan**
- [ ] Tambah layanan baru (motor & mobil) muncul di daftar dan di panel kasir.
- [ ] Hapus layanan yang sudah pernah ditransaksikan → ditolak dengan saran menonaktifkan.
- [ ] Toggle nonaktif → hilang dari panel kasir.

**Kasir (POS)**
- [ ] Tambah item, ubah qty (+/−), diskon > subtotal ditolak.
- [ ] Cash: uang kurang → tombol terkunci; `Uang Pas` / chip cepat → kembalian benar.
- [ ] QRIS/Transfer: wajib centang "sudah diverifikasi" sebelum bisa diproses.
- [ ] Struk muncul & tercetak; klik Transaksi Baru → keranjang bersih.

**Riwayat**
- [ ] Cari invoice & nomor polisi (parsial), filter kombinasi, pagination.
- [ ] Detail: item dengan harga snapshot; batalkan dengan alasan → badge Dibatalkan + banner di struk + tidak dihitung dashboard/laporan.

**Laporan**
- [ ] Preset & rentang kustom (tanggal terbalik otomatis ditukar).
- [ ] Footer rekap harian = kartu ringkasan.
- [ ] Export Ringkasan & Export Transaksi terbuka rapi di Excel (pemisah `;`, BOM).

**Responsif**
- [ ] Mobile: sidebar jadi drawer, tabel menyembunyikan kolom sekunder, dialog dapat digulir.

## Status Pengembangan

| Fase | Ruang Lingkup | Status |
|------|---------------|--------|
| 1 | Fondasi proyek + skema database (migrations, RLS, RPC, seed) | ✅ Selesai |
| 2 | Supabase client, autentikasi admin, layout + sidebar | ✅ Selesai |
| 3 | Dashboard + CRUD layanan | ✅ Selesai |
| 4 | POS transaksi, invoice, struk | ✅ Selesai |
| 5 | Riwayat transaksi + pembatalan | ✅ Selesai |
| 6 | Laporan pendapatan + export | ✅ Selesai |
| 7 | Audit keamanan, code-splitting, responsif, dokumentasi | ✅ Selesai |

**Semua fase selesai.** Aplikasi siap diuji end-to-end dan dideploy.
