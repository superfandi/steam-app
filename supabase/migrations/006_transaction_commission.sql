-- ============================================================================
-- WASH POS - 006_transaction_commission.sql
-- Komisi karyawan pada transaksi:
--   1. Kolom baru transactions.employee_id & transactions.commission_amount
--      (snapshot nominal komisi saat checkout).
--   2. RPC create_transaction diperbarui: parameter p_employee_id,
--      komisi dihitung DI DATABASE (persen dari total, dibulatkan ke bawah)
--      dan di-snapshot — frontend tidak pernah mengirim angka komisi.
--   3. RPC get_dashboard_summary diperluas: today_commission.
--   4. RPC baru get_commission_report: rekap komisi per rentang (WIB).
--
-- Pembatalan transaksi otomatis membatalkan komisinya karena seluruh
-- perhitungan hanya memakai transaksi payment_status = 'paid'
-- (RPC cancel_transaction tidak perlu diubah).
--
-- Jalankan setelah 005 di Supabase SQL Editor. Aman dijalankan ulang.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. KOLOM TRANSAKSI
--    FK restrict: karyawan yang sudah ditugaskan tidak boleh dihapus
--    (konsekuensinya sama seperti layanan — cukup nonaktifkan).
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists employee_id uuid
    references public.employees (id) on delete restrict;

alter table public.transactions
  add column if not exists commission_amount integer not null default 0
    check (commission_amount >= 0);

create index if not exists idx_transactions_employee
  on public.transactions (employee_id);

comment on column public.transactions.commission_amount is
  'Snapshot komisi karyawan (rupiah) saat transaksi dibuat; dihitung database.';

-- ---------------------------------------------------------------------------
-- 2. RPC: BUAT TRANSAKSI (ATOMIK) — versi baru dengan karyawan & komisi
--    Fungsi lama (tanpa p_employee_id) diganti total.
-- ---------------------------------------------------------------------------
drop function if exists public.create_transaction(text, jsonb, text, integer, text, text, integer);

