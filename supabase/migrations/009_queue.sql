-- ============================================================================
-- Mtwo Steam - 009_queue.sql
-- FITUR ANTRIAN + NOTIFIKASI WHATSAPP (Fase 12)
--
-- Ringkasan:
--   * Tabel queue_entries — antrian harian pelanggan dengan nomor urut
--     yang reset setiap hari (zona Asia/Jakarta), status bertahap
--     menunggu → dipanggil → dikerjakan → selesai / batal, dan opsi
--     kaitan ke transaksi POS (transaction_id).
--   * RPC SECURITY DEFINER (satu-satunya pintu menulis, seperti transaksi):
--       1. create_queue_entry   : daftar antrian baru + nomor harian atomik.
--       2. update_queue_status  : pindah status dengan aturan transisi
--                                 + timestamp tiap tahap.
--       3. get_queue_today      : papan antrian hari ini + statistik
--                                 rata-rata waktu (untuk perkiraan tunggu).
--
-- WAJIB DIJALANKAN di Supabase SQL Editor (setelah migrasi 001-008).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabel antrian
-- ---------------------------------------------------------------------------
create table if not exists public.queue_entries (
  id              uuid primary key default gen_random_uuid(),
  -- Nomor urut harian (reset tiap hari WIB): 1, 2, 3, ...
  queue_number    integer not null,
  -- Tanggal antrian (kalender WIB) — kunci reset harian.
  queue_date      date not null,

  customer_name   text,
  -- Nomor WhatsApp pelanggan, format internasional 62… (opsional).
  customer_phone  text,
  plate_number    text,
  vehicle_type    text not null check (vehicle_type in ('motor', 'mobil')),

  -- Layanan yang diminta (opsional) + snapshot nama layanan.
  service_id      uuid references public.services (id) on delete set null,
  service_name    text,
  note            text,

  -- Alur status: menunggu → dipanggil → dikerjakan → selesai | batal
  status          text not null default 'menunggu'
                    check (status in ('menunggu', 'dipanggil', 'dikerjakan',
                                      'selesai', 'batal')),

  -- Terisi bila antrian selesai lalu dibayar lewat POS.
  transaction_id  uuid references public.transactions (id) on delete set null,

  cancel_reason   text,
  called_at       timestamptz,
  started_at      timestamptz,
  done_at         timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (queue_date, queue_number)
);

create index if not exists idx_queue_entries_date
  on public.queue_entries (queue_date, queue_number);
create index if not exists idx_queue_entries_transaction
  on public.queue_entries (transaction_id)
  where transaction_id is not null;

-- updated_at otomatis (fungsi set_updated_at dari migrasi 001).
drop trigger if exists trg_queue_entries_updated_at on public.queue_entries;
create trigger trg_queue_entries_updated_at
  before update on public.queue_entries
  for each row execute function public.set_updated_at();

comment on table public.queue_entries is
  'Antrian harian pelanggan Mtwo Steam — nomor reset per hari WIB, status bertahap, dan dapat terhubung ke transaksi POS.';

-- ---------------------------------------------------------------------------
-- 2. RLS: hanya admin yang boleh membaca; menulis HANYA lewat RPC
--    (pola yang sama dengan transactions — insert/update/delete tanpa
--    kebijakan sehingga otomatis ditolak untuk semua peran).
-- ---------------------------------------------------------------------------
alter table public.queue_entries enable row level security;

drop policy if exists "queue_select_admin" on public.queue_entries;
create policy "queue_select_admin"
  on public.queue_entries
  for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. RPC: DAFTARKAN ANTRIAN BARU (nomor harian atomik)
