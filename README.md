# Pandawa Steam

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
| **Antrian** | Nomor urut harian (reset WIB), papan menunggu→dipanggil→dikerjakan→selesai, kabar tiap tahap **via WhatsApp**, jalan pintas ke kasir, nomor antrian ikut di struk |
| **Struk** | Pratinjau & cetak thermal 80mm (`window.print()`), banner khusus transaksi dibatalkan, **kirim via WhatsApp pelanggan** (`wa.me`, pesan struk terisi otomatis) |
| **Riwayat** | Pencarian invoice/polisi, filter tanggal–kendaraan–metode–status, pagination server-side, detail + cetak ulang, pembatalan ber-alasan |
| **Karyawan** | CRUD karyawan pengerjakan (telepon, jabatan), persen komisi per karyawan, aktif/nonaktif |
| **Komisi** | Komisi dihitung otomatis di database saat checkout (persen × total setelah diskon, snapshot), laporan per karyawan + rincian transaksi + **export Excel**, kartu komisi hari ini di dashboard |
| **Laporan** | Preset periode + rentang kustom (zona WIB), grafik harian, breakdown metode bayar, rekap harian, **export Excel (.xlsx) berformat** (ringkasan & per-transaksi) |
| **Prediksi Omzet** | Holt-Winters aditif (musiman mingguan, dihitung di frontend tanpa API) — proyeksi 7/14/30 hari + pita ±1σ + metrik akurasi MAPE/MAE dari backtest |
| **Asisten Data (Chat)** | Chatbot Gemini di Edge Function — tanya pendapatan/transaksi/komisi dalam bahasa Indonesia; tool memanggil RPC **dengan token user** (RLS tetap berlaku); verifikasi admin di server; tombol melayang di semua halaman |

## Teknologi

- **React 19** + **TypeScript 7** (strict) + **Vite 8**
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI) + **lucide-react**
- **React Router 7**, **React Hook Form + Zod**, **Recharts 3**, **sonner**
- **ExcelJS** (lazy-loaded) untuk export laporan .xlsx berformat
- **Supabase JS 2** (PostgreSQL + Row Level Security + RPC) + **Edge Functions** (Deno)
- **Gemini API** (`gemini-3.5-flash-lite` via secret `GEMINI_MODEL`, function calling) untuk asisten data
- Code-splitting per halaman (React.lazy + Suspense)

## Prasyarat

- Node.js ≥ 20 dan npm
- Akun Supabase (paket gratis sudah cukup)
- *(Opsional, untuk asisten data)* API key Google AI Studio — gratis: https://aistudio.google.com/apikey

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
   | 5 | `supabase/migrations/005_employees.sql` | Tabel `employees` (karyawan + persen komisi) + RLS admin-only |
   | 6 | `supabase/migrations/006_transaction_commission.sql` | Kolom komisi di `transactions`, update RPC `create_transaction` (hitung & snapshot komisi di database), RPC `get_commission_report`, `get_dashboard_summary` + `today_commission` |
   | 7 | `supabase/migrations/007_forecast.sql` | RPC `get_revenue_history(p_days)` — deret pendapatan harian WIB (hanya lunas, hari kosong = 0) untuk prediksi omzet |
   | 8 | `supabase/migrations/008_transaction_whatsapp.sql` | Kolom `customer_phone` di `transactions` + RPC `create_transaction` menerima `p_customer_phone` (normalisasi 08xx → 628xx) untuk kirim struk via WhatsApp |
   | 9 | `supabase/migrations/009_queue.sql` | Tabel `queue_entries` (antrian harian, status bertahap, kaitan transaksi) + RPC `create_queue_entry`, `update_queue_status`, `get_queue_today` |

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

## 5. Deploy Asisten Data (Edge Function + Gemini) — Opsional

Fitur chat butuh **1 secret** (`GEMINI_API_KEY`) dan fungsi yang di-deploy.
API key gratis dari https://aistudio.google.com/apikey.

**Cara A — via Dashboard (tanpa CLI, paling mudah):**
1. Supabase Dashboard → **Edge Functions** → **Create a new function** →
   pilih opsi **Deploy via editor** → beri nama `chat`.
2. Buka fungsi tersebut → **Edit code** → ganti seluruh isinya dengan
   `supabase/functions/chat/index.ts` dari repo ini → **Deploy**.
3. Dashboard → **Edge Functions → Secrets** (atau Project Settings →
   Edge Functions) → tambahkan secret `GEMINI_API_KEY` = API key Anda.
