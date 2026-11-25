-- ============================================================================
-- Mtwo Steam - seed_forecast_dummy.sql
-- DATA DUMMY untuk menguji fitur PREDIKSI OMZET (kartu RevenueForecastCard
-- di halaman Laporan) sekaligus memperkaya demo skripsi.
--
-- Apa yang dihasilkan:
--   * Transaksi berstatus 'paid' selama 90 hari terakhir (termasuk hari ini).
--   * Pola musiman mingguan: Sabtu-Minggu ramai, Jumat sedang, Senin-Kamis
--     sepsi -> dapat ditangkap model Holt-Winters (period = 7).
--   * Tren naik ringan + noise acak (setseed agar hasil reproducible).
--   * Item transaksi diambil dari master `services` (snapshot nama & harga),
--     1-2 layanan per transaksi, sesuai vehicle_type.
--   * Semua constraint tabel dipenuhi: total = subtotal - discount,
--     cash -> cash_received dibulatkan ke atas ke kelipatan 5000 + cash_change.
--   * Jam transaksi 08:00-20:00 WIB; untuk hari ini dibatasi <= now()
--     (tidak ada transaksi "masa depan").
--   * Invoice rentang 9001+ (INV-YYMMDD-9001 dst.) agar tidak bentrok
--     dengan sequence asli aplikasi yang mulai dari 0001.
--
-- Penanda dummy: customer_name = 'Dummy A' s.d. 'Dummy E'
--   -> mudah difilter/dihapus, dan terlihat jelas di halaman History.
--
-- IDEMPOTENT: menjalankan ulang akan MENGHAPUS data dummy lama lalu
-- membuat ulang. Data transaksi asli (bukan 'Dummy %') tidak tersentuh.
--
-- Cara pakai : jalankan seluruh isi file di Supabase SQL Editor.
-- Bersih-bersih: jalankan seed_forecast_cleanup.sql setelah demo selesai.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Guard: butuh minimal satu layanan aktif (dipakai sebagai item dummy)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.services where is_active) then
    raise exception
      'Tidak ada layanan aktif di tabel services. Jalankan 004_seed.sql terlebih dahulu.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Hapus data dummy lama (idempotent)
--    transaction_items ikut terhapus (ON DELETE CASCADE).
-- ---------------------------------------------------------------------------
delete from public.transactions
where customer_name ilike 'Dummy %';

-- ---------------------------------------------------------------------------
-- 2. Generate transaksi dummy 90 hari
-- ---------------------------------------------------------------------------
do $$
declare
  v_today       date := (now() at time zone 'Asia/Jakarta')::date;
  v_start       date := v_today - 89;            -- 90 hari, termasuk hari ini
  v_days        int  := 90;

  d             date;
  v_dow         int;             -- 0=Minggu .. 6=Sabtu
  v_progress    numeric;         -- 0 (awal) .. 1 (hari ini) -> faktor tren
  v_base        int;
  v_span        int;
  v_target      int;             -- target jumlah transaksi hari itu
  v_seq         int;             -- counter invoice harian (mulai 9001)

  v_open        timestamptz;     -- 08:00 WIB hari d
  v_close       timestamptz;     -- 20:00 WIB hari d
  v_latest      timestamptz;     -- batas atas jam transaksi (<= now utk hari ini)
  v_ts          timestamptz;     -- created_at = paid_at transaksi

  v_cashier     uuid;
  v_cust        text;
  v_plate       text;
  v_vehicle     text;
  v_method      text;
  v_r           double precision;

  v_svc1_id     uuid;
  v_svc1_name   text;
  v_svc1_price  int;
  v_svc2_id     uuid;
  v_svc2_name   text;
  v_svc2_price  int;

  v_subtotal    int;
  v_discount    int;
  v_total       int;
  v_received    int;
  v_change      int;
  v_invoice     text;
  v_txn_id      uuid;

  v_total_txn   int := 0;
