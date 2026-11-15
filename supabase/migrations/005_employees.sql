-- ============================================================================
-- Pandawa Steam - 005_employees.sql
-- Tabel karyawan pencucian + Row Level Security.
--
-- Model komisi:
--   * commission_percent : persen dari TOTAL transaksi yang ditangani
--     karyawan (0-100). Diatur per karyawan.
--   * Nominal komisi TIDAK dihitung frontend — dihitung & di-snapshot
--     di database oleh RPC create_transaction (migrasi 006).
--   * Karyawan yang sudah pernah ditugaskan di transaksi TIDAK boleh
--     dihapus (FK restrict di migrasi 006) — cukup dinonaktifkan.
--
-- Jalankan setelah 001-004 di Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EMPLOYEES - data karyawan pencucian (tanpa akun login)
-- ---------------------------------------------------------------------------
create table if not exists public.employees (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  phone              text,
  position           text,
  commission_percent integer not null default 0
                     check (commission_percent between 0 and 100),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint employees_name_key unique (name),
  constraint employees_name_not_blank check (char_length(btrim(name)) > 0)
);

comment on table public.employees is
  'Karyawan pencucian (tanpa login). Komisi = commission_percent% dari total transaksi, di-snapshot saat checkout.';

-- ---------------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------------
create index if not exists idx_employees_active_name
  on public.employees (is_active, name);

-- ---------------------------------------------------------------------------
-- 3. TRIGGER: updated_at otomatis (fungsi set_updated_at dari migrasi 001)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS: semua user login boleh baca; tulis hanya admin
-- ---------------------------------------------------------------------------
alter table public.employees enable row level security;

drop policy if exists "employees_select_authenticated" on public.employees;
create policy "employees_select_authenticated"
  on public.employees
  for select to authenticated
  using (true);

drop policy if exists "employees_insert_admin" on public.employees;
create policy "employees_insert_admin"
  on public.employees
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "employees_update_admin" on public.employees;
create policy "employees_update_admin"
  on public.employees
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "employees_delete_admin" on public.employees;
create policy "employees_delete_admin"
  on public.employees
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. PENGUATAN PRIVILEGE: anon tidak punya akses apa pun
-- ---------------------------------------------------------------------------
revoke all on public.employees from anon;