create or replace function public.create_transaction(
  p_vehicle_type   text,
  p_items          jsonb,
  p_payment_method text,
  p_discount       integer default 0,
  p_customer_name  text default null,
  p_plate_number   text default null,
  p_cash_received  integer default null,
  p_employee_id    uuid default null
)
returns table (
  transaction_id    uuid,
  invoice_number    text,
  subtotal          integer,
  discount          integer,
  total             integer,
  payment_method    text,
  cash_change       integer,
  employee_name     text,
  commission_amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid                uuid := auth.uid();
  v_today              date;
  v_day_start          timestamptz;
  v_date_part          text;
  v_seq                integer;
  v_invoice            text;
  v_txn_id             uuid;
  v_subtotal           integer;
  v_total              integer;
  v_cash_change        integer;
  v_expected_count     integer;
  v_matched_count      integer;
  v_employee_id        uuid;
  v_employee_name      text;
  v_commission_percent integer := 0;
  v_commission         integer := 0;
begin
  ------------------------------------------------------------------
  -- 0. Hak akses: hanya admin
  ------------------------------------------------------------------
  if not public.is_admin() then
    raise exception 'Akses ditolak: hanya admin yang dapat membuat transaksi';
  end if;

  ------------------------------------------------------------------
  -- 1. Validasi input dasar
  ------------------------------------------------------------------
  if p_vehicle_type not in ('motor', 'mobil') then
    raise exception 'Jenis kendaraan tidak valid';
  end if;

  if p_payment_method not in ('cash', 'qris', 'transfer') then
    raise exception 'Metode pembayaran tidak valid';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal harus ada satu layanan';
  end if;

  if p_discount is null or p_discount < 0 then
    p_discount := 0;
  end if;

  p_customer_name := nullif(btrim(p_customer_name), '');
  p_plate_number  := nullif(upper(btrim(p_plate_number)), '');

  -- Setiap item harus punya service_id & quantity yang valid
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(service_id uuid, quantity integer)
    where x.service_id is null or x.quantity is null or x.quantity < 1
  ) then
    raise exception 'Item layanan tidak valid';
  end if;

  ------------------------------------------------------------------
  -- 1b. Validasi karyawan (opsional): harus ada & aktif.
  --     Persen komisi diambil dari DATABASE, bukan frontend.
  ------------------------------------------------------------------
  if p_employee_id is not null then
    select e.id, e.name, e.commission_percent
      into v_employee_id, v_employee_name, v_commission_percent
    from public.employees e
    where e.id = p_employee_id
      and e.is_active = true;

    if not found then
      raise exception 'Karyawan tidak ditemukan atau sudah tidak aktif';
    end if;
  end if;

  ------------------------------------------------------------------
  -- 2. Serialisasi pembuatan nomor invoice (anti tabrakan antar-request)
  ------------------------------------------------------------------
  perform pg_advisory_xact_lock(hashtext('wash_pos_invoice_seq'));

  v_today     := (now() at time zone 'Asia/Jakarta')::date;
  v_day_start := v_today::timestamp at time zone 'Asia/Jakarta';
  v_date_part := to_char(v_today, 'YYMMDD');

  ------------------------------------------------------------------
  -- 3. Validasi layanan: semua item harus layanan AKTIF yang cocok
  --    dengan jenis kendaraan. Harga diambil dari DATABASE.
  ------------------------------------------------------------------
  select count(distinct x.service_id)
    into v_expected_count
  from jsonb_to_recordset(p_items) as x(service_id uuid, quantity integer);

  select count(distinct agg.service_id)
    into v_matched_count
  from (
    select x.service_id, sum(x.quantity) as qty
    from jsonb_to_recordset(p_items) as x(service_id uuid, quantity integer)
    group by x.service_id
  ) agg
  join public.services s
    on s.id = agg.service_id
   and s.is_active = true
   and s.vehicle_type = p_vehicle_type;

  if v_matched_count <> v_expected_count then
    raise exception 'Ada layanan yang tidak valid, tidak aktif, atau tidak cocok dengan jenis kendaraan';
  end if;

  -- Subtotal dihitung murni dari harga database
  select coalesce(sum(agg.qty * s.price), 0)
    into v_subtotal
  from (
    select x.service_id, sum(x.quantity) as qty
    from jsonb_to_recordset(p_items) as x(service_id uuid, quantity integer)
    group by x.service_id
  ) agg
  join public.services s
    on s.id = agg.service_id
   and s.is_active = true
   and s.vehicle_type = p_vehicle_type;

  if v_subtotal <= 0 then
    raise exception 'Subtotal tidak valid';
  end if;

  if p_discount > v_subtotal then
    raise exception 'Diskon tidak boleh melebihi subtotal';
  end if;

  v_total := v_subtotal - p_discount;

  ------------------------------------------------------------------
  -- 3b. Komisi karyawan: persen dari TOTAL (setelah diskon),
  --     dibulatkan ke bawah ke rupiah. Dihitung di database.
  ------------------------------------------------------------------
  v_commission := floor(v_total * v_commission_percent / 100.0)::integer;

  ------------------------------------------------------------------
  -- 4. Validasi pembayaran
  ------------------------------------------------------------------
  if p_payment_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then
      raise exception 'Uang diterima kurang dari total pembayaran';
    end if;
    v_cash_change := p_cash_received - v_total;
  else
    -- QRIS / Transfer: admin sudah memverifikasi pembayaran saat checkout,
    -- sehingga transaksi langsung berstatus 'paid' tanpa uang tunai.
    if p_cash_received is not null then
      raise exception 'Pembayaran non-tunai tidak memerlukan uang diterima';
    end if;
    v_cash_change := null;
  end if;

  ------------------------------------------------------------------
  -- 5. Nomor invoice unik: INV-YYMMDD-0001 (sequence harian Jakarta)
  ------------------------------------------------------------------
  select coalesce(count(*), 0) + 1
    into v_seq
  from public.transactions
  where created_at >= v_day_start;

  loop
    v_invoice := 'INV-' || v_date_part || '-' || lpad(v_seq::text, 4, '0');
    exit when not exists (
      select 1 from public.transactions t where t.invoice_number = v_invoice
    );
    v_seq := v_seq + 1;
  end loop;

  ------------------------------------------------------------------
  -- 6. Sisipkan header transaksi (status 'paid' + paid_at)
  --    + karyawan & snapshot komisi
  ------------------------------------------------------------------
  insert into public.transactions (
    invoice_number, cashier_id, customer_name, plate_number,
    vehicle_type, subtotal, discount, total,
    payment_method, payment_status, cash_received, cash_change,
    employee_id, commission_amount,
    paid_at
  ) values (
    v_invoice, v_uid, p_customer_name, p_plate_number,
    p_vehicle_type, v_subtotal, p_discount, v_total,
    p_payment_method, 'paid',
    case when p_payment_method = 'cash' then p_cash_received end,
    case when p_payment_method = 'cash' then v_cash_change end,
    v_employee_id,
    v_commission,
    now()
  )
  returning id into v_txn_id;

  ------------------------------------------------------------------
  -- 7. Sisipkan detail transaksi (snapshot nama & harga dari database)
  ------------------------------------------------------------------
  insert into public.transaction_items (
    transaction_id, service_id, service_name, service_price, quantity, subtotal
  )
  select
    v_txn_id,
    s.id,
    s.name,
    s.price,
    agg.qty::int,
    (agg.qty * s.price)::int
  from (
    select x.service_id, sum(x.quantity) as qty
    from jsonb_to_recordset(p_items) as x(service_id uuid, quantity integer)
    group by x.service_id
  ) agg
  join public.services s
    on s.id = agg.service_id
   and s.is_active = true
   and s.vehicle_type = p_vehicle_type;

  ------------------------------------------------------------------
  -- 8. Kembalikan hasil
  ------------------------------------------------------------------
  return query
  select
    v_txn_id,
    v_invoice,
    v_subtotal,
    p_discount,
    v_total,
    p_payment_method,
    v_cash_change,
    v_employee_name,
    v_commission;
end;
$$;