begin
  perform setseed(0.42);  -- random() reproducible di dalam sesi ini

  -- Pilih satu profil sebagai kasir (boleh null bila belum ada profil)
  select p.id into v_cashier
  from public.profiles p
  order by p.created_at
  limit 1;

  for d in
    select gs::date
    from generate_series(v_start::timestamp, v_today::timestamp, interval '1 day') as gs
  loop
    v_dow      := extract(dow from d)::int;
    v_progress := (d - v_start)::numeric / (v_days - 1);

    -- 2a. Pola musiman mingguan (dasar jumlah transaksi per hari)
    if v_dow in (0, 6) then          -- Minggu & Sabtu: ramai
      v_base := 6; v_span := 5;      -- 6..10 transaksi
    elsif v_dow = 5 then             -- Jumat: sedang
      v_base := 4; v_span := 4;      -- 4..7 transaksi
    else                             -- Senin-Kamis: sepi
      v_base := 2; v_span := 4;      -- 2..5 transaksi
    end if;

    -- 2b. Tren naik ringan: awal periode x0.85, hari ini x1.15
    v_target := round(v_base * (0.85 + 0.30 * v_progress))::int
              + floor(random() * v_span)::int;

    -- 2c. Jendela waktu transaksi (hari ini dibatasi <= now)
    v_open   := (d + time '08:00')::timestamp at time zone 'Asia/Jakarta';
    v_close  := (d + time '20:00')::timestamp at time zone 'Asia/Jakarta';
    v_latest := least(v_close, now());
    if v_latest <= v_open then
      continue;  -- hari ini belum jam buka: lewati
    end if;

    v_seq := 9001;  -- invoice dummy mulai 9001 tiap hari (hindari bentrok)

    for v_t in 1..v_target loop
      ----------------------------------------------------------------
      -- Layanan: pilih acak dari master, kendaraan mengikuti layanan;
      -- peluang 45% menambah layanan kedua (jenis kendaraan sama).
      ----------------------------------------------------------------
      select s.id, s.name, s.price, s.vehicle_type
        into v_svc1_id, v_svc1_name, v_svc1_price, v_vehicle
      from public.services s
      where s.is_active
      order by random()
      limit 1;

      v_svc2_id := null;
      if random() < 0.45 then
        select s.id, s.name, s.price
          into v_svc2_id, v_svc2_name, v_svc2_price
        from public.services s
        where s.is_active and s.vehicle_type = v_vehicle and s.id <> v_svc1_id
        order by random()
        limit 1;
      end if;

      v_subtotal := v_svc1_price + coalesce(v_svc2_price, 0);

      ----------------------------------------------------------------
      -- Diskon: 20% peluang 5000/10000, tidak boleh >= subtotal
      ----------------------------------------------------------------
      if random() < 0.20 then
        v_discount := (array[5000, 10000])[1 + floor(random() * 2)::int];
        if v_discount >= v_subtotal then
          v_discount := 0;
        end if;
      else
        v_discount := 0;
      end if;
      v_total := v_subtotal - v_discount;

      ----------------------------------------------------------------
      -- Metode bayar: 60% cash, 25% qris, 15% transfer
      ----------------------------------------------------------------
      v_r := random();
      if v_r < 0.60 then
        v_method  := 'cash';
        v_received := ceil(v_total::numeric / 5000) * 5000;  -- kelipatan 5rb
        v_change   := v_received - v_total;
      elsif v_r < 0.85 then
        v_method   := 'qris';
        v_received := null;
        v_change   := null;
      else
        v_method   := 'transfer';
        v_received := null;
        v_change   := null;
      end if;

      ----------------------------------------------------------------
      -- Identitas dummy + jam transaksi acak dalam jendela buka
      ----------------------------------------------------------------
      v_cust := 'Dummy ' || chr(65 + floor(random() * 5)::int);  -- A..E

      if random() < 0.20 then
        v_plate := null;
      else
        v_plate := 'B ' || lpad((1000 + floor(random() * 9000))::int::text, 4, '0')
                 || ' ' || (array['ABC', 'XYZ', 'JKL', 'MNO'])[1 + floor(random() * 4)::int];
      end if;

      v_ts := v_open + random() * (v_latest - v_open);

      ----------------------------------------------------------------
      -- Sisipkan header + item
      ----------------------------------------------------------------
      v_invoice := 'INV-' || to_char(d, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');
      v_seq     := v_seq + 1;

      insert into public.transactions (
        invoice_number, cashier_id, customer_name, plate_number,
        vehicle_type, subtotal, discount, total,
        payment_method, payment_status, cash_received, cash_change,
        paid_at, created_at, updated_at
      ) values (
        v_invoice, v_cashier, v_cust, v_plate,
        v_vehicle, v_subtotal, v_discount, v_total,
        v_method, 'paid', v_received, v_change,
        v_ts, v_ts, v_ts
      )
      returning id into v_txn_id;

      insert into public.transaction_items (
        transaction_id, service_id, service_name, service_price, quantity, subtotal
      ) values (
        v_txn_id, v_svc1_id, v_svc1_name, v_svc1_price, 1, v_svc1_price
      );

      if v_svc2_id is not null then
        insert into public.transaction_items (
          transaction_id, service_id, service_name, service_price, quantity, subtotal
        ) values (
          v_txn_id, v_svc2_id, v_svc2_name, v_svc2_price, 1, v_svc2_price
        );
      end if;

      v_total_txn := v_total_txn + 1;
    end loop;
  end loop;

  raise notice 'Selesai: % transaksi dummy dibuat untuk % hari (% s.d. %).',
    v_total_txn, v_days, v_start, v_today;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Sanity check (jalankan & lihat hasilnya di SQL Editor)
-- ---------------------------------------------------------------------------

-- 3a. Jumlah & omzet dummy 7 hari terakhir
select
  (created_at at time zone 'Asia/Jakarta')::date as day,
  count(*)      as transactions,
  sum(total)    as revenue
from public.transactions
where payment_status = 'paid'
  and customer_name ilike 'Dummy %'
  and created_at >= ((now() at time zone 'Asia/Jakarta')::date - 6)::timestamp
    at time zone 'Asia/Jakarta'
group by 1
order by 1;

-- 3b. Deret harian yang dipakai model prediksi (RPC asli aplikasi)
select * from get_revenue_history(60);