4. Selesai — tombol 💬 di aplikasi langsung aktif.

**Cara B — via Supabase CLI:**

```bash
npx supabase login                          # login (buka browser)
npx supabase link --project-ref <REF>       # REF = id project (Dashboard → Settings)
npx supabase secrets set GEMINI_API_KEY=xxxx
npx supabase functions deploy chat
```

> Catatan: `npx supabase` bisa gagal pada sebagian setup Windows
> ("No matching binary package"). Solusi: pasang CLI global lewat Scoop
> (`scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`
> lalu `scoop install supabase`) atau unduh `supabase_windows_amd64.zip`
> dari https://github.com/supabase/cli/releases — atau pakai Cara A.

**Keamanan yang sudah tertanam di fungsi:**
- JWT diverifikasi (gateway `verify_jwt` + `auth.getUser`) dan wajib admin
  (`public.is_admin()`) — non-admin dapat 403.
- Tool dieksekusi dengan **token user**, bukan service role → RLS tetap
  berlaku dan fungsi tidak pernah membuka data lebih dari yang boleh.
- API key hanya hidup sebagai secret server-side, tidak pernah ke frontend.

**Biaya:** paket gratis Supabase menyertakan kuota Edge Function; Gemini
free tier cukup untuk pemakaian admin harian.

**Troubleshooting** — pesan error di panel chat dan artinya:
- *"Tidak dapat menghubungi asisten... belum di-deploy"* → fungsi belum ada:
  cek **Edge Functions** — harus ada fungsi bernama persis `chat`
  (404 = nama salah / belum deploy).
- *"Asisten mengalami error saat berjalan"* → fungsi ada tapi crash:
  buka **Edge Functions → Logs** (biasanya `GEMINI_API_KEY` belum diset,
  atau kode template bawaan belum diganti seluruhnya).
- *"GEMINI_API_KEY belum diatur"* → tambahkan secret di
  **Edge Functions → Secrets** lalu tunggu ±1 menit.
- *"This model ... is no longer available to new users"* → model Gemini yang
  dipakai sudah dihentikan Google. Ganti nama model TANPA edit kode:
  tambahkan secret `GEMINI_MODEL` = nama model terbaru (mis.
  `gemini-3.8-flash`) di **Edge Functions → Secrets**, lalu deploy ulang
  fungsi. Kode ini default ke `gemini-3.5-flash-lite`.
- **Chat terasa lambat (beberapa detik)** → penyebab utamanya adalah model:
  `gemini-3.8-flash` (reasoning) berpikir sebelum menjawab di setiap putaran.
  Kode ini kini default ke `gemini-3.5-flash-lite` — model paling cepat
  (thinking default "minimal", penerus resmi `gemini-2.5-flash`). Kode juga
  mencatat durasi tiap putaran ke log — cek **Edge Functions → Logs**
  (`chat: Gemini putaran N selesai dalam X ms`) untuk melihat sisa waktu
  di mana. Kalau log tidak muncul berarti fungsi belum di-re-deploy.
- **"Sesi login tidak valid atau sudah kedaluwarsa"** → permintaan ditolak
  platform Supabase sebelum fungsi berjalan (token sesi tidak ikut / tidak
  valid — bukan masalah Gemini). **Keluar (logout) lalu login ulang**, lalu
  coba lagi. Frontend kini melakukan pre-flight sesi dan menampilkan
  penyebab asli — tidak lagi tertutup pesan generik
  "Asisten gagal merespons. Coba lagi." (Penyebab teknis: dengan key
  format baru `sb_publishable_…`, `functions.invoke` tidak mengirim
  header `Authorization` bila token sesi tidak tersedia, dan body penolakan
  platform `{code, message}` tidak punya field `error`.)

**Editor VS Code menampilkan merah/error di `supabase/functions/chat/index.ts`?**
Itu normal — VS Code tanpa ekstensi Deno tidak mengenal modul `npm:`/`jsr:`
dan global `Deno`. Tidak memengaruhi `npm run build` maupun deploy
(file ini tidak dikompilasi tsc). Solusi rapi: pasang ekstensi
**Deno** (`denoland.vscode-deno`) — `.vscode/settings.json` di repo sudah
mengaktifkannya hanya untuk folder `supabase/functions`.