revoke execute on function public.create_transaction(text, jsonb, text, integer, text, text, integer, uuid)
  from public, anon;
grant  execute on function public.create_transaction(text, jsonb, text, integer, text, text, integer, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: RINGKASAN DASHBOARD — diperluas dengan today_commission
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_summary()
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_today         date;
  v_day_start     timestamptz;
  v_series_start  date;
  v_result        jsonb;
begin
  v_today        := (now() at time zone 'Asia/Jakarta')::date;
  v_day_start    := v_today::timestamp at time zone 'Asia/Jakarta';
  v_series_start := v_today - 13; -- 14 hari terakhir (termasuk hari ini)

  select jsonb_build_object(
    'date', v_today,

    'today_revenue', (
      select coalesce(sum(t.total), 0)
      from public.transactions t
      where t.payment_status = 'paid'
        and t.created_at >= v_day_start
    ),

    'today_transactions', (
      select count(*)
      from public.transactions t
      where t.payment_status = 'paid'
        and t.created_at >= v_day_start
    ),

    'today_commission', (
      select coalesce(sum(t.commission_amount), 0)
      from public.transactions t
      where t.payment_status = 'paid'
        and t.created_at >= v_day_start
    ),

    'today_motor', (
      select count(*)
      from public.transactions t
      where t.payment_status = 'paid'
        and t.created_at >= v_day_start
        and t.vehicle_type = 'motor'
    ),

    'today_mobil', (
      select count(*)
      from public.transactions t
      where t.payment_status = 'paid'
        and t.created_at >= v_day_start
        and t.vehicle_type = 'mobil'
    ),

    'payment_summary', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'payment_method',    s.payment_method,
        'transaction_count', s.cnt,
        'revenue',           s.rev
      ) order by s.payment_method), '[]'::jsonb)
      from (
        select t.payment_method, count(*) as cnt, coalesce(sum(t.total), 0) as rev
        from public.transactions t
        where t.payment_status = 'paid'
          and t.created_at >= v_day_start
        group by t.payment_method
      ) s
    ),

    'daily_series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day',               d.day::date,
        'revenue',           coalesce(r.revenue, 0),
        'transaction_count', coalesce(r.cnt, 0)
      ) order by d.day), '[]'::jsonb)
      from generate_series(v_series_start, v_today, interval '1 day') as d(day)
      left join (
        select (t.created_at at time zone 'Asia/Jakarta')::date as day,
               sum(t.total) as revenue,
               count(*)     as cnt
        from public.transactions t
        where t.payment_status = 'paid'
          and t.created_at >= v_series_start::timestamp at time zone 'Asia/Jakarta'
        group by 1
      ) r on r.day = d.day::date
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: LAPORAN KOMISI per rentang tanggal (Asia/Jakarta)
--    Hanya transaksi 'paid' yang punya karyawan. Transaksi dibatalkan
--    otomatis tidak terhitung (status filter).
-- ---------------------------------------------------------------------------
create or replace function public.get_commission_report(
  p_start date,
  p_end   date
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_start_ts   timestamptz;
  v_end_excl   timestamptz; -- batas atas eksklusif: (p_end + 1 hari) tengah malam
  v_result     jsonb;
begin
  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'Rentang tanggal tidak valid';
  end if;

  v_start_ts := p_start::timestamp at time zone 'Asia/Jakarta';
  v_end_excl := (p_end + 1)::timestamp at time zone 'Asia/Jakarta';

  select jsonb_build_object(
    'start_date', p_start,
    'end_date',   p_end,

    'totals', (
      select jsonb_build_object(
        'total_commission',  coalesce(sum(t.commission_amount), 0),
        'transaction_count', count(*),
        'employee_count',    count(distinct t.employee_id)
      )
      from public.transactions t
      where t.payment_status = 'paid'
        and t.employee_id is not null
        and t.created_at >= v_start_ts
        and t.created_at <  v_end_excl
    ),

    'per_employee', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id',       s.employee_id,
        'name',              e.name,
        'position',          e.position,
        'transaction_count', s.cnt,
        'commission',        s.commission
      ) order by s.commission desc, e.name), '[]'::jsonb)
      from (
        select t.employee_id,
               count(*)                 as cnt,
               sum(t.commission_amount) as commission
        from public.transactions t
        where t.payment_status = 'paid'
          and t.employee_id is not null
          and t.created_at >= v_start_ts
          and t.created_at <  v_end_excl
        group by t.employee_id
      ) s
      join public.employees e on e.id = s.employee_id
    ),

    'transactions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',             t.id,
        'invoice_number', t.invoice_number,
        'day',            (t.created_at at time zone 'Asia/Jakarta')::date,
        'employee_name',  e.name,
        'total',          t.total,
        'commission',     t.commission_amount
      ) order by t.created_at desc), '[]'::jsonb)
      from public.transactions t
      join public.employees e on e.id = t.employee_id
      where t.payment_status = 'paid'
        and t.created_at >= v_start_ts
        and t.created_at <  v_end_excl
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_commission_report(date, date)
  from public, anon;
grant  execute on function public.get_commission_report(date, date)
  to authenticated;
