/**
 * Prediksi omzet — Holt-Winters (triple exponential smoothing) aditif
 * dengan musiman mingguan (period = 7 hari), cocok untuk pola akhir-pekan
 * usaha cuci kendaraan.
 *
 * Alur perhitungan (murni di klien, deterministik, tanpa API):
 *  1. Backtest: data dibelah menjadi data latih (semua kecuali 7 hari
 *     terakhir) dan data validasi (7 hari terakhir). Setiap kombinasi
 *     parameter (α, β, γ) pada grid di-fit pada data latih lalu memproyeksikan
 *     7 hari validasi — kombinasi dengan MAE terkecil dipilih.
 *  2. Refit: model terbaik di-fit ulang pada SELURUH deret aktif,
 *     lalu memproyeksikan `horizon` hari ke depan.
 *  3. Pita ketidakpastian ±1σ, dengan σ = simpangan baku residual
 *     satu-langkah hasil refit (≈68% kemungkinan).
 *  4. Metrik akurasi MAPE & MAE diambil dari backtest langkah 1.
 *
 * Hari tanpa transaksi SEBELUM transaksi pertama dianggap "belum buka"
 * dan dibuang; hari kosong SETELAH buka tetap 0 (hari tutup yang sah).
 */
import { shiftIsoDate } from "./periods"
import type { RevenueHistory } from "@/types"

export interface ForecastPoint {
  /** Tanggal WIB "yyyy-mm-dd". */
  day: string
  /** Proyeksi omzet (rupiah, ≥ 0). */
  revenue: number
  /** Batas bawah pita ±1σ (≥ 0). */
  lower: number
  /** Batas atas pita ±1σ. */
  upper: number
}

export interface ForecastMetrics {
  alpha: number
  beta: number
  gamma: number
  /** MAPE backtest 7 hari (%). null bila seluruh hari validasi = 0. */
  mape: number | null
  /** MAE backtest 7 hari (rupiah). */
  mae: number
  /** Simpangan baku residual satu-langkah (rupiah) — lebar pita ±1σ. */
  sigma: number
}

export interface ForecastResult {
  points: ForecastPoint[]
  metrics: ForecastMetrics
  /** Jumlah hari riwayat aktif yang dipakai model. */
  historyDays: number
}

/** Minimal riwayat aktif: 3 minggu (2 inisialisasi + 1 validasi). */
export const FORECAST_MIN_DAYS = 21

const WEEK = 7

interface HwParams {
  alpha: number
  beta: number
  gamma: number
}

interface HwFit {
  level: number
  trend: number
  seasonal: number[]
  residuals: number[]
  fittedPoints: number
}

/** Grid parameter yang diuji — 24 kombinasi, cukup cepat untuk ≤ 365 titik. */
const PARAM_GRID: HwParams[] = (() => {
  const grid: HwParams[] = []
  for (const alpha of [0.1, 0.2, 0.3, 0.5]) {
    for (const beta of [0.01, 0.05, 0.1]) {
      for (const gamma of [0.1, 0.2, 0.3]) {
        grid.push({ alpha, beta, gamma })
      }
    }
  }
  return grid
})()

function avg(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / Math.max(nums.length, 1)
}

/**
 * Fit Holt-Winters aditif pada deret. Dua minggu pertama dipakai
 * inisialisasi; residual satu-langkah dikumpulkan untuk hitung σ.
 */
function fitHw(values: number[], params: HwParams): HwFit {
  const n = values.length
  const firstWeek = values.slice(0, WEEK)
  let level = avg(firstWeek)
  let trend = (avg(values.slice(WEEK, 2 * WEEK)) - level) / WEEK
  const seasonal = firstWeek.map((v) => v - level)
  const residuals: number[] = []

  for (let t = WEEK; t < n; t += 1) {
    const slot = t % WEEK
    // Prediksi satu langkah SEBELUM update (basis residual & σ).
    residuals.push(values[t] - (level + trend + seasonal[slot]))

    const prevLevel = level
    level =
      params.alpha * (values[t] - seasonal[slot]) +
      (1 - params.alpha) * (level + trend)
    trend = params.beta * (level - prevLevel) + (1 - params.beta) * trend
    seasonal[slot] =
      params.gamma * (values[t] - level) + (1 - params.gamma) * seasonal[slot]
  }

  return { level, trend, seasonal, residuals, fittedPoints: n }
}

/** Proyeksi `steps` hari ke depan dari hasil fit (belum dibulatkan). */
function projectHw(fitResult: HwFit, steps: number): number[] {
  const out: number[] = []
  for (let h = 1; h <= steps; h += 1) {
    const slot = (fitResult.fittedPoints + h - 1) % WEEK
    const raw = fitResult.level + h * fitResult.trend + fitResult.seasonal[slot]
    out.push(Math.max(0, raw))
  }
  return out
}

/** Backtest 7 hari terakhir: latih tanpa mereka, ukur MAE & MAPE. */
function backtestWeek(
  values: number[],
  params: HwParams,
): { mae: number; mape: number | null } {
  const train = values.slice(0, values.length - WEEK)
  const actual = values.slice(values.length - WEEK)
  const preds = projectHw(fitHw(train, params), WEEK)

  let sumAbs = 0
  let sumPct = 0
  let pctCount = 0
  for (let i = 0; i < WEEK; i += 1) {
    const err = Math.abs(actual[i] - preds[i])
    sumAbs += err
    if (actual[i] > 0) {
      sumPct += err / actual[i]
      pctCount += 1
    }
  }
  return {
    mae: sumAbs / WEEK,
    mape: pctCount > 0 ? (sumPct / pctCount) * 100 : null,
  }
}

/**
 * Hitung proyeksi omzet dari deret harian (RPC get_revenue_history).
 * Mengembalikan null bila data belum cukup (belum ada transaksi atau
 * riwayat aktif < FORECAST_MIN_DAYS hari).
 */
export function computeForecast(
  history: RevenueHistory,
  horizon: number,
): ForecastResult | null {
  const all = history.daily.map((d) => d.revenue)
  const lastDay = history.end_date

  // Buang hari "belum buka" (nol sebelum transaksi pertama).
  const firstActive = all.findIndex((v) => v > 0)
  if (firstActive === -1) return null
  const values = all.slice(firstActive)
  if (values.length < FORECAST_MIN_DAYS) return null

  // 1. Pilih parameter terbaik via backtest pada 7 hari terakhir.
  let best = PARAM_GRID[0]
  let bestMae = Number.POSITIVE_INFINITY
  for (const params of PARAM_GRID) {
    const { mae } = backtestWeek(values, params)
    if (mae < bestMae) {
      bestMae = mae
      best = params
    }
  }

  // 2. Refit pada seluruh deret aktif, lalu proyeksi horizon hari.
  const fullFit = fitHw(values, best)
  const raw = projectHw(fullFit, horizon)
  const sigma = Math.sqrt(
    fullFit.residuals.reduce((sum, r) => sum + r * r, 0) /
      Math.max(fullFit.residuals.length, 1),
  )

  const points: ForecastPoint[] = raw.map((value, i) => ({
    day: shiftIsoDate(lastDay, i + 1),
    revenue: Math.round(value),
    lower: Math.max(0, Math.round(value - sigma)),
    upper: Math.max(0, Math.round(value + sigma)),
  }))

  // 3. Metrik akurasi dari backtest parameter terpilih.
  const { mape, mae } = backtestWeek(values, best)

  return {
    points,
    metrics: { ...best, mape, mae, sigma: Math.round(sigma) },
    historyDays: values.length,
  }
}