**Arah copy-paste saat deploy**: dari **VS Code → dashboard editor**
(Ctrl+A, Delete, Ctrl+V di editor dashboard), BUKAN dari dashboard → lokal.
Menyalin template dashboard ke file lokal akan menimpa kode fungsi chat.

---

## Struktur Proyek

```
src/
├── components/
│   ├── pos/                 # ServiceCard, CheckoutConfirmDialog, CheckoutSuccessDialog, Receipt
│   ├── history/             # CancelTransactionDialog
│   ├── employees/           # EmployeeFormDialog
│   ├── reports/             # RevenueForecastCard (prediksi omzet)
│   ├── chat/                # ChatWidget (asisten data Gemini)
│   ├── shared/              # PageHeader, StatCard, EmptyState, ErrorState, badges, FullScreenLoader
│   ├── ui/                  # komponen shadcn/ui
│   ├── ProtectedRoute.tsx   # guard sesi admin
│   └── AppErrorBoundary.tsx # batas error aplikasi
├── hooks/                   # useAuth, useDashboard, usePosCart, usePosServices,
│                            # useTransactions, useReport, useForecast, useEmployees,
│                            # useCommissionReport, useDebouncedValue
├── layouts/AdminLayout.tsx  # sidebar rail hover-expand (lg+) + drawer (mobile) + topbar
├── lib/                     # supabase.ts, format.ts (WIB), constants.ts, periods.ts, csv.ts,
│                            # forecast.ts (Holt-Winters + MAPE), validators.ts, errors.ts
├── pages/                   # Dashboard, Pos, Services, Employees, History, HistoryDetail,
│                            # Commissions, Reports, Login, NotFound
├── services/                # transaction.service.ts, services.service.ts, employee.service.ts,
│                            # commission.service.ts, auth.service.ts
└── types/database.types.ts  # tipe hasil skema & RPC
supabase/migrations/         # 8 file SQL (schema → RLS → RPC → seed → karyawan → komisi → prediksi → WhatsApp)
supabase/functions/chat/     # Edge Function asisten data (Deno, Gemini function calling)
```

## Model Database

- **`profiles`** — profil admin (1:1 `auth.users`), dibuat otomatis oleh trigger.
- **`services`** — master layanan; nama unik per jenis kendaraan, harga > 0,
  `is_active`; **tidak boleh dihapus** jika sudah dipakai transaksi (FK restrict).
- **`employees`** — karyawan pengerjakan (tanpa akun login); nama unik,
  `commission_percent` 0–100, `is_active`; tidak boleh dihapus jika sudah
  ditugaskan di transaksi (FK restrict).
- **`transactions`** — header: nomor invoice unik `INV-YYMMDD-NNNN` (sequence
  harian WIB + advisory lock), subtotal/diskon/total dengan constraint
  `total = subtotal − discount`, konsistensi tunai (`cash_received ≥ total`
  untuk cash, `null` untuk QRIS/transfer), plus `employee_id` dan
  **snapshot `commission_amount`**.
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
     Karyawan (opsional) harus aktif; **komisi = floor(total × persen/100)
     dihitung di database** dan di-snapshot ke `commission_amount`.
   - `cancel_transaction` — hanya admin, alasan wajib, tidak bisa dua kali.
     Karena laporan komisi hanya menghitung transaksi `paid`, pembatalan
     otomatis membatalkan komisinya.
3. Hanya **publishable/anon key** yang dipakai frontend.
4. Export/laporan membaca lewat kebijakan select `authenticated`.

## Zona Waktu

Semua batas "hari ini"/rentang dihitung di **Asia/Jakarta (WIB)** — di database
(RPC) dan di aplikasi (`src/lib/format.ts`, `src/lib/periods.ts`). Laporan &
export Excel memakai tanggal WIB, termasuk kolom `Tanggal (WIB)`.

## Export Excel (.xlsx)

Export laporan menghasilkan file **Excel berformat profesional** (bukan CSV):

- **Laporan → Export Ringkasan** — sheet berisi blok statistik periode
  + tabel rekap harian dengan baris Total.
- **Laporan → Export Transaksi** — rincian per transaksi (harga & komisi
  tetap angka murni, bisa di-SUM), baris transaksi dibatalkan disorot merah,
  header dibekukan (frozen) + tombol filter bawaan Excel.
- **Komisi → Export Excel** — rekap per karyawan + rincian transaksi.