-- ---------------------------------------------------------------------------
create or replace function public.create_queue_entry(
  -- Aturan Postgres: parameter TANPA default harus di atas parameter
  -- ber-default, maka p_vehicle_type (wajib) diletakkan pertama.
  p_vehicle_type   text,
  p_customer_name  text default null,
  p_customer_phone text default null,
  p_plate_number   text default null,
  p_service_id     uuid default null,
  p_note           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_today      date;
  v_day_start  timestamptz;
  v_seq        integer;
  v_service    public.services;
  v_row        public.queue_entries;
begin
  if not public.is_admin() then
    raise exception 'Akses ditolak: hanya admin yang dapat mendaftarkan antrian';
  end if;

  if p_vehicle_type not in ('motor', 'mobil') then
    raise exception 'Jenis kendaraan tidak valid';
  end if;

  p_customer_name := nullif(btrim(p_customer_name), '');
  p_plate_number  := nullif(upper(btrim(p_plate_number)), '');
  p_note          := nullif(btrim(p_note), '');

  -- Nomor WhatsApp: buang non-digit lalu normalisasi 08xx/8xx -> 62…
  -- (pola sama dengan create_transaction di migrasi 008).
  p_customer_phone := nullif(
    regexp_replace(btrim(coalesce(p_customer_phone, '')), '[^0-9]', '', 'g'),
    ''
  );
  if p_customer_phone is not null then
    if left(p_customer_phone, 1) = '0' then
      p_customer_phone := '62' || substr(p_customer_phone, 2);
    elsif left(p_customer_phone, 1) = '8' then
      p_customer_phone := '62' || p_customer_phone;
    end if;
    if length(p_customer_phone) < 9 or length(p_customer_phone) > 15 then
      raise exception 'Nomor WhatsApp pelanggan tidak valid';
    end if;
  end if;

  -- Layanan opsional: harus aktif & cocok dengan jenis kendaraan.
  if p_service_id is not null then
    select * into v_service
    from public.services s
    where s.id = p_service_id
      and s.is_active = true
      and s.vehicle_type = p_vehicle_type;
    if not found then
      raise exception 'Layanan tidak ditemukan, tidak aktif, atau tidak cocok dengan jenis kendaraan';
    end if;
  end if;

  ------------------------------------------------------------------
  -- Serialisasi nomor antrian harian (anti tabrakan antar-request).
  ------------------------------------------------------------------
  perform pg_advisory_xact_lock(hashtext('mtwo_queue_seq'));

  v_today     := (now() at time zone 'Asia/Jakarta')::date;
  v_day_start := v_today::timestamp at time zone 'Asia/Jakarta';

  select coalesce(count(*), 0) + 1
    into v_seq
  from public.queue_entries
  where queue_date = v_today;

  loop
    exit when not exists (
      select 1 from public.queue_entries q
      where q.queue_date = v_today and q.queue_number = v_seq
    );
    v_seq := v_seq + 1;
  end loop;

  insert into public.queue_entries (
    queue_number, queue_date,
    customer_name, customer_phone, plate_number, vehicle_type,
    service_id, service_name, note, status
  ) values (
    v_seq, v_today,
    p_customer_name, p_customer_phone, p_plate_number, p_vehicle_type,
    p_service_id, v_service.name, p_note, 'menunggu'
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: PINDAH STATUS ANTRIAN (aturan transisi + timestamp tahap)
--    Transisi:
--      menunggu  → dipanggil                    (called_at)
--      menunggu/dipanggil → dikerjakan          (started_at; called_at
--                                                diisi bila kosong agar
--                                                statistik tunggu utuh)
--      menunggu/dipanggil/dikerjakan → selesai  (done_at + kaitan transaksi)
--      menunggu/dipanggil/dikerjakan → batal    (alasan wajib)
--    Loncat tahap diperbolehkan (mis. dipanggil → selesai langsung bayar).
-- ---------------------------------------------------------------------------
create or replace function public.update_queue_status(
  p_queue_id       uuid,
  p_status         text,
  p_transaction_id uuid default null,
  p_cancel_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.queue_entries;
begin
  if not public.is_admin() then
    raise exception 'Akses ditolak: hanya admin yang dapat mengubah antrian';
  end if;

  if p_status not in ('dipanggil', 'dikerjakan', 'selesai', 'batal') then
    raise exception 'Status tidak valid';
  end if;

  select * into v_row
  from public.queue_entries
  where id = p_queue_id;

  if not found then
    raise exception 'Antrian tidak ditemukan';
  end if;

  if v_row.status = 'selesai' then
    raise exception 'Antrian ini sudah selesai';
  end if;
  if v_row.status = 'batal' then
    raise exception 'Antrian ini sudah dibatalkan';
  end if;
  if v_row.status = p_status then
    raise exception 'Antrian ini sudah berstatus tersebut';
  end if;

  -- Status batal wajib alasan (min. 3 karakter, pola cancel_transaction).
  if p_status = 'batal' then
    if p_cancel_reason is null or char_length(btrim(p_cancel_reason)) < 3 then
      raise exception 'Alasan pembatalan wajib diisi (minimal 3 karakter)';
    end if;
  end if;

  update public.queue_entries q
  set status         = p_status,
      called_at      = case
                         when p_status in ('dipanggil', 'dikerjakan')
                           then coalesce(q.called_at, now())
                         else q.called_at
                       end,
      started_at     = case
                         when p_status = 'dikerjakan'
                           then coalesce(q.started_at, now())
                         else q.started_at
                       end,
      done_at        = case when p_status = 'selesai' then now() else q.done_at end,
      cancelled_at   = case when p_status = 'batal'   then now() else q.cancelled_at end,
      cancel_reason  = case when p_status = 'batal'   then btrim(p_cancel_reason)
                            else q.cancel_reason end,
      transaction_id = case
                         when p_status = 'selesai' and p_transaction_id is not null
                           then p_transaction_id
                         else q.transaction_id
                       end
  where q.id = p_queue_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: PAPAN ANTRIAN HARI INI + STATISTIK WAKTU
--    Statistik memakai data 7 hari terakhir agar perkiraan tetap ada
--    walau hari ini masih sepi.
-- ---------------------------------------------------------------------------
create or replace function public.get_queue_today()
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_today     date;
  v_day_start timestamptz;
  v_week_start date;
  v_result    jsonb;
begin
  v_today      := (now() at time zone 'Asia/Jakarta')::date;
  v_day_start  := v_today::timestamp at time zone 'Asia/Jakarta';
  v_week_start := v_today - 6;

  select jsonb_build_object(
    'date', v_today,

    'entries', (
      select coalesce(jsonb_agg(
        to_jsonb(q) order by q.queue_number
      ), '[]'::jsonb)
      from public.queue_entries q
      where q.queue_date = v_today
    ),

    'stats', (
      select jsonb_build_object(
        'waiting_count',  count(*) filter (where x.status = 'menunggu'),
        'called_count',   count(*) filter (where x.status = 'dipanggil'),
        'working_count',  count(*) filter (where x.status = 'dikerjakan'),
        'done_count',     count(*) filter (where x.status = 'selesai'),
        'cancelled_count',count(*) filter (where x.status = 'batal'),

        -- Rata-rata menit dari daftar → mulai dikerjakan (7 hari terakhir).
        'avg_wait_minutes', coalesce(round(avg(
          extract(epoch from (x.started_at - x.created_at)) / 60
        )), 0),
        -- Rata-rata menit dari mulai dikerjakan → selesai (7 hari terakhir).
        'avg_service_minutes', coalesce(round(avg(
          extract(epoch from (x.done_at - x.started_at)) / 60
        )), 0)
      )
      from public.queue_entries x
      where x.queue_date >= v_week_start
        and x.queue_date <= v_today
        and x.started_at is not null
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. GRANT EKSEKUSI: hanya role authenticated (admin yang sudah login)
-- ---------------------------------------------------------------------------
revoke execute on function public.create_queue_entry(text, text, text, text, uuid, text)
  from public, anon;
grant  execute on function public.create_queue_entry(text, text, text, text, uuid, text)
  to authenticated;

revoke execute on function public.update_queue_status(uuid, text, uuid, text)
  from public, anon;
grant  execute on function public.update_queue_status(uuid, text, uuid, text)
  to authenticated;

revoke execute on function public.get_queue_today()
  from public, anon;
grant  execute on function public.get_queue_today()
  to authenticated;
