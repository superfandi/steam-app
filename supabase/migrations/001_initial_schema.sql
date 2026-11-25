-- ============================================================================
-- Mtwo Steam - 001_initial_schema.sql
-- Tabel inti: profiles, services, transactions, transaction_items
-- Konvensi:
--   * Primary key  : UUID (gen_random_uuid)
--   * Uang         : integer rupiah (tanpa desimal)
--   * Timestamp    : timestamptz (UTC di database, ditampilkan sesuai
--                    zona waktu Asia/Jakarta di aplikasi & laporan)
-- Jalankan di Supabase SQL Editor dengan urutan: 001 -> 002 -> 003 -> 004
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES - profil admin (1:1 dengan auth.users)
--    Baris dibuat otomatis oleh trigger on_auth_user_created (di bawah).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default 'Admin',
  role        text not null default 'admin' check (role in ('admin')),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Profil pengguna Mtwo Steam (admin), terhubung 1:1 dengan auth.users.';

-- ---------------------------------------------------------------------------
-- 2. SERVICES - master layanan pencucian
--    Layanan yang sudah pernah dipakai di transaksi TIDAK BOLEH dihapus
--    (FK on delete restrict) - cukup dinonaktifkan via is_active.
-- ---------------------------------------------------------------------------
create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  vehicle_type  text not null check (vehicle_type in ('motor', 'mobil')),
  price         integer not null check (price > 0),
  description   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint services_name_vehicle_type_key unique (name, vehicle_type),
  constraint services_name_not_blank check (char_length(btrim(name)) > 0)
);

comment on table public.services is
  'Master layanan pencucian (harga rupiah bulat, jenis kendaraan: motor/mobil).';

-- ---------------------------------------------------------------------------
-- 3. TRANSACTIONS - header transaksi POS
--    payment_status:
--      pending   -> dibuat tapi belum dibayar (dipakai alur manual/luar RPC)
--      paid      -> sudah dibayar & diverifikasi admin (dianggap pendapatan)
--      cancelled -> dibatalkan admin dengan alasan (bukan pendapatan)
--    Subtotal, discount, total, dan uang tunai HARUS konsisten
--    (dijamin constraint di bawah + validasi RPC create_transaction).
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique,
  cashier_id      uuid references public.profiles (id) on delete set null,
  customer_name   text,
  plate_number    text,
  vehicle_type    text not null check (vehicle_type in ('motor', 'mobil')),
  subtotal        integer not null check (subtotal >= 0),
  discount        integer not null default 0 check (discount >= 0),
  total           integer not null check (total >= 0),
  payment_method  text not null check (payment_method in ('cash', 'qris', 'transfer')),
  payment_status  text not null default 'paid'
                  check (payment_status in ('pending', 'paid', 'cancelled')),
  cash_received   integer check (cash_received is null or cash_received >= 0),
  cash_change     integer check (cash_change is null or cash_change >= 0),
  cancel_reason   text,
  paid_at         timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint transactions_amounts_consistent
    check (total = subtotal - discount),
  constraint transactions_cash_consistent
    check (
      (payment_method = 'cash'
         and cash_received is not null
         and cash_change is not null
         and cash_received >= total)
      or
      (payment_method in ('qris', 'transfer')
         and cash_received is null
         and cash_change is null)
    )
);

comment on table public.transactions is
  'Header transaksi POS. Invoice unik format INV-YYMMDD-NNNN (sequence harian zona Asia/Jakarta).';

-- ---------------------------------------------------------------------------
-- 4. TRANSACTION_ITEMS - detail layanan per transaksi
--    Snapshot nama & harga layanan: harga disalin saat transaksi dibuat
--    agar perubahan harga master TIDAK mengubah riwayat transaksi lama.
-- ---------------------------------------------------------------------------
create table if not exists public.transaction_items (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  service_id     uuid not null references public.services (id) on delete restrict,
  service_name   text not null,
  service_price  integer not null check (service_price >= 0),
  quantity       integer not null check (quantity > 0),
  subtotal       integer not null check (subtotal = service_price * quantity),
  created_at     timestamptz not null default now()
);

comment on table public.transaction_items is
  'Detail transaksi dengan snapshot nama & harga layanan dari database.';

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
create index if not exists idx_transactions_created_at
  on public.transactions (created_at desc);
create index if not exists idx_transactions_status
  on public.transactions (payment_status);
create index if not exists idx_transactions_method
  on public.transactions (payment_method);
create index if not exists idx_transactions_vehicle
  on public.transactions (vehicle_type);
create index if not exists idx_transactions_cashier
  on public.transactions (cashier_id);
create index if not exists idx_transactions_paid_at
  on public.transactions (paid_at);

create index if not exists idx_transaction_items_txn
  on public.transaction_items (transaction_id);
create index if not exists idx_transaction_items_service
  on public.transaction_items (service_id);

create index if not exists idx_services_vehicle_active
  on public.services (vehicle_type, is_active);

-- ---------------------------------------------------------------------------
-- TRIGGER: updated_at otomatis
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- TRIGGER: profil admin dibuat otomatis saat user baru dibuat di auth.users
-- (akun admin dibuat manual lewat Supabase Dashboard -> Authentication)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Admin'),
    'admin'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