Penyusunan file (`src/lib/excel-export.ts`): judul & info periode digabung
(merged) di atas tabel, header biru bold putih, baris data zebra + border,
kolom uang memakai format angka `#,##0`, halaman siap cetak (landscape,
fit-to-width). Library ExcelJS dimuat **lazy** — hanya saat tombol export
pertama kali ditekan.

## Cetak Struk Thermal 80mm

- Struk ber-class `.print-area`; CSS `@media print` menyembunyikan UI lain dan
  memakai `@page { size: 80mm auto; margin: 4mm; }`.
- Cetak dari dialog sukses kasir atau tombol **Cetak Struk** di detail transaksi.
- Transaksi yang dibatalkan mencetak dengan banner merah **TRANSAKSI DIBATALKAN**.
- Pratinjau browser: atur printer ke ukuran kertas 80mm (roll) & margin none.

## Kirim Struk via WhatsApp

Selain dicetak, struk bisa dikirim ke pelanggan lewat WhatsApp:

1. Isi **No. WhatsApp Pelanggan** (opsional) di form kasir — dinormalisasi ke
   format internasional `62…` dan tersimpan di kolom `transactions.customer_phone`.
2. Setelah transaksi tersimpan, dialog sukses menampilkan tombol
   **Kirim via WhatsApp** — pesan berisi struk (invoice, item, total, metode
   bayar) sudah terisi; admin tinggal menekan tombol kirim.
3. Bisa juga dikirim ulang kapan saja dari **Riwayat → Detail Transaksi**
   bila nomor tercatat (tombol muncul otomatis).
4. Nomor juga bisa diisi/diedit langsung di dialog sukses (dipakai sekali
   untuk kirim, tanpa mengubah transaksi — penulisan transaksi memang
   hanya boleh via RPC).

**Cara kerja & keamanan**: memakai link `wa.me` resmi WhatsApp (gratis,
tanpa API WhatsApp Business dan tanpa kredensial pihak ketiga) — pesan
disusun di browser, lalu aplikasi/WhatsApp Web terbuka dengan pesan siap
kirim dari nomor WhatsApp admin sendiri. Pesan ke pelanggan TIDAK
memuat data internal (komisi, nama kasir).

## Antrian + Kabar WhatsApp

Antrian dikelola di aplikasi; WhatsApp menjadi saluran kabar ke pelanggan
(pola `wa.me` yang sama — tanpa bot/API, jadi tidak bisa membaca pesan
masuk):

1. **Daftarkan antrian** di halaman *Antrian*: nama, No. WhatsApp (opsional),
   plat, jenis kendaraan, layanan & catatan. Nomor urut dihitung database
   secara atomik dan **reset setiap hari (WIB)** — 01, 02, 03, …
2. **Papan antrian** tiga kolom — *Menunggu / Dipanggil / Dikerjakan* —
   plus riwayat selesai/batal. Papan menyegarkan otomatis tiap 30 detik.
3. **Kabar WhatsApp per tahap** — tombol *WA* di setiap kartu menyusun
   pesan sesuai status: sambutan + perkiraan tunggu (menunggu), "bersiap"
   (dipanggil), "sedang dikerjakan", dan "sudah selesai, silakan ke kasir".
   Kartu berstatus *dikerjakan* juga punya tombol *Sudah Dicuci* untuk
   mengabari pelanggan bahwa kendaraannya sudah rampung dicuci — tanpa
   mengubah status antrian.
4. **Buat Transaksi** dari kartu antrian (dipanggil/dikerjakan) membuka
   kasir dengan pelanggan, plat, No. WA, jenis kendaraan, dan layanan
   terisi otomatis. Setelah checkout sukses, antrian **otomatis ditandai
   selesai** dan dihubungkan ke invoice-nya (`queue_entries.transaction_id`).
5. **Struk** (cetak & WhatsApp) menampilkan baris *No. Antrian* bila
   transaksi berasal dari antrian.

Aturan transisi divalidasi di database (RPC `update_queue_status`): loncat
tahap diperbolehkan (mis. dipanggil → selesai langsung bayar), antrian
`selesai`/`batal` tidak bisa diubah lagi, dan pembatalan wajib alasan
(minimal 3 karakter). Statistik rata-rata waktu tunggu & pengerjaan
diambil dari 7 hari terakhir untuk perkiraan menunggu.

## Deployment

