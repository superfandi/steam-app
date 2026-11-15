-- ============================================================================
-- WASH POS - 002_rls_policies.sql
-- Row Level Security + kebijakan akses + penguatan privilege.
--
-- Model keamanan WASH POS:
--   * Semua tabel: RLS ENABLED. Anon (belum login) TIDAK punya akses apa pun.
--   * profiles     : admin hanya boleh baca/ubah barisnya sendiri.
--   * services     : admin boleh CRUD (kebijakan is_admin).
--   * transactions &
--     transaction_items :
--       - Baca: admin (authenticated) boleh baca semua (untuk dashboard,
--         riwayat, laporan).
--       - Tulis: TIDAK ada grant insert/update/delete untuk client.
--         Penulisan HANYA melalui RPC create_transaction & cancel_transaction
--         (migrasi 003, SECURITY DEFINER) sehingga harga wajib diambil dari
--         database dan aturan bisnis tidak bisa dilewati dari frontend.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- HELPER: apakah user yang sedang login adalah admin?
-- SECURITY DEFINER agar tidak rekursif dengan RLS tabel profiles sendiri.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- AKTIFKAN RLS DI SEMUA TABEL
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.services           enable row level security;
alter table public.transactions       enable row level security;
alter table public.transaction_items  enable row level security;

-- ---------------------------------------------------------------------------
-- POLICIES: profiles (baca/ubah baris sendiri)
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- POLICIES: services (baca semua layanan; tulis hanya admin)
-- ---------------------------------------------------------------------------
drop policy if exists "services_select_authenticated" on public.services;
create policy "services_select_authenticated"
  on public.services
  for select to authenticated
  using (true);

drop policy if exists "services_insert_admin" on public.services;
create policy "services_insert_admin"
  on public.services
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "services_update_admin" on public.services;
create policy "services_update_admin"
  on public.services
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "services_delete_admin" on public.services;
create policy "services_delete_admin"
  on public.services
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- POLICIES: transactions & transaction_items (hanya baca)
-- Tidak ada policy insert/update/delete -> client tidak bisa menulis.
-- ---------------------------------------------------------------------------
drop policy if exists "transactions_select_authenticated" on public.transactions;
create policy "transactions_select_authenticated"
  on public.transactions
  for select to authenticated
  using (true);

drop policy if exists "transaction_items_select_authenticated"
  on public.transaction_items;
create policy "transaction_items_select_authenticated"
  on public.transaction_items
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- PENGUATAN PRIVILEGE (defense in depth, di luar RLS)
-- ---------------------------------------------------------------------------
-- Anon / public tidak diberi akses apa pun ke tabel.
revoke all on public.profiles          from anon;
revoke all on public.services          from anon;
revoke all on public.transactions      from anon;
revoke all on public.transaction_items from anon;

-- Client tidak boleh menulis transaksi/detail secara langsung.
-- Insert/update transaksi wajib lewat RPC (lihat 003).
revoke insert, update, delete on public.transactions      from authenticated;
revoke insert, update, delete on public.transaction_items from authenticated;
