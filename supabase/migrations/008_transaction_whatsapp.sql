-- ============================================================================
-- MIGRASI 008 — FITUR KIRIM STRUK VIA WHATSAPP
--
-- Ringkasan:
--   * Kolom baru transactions.customer_phone (opsional) — nomor WhatsApp
--     pelanggan, dinormalisasi ke format internasional (62…) agar bisa
--     langsung dipakai link wa.me saat kirim ulang dari riwayat.
--   * RPC create_transaction diperbarui: parameter baru p_customer_phone
--     (opsional) + validasi ringan nomor.
--
-- CATATAN: definisi create_transaction di bawah sama persis dengan
-- migrasi 006 (dengan komisi karyawan), hanya ditambah p_customer_phone.
-- ============================================================================
-- WAJIB DIJALANKAN di Supabase SQL Editor (setelah migrasi 001-007).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom nomor WhatsApp pelanggan (opsional)
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists customer_phone text;

-- ---------------------------------------------------------------------------
-- 2. RPC create_transaction — sama dengan migrasi 006 + p_customer_phone
-- ---------------------------------------------------------------------------
create or replace function public.create_transaction(
  p_vehicle_type   text,
  p_items          jsonb,
  p_payment_method text,
  p_discount       integer default 0,
  p_customer_name  text default null,
  p_plate_number   text default null,
  p_customer_phone text default null,
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

  -- Nomor WhatsApp: buang semua non-digit lalu normalisasi
  -- 08xx -> 628xx (dan 8xx -> 628xx). Kosong -> null.
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
  --    + karyawan, snapshot komisi, dan nomor WhatsApp pelanggan
  ------------------------------------------------------------------
  insert into public.transactions (
    invoice_number, cashier_id, customer_name, plate_number, customer_phone,
    vehicle_type, subtotal, discount, total,
    payment_method, payment_status, cash_received, cash_change,
    employee_id, commission_amount,
    paid_at
  ) values (
    v_invoice, v_uid, p_customer_name, p_plate_number, p_customer_phone,
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

revoke execute on function public.create_transaction(text, jsonb, text, integer, text, text, text, integer, uuid)
  from public, anon;
grant  execute on function public.create_transaction(text, jsonb, text, integer, text, text, text, integer, uuid)
  to authenticated;