1. `npm run build` → hasil di `dist/`.
2. Vercel / Netlify / Cloudflare Pages:
   - Build command `npm run build`, output `dist`.
   - Tambahkan env `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY`
     (nilai `VITE_*` dibaca saat build, bukan runtime).
   - Aktifkan SPA fallback (rewrite semua rute ke `/index.html`) agar
     refresh di `/pos`, `/history`, dst. tidak 404.
3. Edge Function `chat` di-deploy terpisah lewat Dashboard/CLI —
   lihat bagian *Deploy Asisten Data*; tidak ikut build frontend.

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

**Kirim Struk via WhatsApp** (setelah migrasi 008)
- [ ] Isi No. WhatsApp di form kasir → tersimpan; dialog sukses terisi otomatis.
- [ ] Kirim via WhatsApp → aplikasi/WA Web terbuka dengan pesan struk siap kirim (isi: invoice, item, total, metode — tanpa komisi/kasir).
- [ ] Nomor kosong → tombol kirim terkunci sampai nomor diisi & valid.
- [ ] Nomor tidak valid (mis. "abc") → form kasir menampilkan peringatan & tombol bayar terkunci.
- [ ] Riwayat → Detail transaksi yang punya nomor → tombol "Kirim via WhatsApp" tampil & berfungsi.
- [ ] Transaksi tanpa nomor → tombol tidak muncul di Riwayat (data tidak tersedia).

**Riwayat**
- [ ] Cari invoice & nomor polisi (parsial), filter kombinasi, pagination.
- [ ] Detail: item dengan harga snapshot; batalkan dengan alasan → badge Dibatalkan + banner di struk + tidak dihitung dashboard/laporan.

**Karyawan & Komisi**
- [ ] Tambah karyawan (mis. 10%) → muncul di dropdown kasir.
- [ ] Transaksi dengan karyawan → struk berisi "Operator", dashboard "Komisi Hari Ini" naik, halaman Komisi menampilkan rekap & rincian.
- [ ] Batalkan transaksi berkomisi → komisi tidak lagi terhitung di laporan.
- [ ] Hapus karyawan yang sudah ditugaskan → ditolak dengan saran nonaktifkan.
- [ ] Ubah persen komisi → hanya berlaku untuk transaksi selanjutnya (snapshot).

**Laporan**
- [ ] Preset & rentang kustom (tanggal terbalik otomatis ditukar).
- [ ] Footer rekap harian = kartu ringkasan.
- [ ] Export Ringkasan & Export Transaksi menghasilkan .xlsx rapi di Excel (header biru, zebra, angka bisa di-SUM, transaksi dibatalkan merah).

**Prediksi Omzet** (setelah migrasi 007)
- [ ] Buka Laporan → kartu "Proyeksi Omzet" tampil: garis riwayat + garis proyeksi putus-putus + pita kisaran.
- [ ] Ganti horizon 7/14/30 hari → grafik & "Proyeksi N hari" berubah tanpa loading lama (hitung lokal).
- [ ] Badge MAPE/MAE dan parameter α/β/γ tampil; angka wajar (MAPE < 100% pada data cukup teratur).
- [ ] Akun baru / data < 21 hari → empty state "Data belum cukup untuk diprediksi".

**Asisten Data** (setelah deploy Edge Function + secret GEMINI_API_KEY)
- [ ] Tombol 💬 kanan-bawah → panel chat terbuka; pesan sambutan tampil.
- [ ] "Berapa pendapatan hari ini?" → jawaban memakai angka riil dari `get_dashboard_summary` (WIB).
- [ ] "Komisi minggu ini?" → jawaban dari `get_commission_report` (Senin–hari ini).
- [ ] "Pendapatan bulan ini?" → jawaban dari `get_report` (tanggal 1 s.d. hari ini).
- [ ] Tombol reset menghapus percakapan; ikon mengetik muncul saat menunggu.
- [ ] Tanpa secret `GEMINI_API_KEY` → pesan error ramah ("belum diatur"), bukan crash.

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
| 8 | Kelola karyawan + komisi otomatis per transaksi | ✅ Selesai |
| 9 | Prediksi omzet (Holt-Winters + MAPE, tanpa API) | ✅ Selesai |
| 10 | Asisten data (chatbot Gemini via Edge Function) | ✅ Selesai |
| 11 | Kirim struk via WhatsApp pelanggan (wa.me) | ✅ Selesai |
| 12 | Antrian harian + kabar WhatsApp per tahap + terhubung POS | ✅ Selesai |

**Fase 1–12 selesai.** Aplikasi siap diuji end-to-end dan dideploy.
