/**
 * Verifikasi lokal (tanpa DB): simulasi pola data dummy yang dihasilkan
 * supabase/seed_forecast_dummy.sql, lalu jalankan computeForecast ASLI
 * dari src/lib/forecast.ts untuk memastikan fitur prediksi omzet bekerja.
 *
 * Isi forecast.ts di-load apa adanya; hanya baris import-nya yang diganti
 * dengan inline helper shiftIsoDate (resolver Node tidak paham alias bundler).
 *
 * Jalankan: node scripts/verify-forecast-dummy.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

// ---- Muat computeForecast dari file asli aplikasi ---------------------------
const srcRoot = new URL("../src/lib/", import.meta.url)
const forecastSrc = readFileSync(new URL("forecast.ts", srcRoot), "utf8")
  .replace(/^import .*$/gm, "") // buang import type & "./periods"

const patched = /* js */ `
// Inline dari src/lib/periods.ts (shiftIsoDate)
function shiftIsoDate(isoDay, days) {
  const date = new Date(\`\${isoDay}T00:00:00Z\`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
${forecastSrc}
`
const tmpFile = join(mkdtempSync(join(tmpdir(), "forecast-verify-")), "forecast.patched.mts")
writeFileSync(tmpFile, patched)
const { computeForecast } = await import(pathToFileURL(tmpFile))

// ---- Replika logika seed_forecast_dummy.sql --------------------------------
const SERVICES = [
  { name: "Cuci Motor", price: 15000, vehicle: "motor" },
  { name: "Cuci Motor + Vacuum", price: 25000, vehicle: "motor" },
  { name: "Cuci Motor + Polish", price: 35000, vehicle: "motor" },
  { name: "Cuci Motor Premium", price: 45000, vehicle: "motor" },
  { name: "Cuci Mobil", price: 40000, vehicle: "mobil" },
  { name: "Cuci Mobil + Vacuum", price: 60000, vehicle: "mobil" },
  { name: "Cuci Mobil + Wax", price: 80000, vehicle: "mobil" },
  { name: "Cuci Mobil Premium", price: 120000, vehicle: "mobil" },
]

const DAYS = 90
const rnd = mulberry32(42) // setseed(0.42) → PRNG deterministik

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const today = new Date()
const daily = []
for (let i = DAYS - 1; i >= 0; i -= 1) {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() - i)
  const day = d.toISOString().slice(0, 10)
  const dow = d.getUTCDay() // 0=Minggu .. 6=Sabtu
  const progress = (DAYS - 1 - i) / (DAYS - 1)

  let base, span
  if (dow === 0 || dow === 6) [base, span] = [6, 5]
  else if (dow === 5) [base, span] = [4, 4]
  else [base, span] = [2, 4]

  const target =
    Math.round(base * (0.85 + 0.3 * progress)) + Math.floor(rnd() * span)

  let revenue = 0
  let txnCount = 0
  for (let t = 0; t < target; t += 1) {
    const svc1 = SERVICES[Math.floor(rnd() * SERVICES.length)]
    let subtotal = svc1.price
    if (rnd() < 0.45) {
      const same = SERVICES.filter(
        (s) => s.vehicle === svc1.vehicle && s !== svc1,
      )
      if (same.length > 0) subtotal += same[Math.floor(rnd() * same.length)].price
    }
    let discount = 0
    if (rnd() < 0.2) {
      discount = [5000, 10000][Math.floor(rnd() * 2)]
      if (discount >= subtotal) discount = 0
    }
    revenue += subtotal - discount
    txnCount += 1
  }
  daily.push({ day, revenue, transaction_count: txnCount })
}

// ---- Shape check (echo sanity check SQL) -----------------------------------
console.log("=== Simulasi deret dummy (90 hari) ===")
const first = daily[0].day
const last = daily[daily.length - 1].day
console.log(`rentang      : ${first} s.d. ${last} (${daily.length} hari)`)
console.log(
  `total omzet  : Rp ${daily.reduce((s, d) => s + d.revenue, 0).toLocaleString("id-ID")}`,
)
const byDow = [0, 1, 2, 3, 4, 5, 6].map((dw) => {
  const rows = daily.filter((_, i) => new Date(`${daily[i].day}T00:00:00Z`).getUTCDay() === dw)
  const avg = rows.reduce((s, r) => s + r.revenue, 0) / rows.length
  return { dw, avg }
})
const avgWeekday = (byDow[1].avg + byDow[2].avg + byDow[3].avg + byDow[4].avg) / 4
console.log(
  `rata-rata/txn: Rp ${Math.round(daily.reduce((s, d) => s + d.revenue, 0) /
    daily.reduce((s, d) => s + d.transaction_count, 0)).toLocaleString("id-ID")}`,
)
console.log(
  `Musiman: Min Rp ${Math.round(byDow[0].avg).toLocaleString("id-ID")},`,
  `Sab Rp ${Math.round(byDow[6].avg).toLocaleString("id-ID")},`,
  `Jum Rp ${Math.round(byDow[5].avg).toLocaleString("id-ID")},`,
  `Sen-Kam Rp ${Math.round(avgWeekday).toLocaleString("id-ID")}`,
  `→ weekend/weekday ratio ${(Math.max(byDow[0].avg, byDow[6].avg) / avgWeekday).toFixed(2)}x`,
)

// ---- RPC get_revenue_history mengambil 60 hari terakhir --------------------
const history = { start_date: daily[29].day, end_date: last, daily: daily.slice(29) }

// ---- computeForecast ASLI dari aplikasi ------------------------------------
console.log("\n=== computeForecast (kode asli aplikasi) ===")
for (const horizon of [7, 14, 30]) {
  const result = computeForecast(history, horizon)
  if (!result) {
    console.log(`horizon ${horizon}: NULL (data kurang) — GAGAL`)
    continue
  }
  const total = result.points.reduce((s, p) => s + p.revenue, 0)
  const mape = result.metrics.mape
  console.log(
    `horizon ${String(horizon).padStart(2)} hari: proyeksi Rp ${total.toLocaleString("id-ID")} | ` +
      `α=${result.metrics.alpha} β=${result.metrics.beta} γ=${result.metrics.gamma} | ` +
      `MAPE=${mape === null ? "null" : mape.toFixed(1) + "%"} MAE=Rp ${Math.round(result.metrics.mae).toLocaleString("id-ID")} σ=Rp ${result.metrics.sigma.toLocaleString("id-ID")} | ` +
      `${result.historyDays} hari riwayat`,
  )
  const valid = result.points.every(
    (p) => p.revenue >= 0 && p.lower <= p.revenue && p.upper >= p.revenue && /^\d{4}-\d{2}-\d{2}$/.test(p.day),
  )
  const contiguity = result.points[0].day === shift(last, 1) && result.points[result.points.length - 1].day === shift(last, horizon)
  console.log(
    `           pita valid: ${valid ? "OK" : "GAGAL"}, tanggal berurutan: ${contiguity ? "OK" : "GAGAL"} (hari-1: ${result.points[0].day})`,
  )
}

function shift(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

console.log("\nSelesai. Bila semua horizon terisi dan pita/tanggal OK, script SQL siap dijalankan di Supabase.")
