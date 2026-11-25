-- ============================================================================
-- Mtwo Steam - 003_functions_rpc.sql
-- Fungsi database (RPC):
--   1. create_transaction      : transaksi atomik + nomor invoice unik.
--                                Harga WAJIB diambil dari tabel services.
--   2. cancel_transaction      : pembatalan aman + alasan wajib.
--   3. get_dashboard_summary   : statistik dashboard (zona Asia/Jakarta).
--   4. get_report              : rekap laporan per tanggal (Asia/Jakarta).
--
-- create_transaction & cancel_transaction berjalan SECURITY DEFINER:
-- client tidak punya grant insert/update langsung (lihat 002), sehingga
-- satu-satunya pintu menulis transaksi adalah fungsi-fungsi ini yang
-- memvalidasi aturan bisnis & role admin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) RPC: BUAT TRANSAKSI (ATOMIK)
-- ---------------------------------------------------------------------------
-- Parameter:
--   p_vehicle_type  : 'motor' | 'mobil' (wajib)
--   p_items         : JSON array [{ "service_id": "<uuid>", "quantity": 1 }]
--                     (minimal satu item; item yang sama akan digabung)
--   p_payment_method: 'cash' | 'qris' | 'transfer' (wajib)
--   p_discount      : potongan nominal rupiah (default 0, <= subtotal)
--   p_customer_name : opsional
--   p_plate_number  : opsional (nomor polisi)
--   p_cash_received : wajib untuk 'cash' (>= total); null untuk qris/transfer
-- Return: transaction_id, invoice_number, subtotal, discount, total,
--         payment_method, cash_change
create or replace function public.create_transaction(
  p_vehicle_type   text,
  p_items          jsonb,
  p_payment_method text,
  p_discount       integer default 0,
  p_customer_name  text default null,
  p_plate_number   text default null,
  p_cash_received  integer default null
)
returns table (
  transaction_id  uuid,
  invoice_number  text,
  subtotal        integer,
  discount        integer,
  total           integer,
  payment_method  text,
  cash_change     integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_today           date;
  v_day_start       timestamptz;
  v_date_part       text;
  v_seq             integer;
  v_invoice         text;
  v_txn_id          uuid;
  v_subtotal        integer;
  v_total           integer;
  v_cash_change     integer;
  v_expected_count  integer;
  v_matched_count   integer;
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
  ------------------------------------------------------------------
  insert into public.transactions (
    invoice_number, cashier_id, customer_name, plate_number,
    vehicle_type, subtotal, discount, total,
    payment_method, payment_status, cash_received, cash_change,
    paid_at
  ) values (
    v_invoice, v_uid, p_customer_name, p_plate_number,
    p_vehicle_type, v_subtotal, p_discount, v_total,
    p_payment_method, 'paid',
    case when p_payment_method = 'cash' then p_cash_received end,
    case when p_payment_method = 'cash' then v_cash_change end,
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
    v_cash_change;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) RPC: BATALKAN TRANSAKSI (aman, dengan alasan wajib)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_transaction(
  p_transaction_id uuid,
  p_reason         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Akses ditolak: hanya admin yang dapat membatalkan transaksi';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Alasan pembatalan wajib diisi (minimal 3 karakter)';
  end if;

  select t.payment_status
    into v_status
  from public.transactions t
  where t.id = p_transaction_id;

  if not found then
    raise exception 'Transaksi tidak ditemukan';
  end if;

  if v_status = 'cancelled' then
    raise exception 'Transaksi ini sudah dibatalkan sebelumnya';
  end if;

  update public.transactions
  set payment_status = 'cancelled',
      cancel_reason  = btrim(p_reason),
      cancelled_at   = now()
  where transactions.id = p_transaction_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) RPC: RINGKASAN DASHBOARD (semua perhitungan zona Asia/Jakarta)
--    Hanya transaksi 'paid' yang dihitung sebagai pendapatan.
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
-- 4) RPC: LAPORAN PENDAPATAN per rentang tanggal (Asia/Jakarta)
--    Transaksi 'cancelled' tidak dihitung sebagai pendapatan.
-- ---------------------------------------------------------------------------
create or replace function public.get_report(
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
        'revenue',           coalesce(sum(t.total), 0),
        'transaction_count', count(*),
        'motor_revenue',     coalesce(sum(t.total) filter (where t.vehicle_type = 'motor'), 0),
        'mobil_revenue',     coalesce(sum(t.total) filter (where t.vehicle_type = 'mobil'), 0),
        'cash_revenue',      coalesce(sum(t.total) filter (where t.payment_method = 'cash'), 0),
        'qris_revenue',      coalesce(sum(t.total) filter (where t.payment_method = 'qris'), 0),
        'transfer_revenue',  coalesce(sum(t.total) filter (where t.payment_method = 'transfer'), 0),
        'cancelled_count', (
          select count(*)
          from public.transactions x
          where x.payment_status = 'cancelled'
            and x.created_at >= v_start_ts
            and x.created_at <  v_end_excl
        )
      )
      from public.transactions t
      where t.payment_status = 'paid'
        and t.created_at >= v_start_ts
        and t.created_at <  v_end_excl
    ),

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day',               d.day::date,
        'revenue',           coalesce(r.revenue, 0),
        'transaction_count', coalesce(r.transaction_count, 0),
        'motor_revenue',     coalesce(r.motor_revenue, 0),
        'mobil_revenue',     coalesce(r.mobil_revenue, 0),
        'cash_revenue',      coalesce(r.cash_revenue, 0),
        'qris_revenue',      coalesce(r.qris_revenue, 0),
        'transfer_revenue',  coalesce(r.transfer_revenue, 0)
      ) order by d.day), '[]'::jsonb)
      from generate_series(p_start, p_end, interval '1 day') as d(day)
      left join (
        select (t.created_at at time zone 'Asia/Jakarta')::date as day,
               sum(t.total)                                      as revenue,
               count(*)                                          as transaction_count,
               sum(t.total) filter (where t.vehicle_type = 'motor')     as motor_revenue,
               sum(t.total) filter (where t.vehicle_type = 'mobil')     as mobil_revenue,
               sum(t.total) filter (where t.payment_method = 'cash')    as cash_revenue,
               sum(t.total) filter (where t.payment_method = 'qris')    as qris_revenue,
               sum(t.total) filter (where t.payment_method = 'transfer') as transfer_revenue
        from public.transactions t
        where t.payment_status = 'paid'
          and t.created_at >= v_start_ts
          and t.created_at <  v_end_excl
        group by 1
      ) r on r.day = d.day::date
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) GRANT EKSEKUSI: hanya role authenticated (admin yang sudah login)
-- ---------------------------------------------------------------------------
revoke execute on function public.create_transaction(text, jsonb, text, integer, text, text, integer)
  from public, anon;
grant  execute on function public.create_transaction(text, jsonb, text, integer, text, text, integer)
  to authenticated;

revoke execute on function public.cancel_transaction(uuid, text)
  from public, anon;
grant  execute on function public.cancel_transaction(uuid, text)
  to authenticated;

revoke execute on function public.get_dashboard_summary()
  from public, anon;
grant  execute on function public.get_dashboard_summary()
  to authenticated;

revoke execute on function public.get_report(date, date)
  from public, anon;
grant  execute on function public.get_report(date, date)
  to authenticated;
