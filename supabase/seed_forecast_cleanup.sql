-- ============================================================================
-- Mtwo Steam - seed_forecast_cleanup.sql
-- Membersihkan SEMUA data dummy yang dibuat oleh seed_forecast_dummy.sql.
--
-- Kriteria penghapusan: transactions.customer_name ILIKE 'Dummy %'
--   * transaction_items ikut terhapus otomatis (ON DELETE CASCADE).
--   * queue.transaction_id yang menunjuk transaksi dummy menjadi NULL
--     (ON DELETE SET NULL) - tidak menghapus antrean.
--   * Data transaksi ASLI (bukan 'Dummy %') tidak tersentuh.
--
-- PERHATIAN: jika Anda pernah membuat transaksi asli dengan nama pelanggan
-- berawalan "Dummy", transaksi tersebut juga akan terhapus. Cek dulu hasil
-- query pratinjau di bawah sebelum menjalankan DELETE.
--
-- Aman dijalankan ulang (tanpa data dummy = tidak ada yang terhapus).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pratinjau: transaksi dummy yang akan dihapus (periksa dulu!)
-- ---------------------------------------------------------------------------
select
  (created_at at time zone 'Asia/Jakarta')::date as day,
  invoice_number,
  customer_name,
  vehicle_type,
  total,
  payment_method
from public.transactions
where customer_name ilike 'Dummy %'
order by created_at desc
limit 50;

-- ---------------------------------------------------------------------------
-- 2. Hapus semua transaksi dummy
-- ---------------------------------------------------------------------------
delete from public.transactions
where customer_name ilike 'Dummy %';

-- ---------------------------------------------------------------------------
-- 3. Verifikasi: harus 0
-- ---------------------------------------------------------------------------
select count(*) as sisa_dummy
from public.transactions
where customer_name ilike 'Dummy %';
