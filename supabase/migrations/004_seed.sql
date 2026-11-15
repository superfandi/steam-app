-- ============================================================================
-- WASH POS - 004_seed.sql
-- Data awal: contoh layanan pencucian motor & mobil.
-- Idempotent: aman dijalankan ulang (ON CONFLICT DO NOTHING).
-- ============================================================================

insert into public.services (name, vehicle_type, price, description, is_active) values
  ('Cuci Motor',            'motor', 15000, 'Pencucian standar motor: semprot, cuci, bilas, dan pengeringan', true),
  ('Cuci Motor + Vacuum',   'motor', 25000, 'Pencucian standar motor ditambah vacuum bagian dalam', true),
  ('Cuci Motor + Polish',   'motor', 35000, 'Pencucian motor ditambah polish bodi agar mengkilap', true),
  ('Cuci Motor Premium',    'motor', 45000, 'Pencucian lengkap: vacuum, polish, dan pelumas rantai', true),
  ('Cuci Mobil',            'mobil', 40000, 'Pencucian standar mobil: eksterior, roda, dan pengeringan', true),
  ('Cuci Mobil + Vacuum',   'mobil', 60000, 'Pencucian standar mobil ditambah vacuum interior', true),
  ('Cuci Mobil + Wax',      'mobil', 80000, 'Pencucian mobil ditambah lapisan wax pelindung cat', true),
  ('Cuci Mobil Premium',    'mobil', 120000, 'Pencucian lengkap: vacuum interior, wax, dan pembersihan kaca', true)
on conflict (name, vehicle_type) do nothing;

comment on table public.services is
  'Master layanan. Data di atas hanya contoh awal dan dapat diubah/dinonaktifkan lewat aplikasi.';
