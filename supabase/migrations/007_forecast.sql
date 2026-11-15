-- ============================================================================
-- Pandawa Steam - 007_forecast.sql
-- Prediksi omzet (Holt-Winters, dihitung di frontend):
--   RPC get_revenue_history(p_days) mengembalikan deret pendapatan harian
--   (hanya transaksi 'paid', zona Asia/Jakarta). Hari tanpa transaksi
--   diisi 0 agar deret kontinu — model di klien membutuhkan deret utuh.
--
-- Jalankan setelah 006 di Supabase SQL Editor. Aman dijalankan ulang.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- RPC: DERET PENDAPATAN HARIAN untuk prediksi
--     p_days: jumlah hari ke belakang termasuk hari ini (1-365, default 60)
-- ---------------------------------------------------------------------------
create or replace function public.get_revenue_history(p_days integer default 60)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_today date;
  v_start date;
  v_result jsonb;
begin
  if p_days is null or p_days < 1 then
    p_days := 60;
  end if;
  if p_days > 365 then
    p_days := 365;
  end if;

  v_today := (now() at time zone 'Asia/Jakarta')::date;
  v_start := v_today - (p_days - 1);

  select jsonb_build_object(
    'start_date', v_start,
    'end_date',   v_today,
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day',               d.day::date,
        'revenue',           coalesce(r.revenue, 0),
        'transaction_count', coalesce(r.cnt, 0)
      ) order by d.day), '[]'::jsonb)
      from generate_series(v_start, v_today, interval '1 day') as d(day)
      left join (
        select (t.created_at at time zone 'Asia/Jakarta')::date as day,
               sum(t.total) as revenue,
               count(*)     as cnt
        from public.transactions t
        where t.payment_status = 'paid'
          and t.created_at >= v_start::timestamp at time zone 'Asia/Jakarta'
        group by 1
      ) r on r.day = d.day::date
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_revenue_history(integer) is
  'Deret pendapatan harian (WIB, hanya transaksi lunas, hari kosong = 0) untuk prediksi omzet di frontend.';

revoke execute on function public.get_revenue_history(integer)
  from public, anon;
grant  execute on function public.get_revenue_history(integer)
  to authenticated;
