/**
 * Utilitas format tampilan (Rupiah, tanggal & waktu).
 * Seluruh tanggal ditampilkan mengikuti zona waktu Asia/Jakarta
 * (WIB) tanpa bergantung pada zona waktu browser.
 */

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** Rp 15.000 */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-"
  return `Rp ${rupiahFormatter.format(value)}`
}

/** 15 Nov 2026 (Asia/Jakarta) */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-"
  return dateFormatter.format(new Date(iso))
}

/** 15 Nov 2026, 14:30 (Asia/Jakarta) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-"
  return dateTimeFormatter.format(new Date(iso)).replace(".", ":")
}

/** Sabtu, 15 November 2026 (Asia/Jakarta) */
const fullDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

export function formatFullDateNow(): string {
  return fullDateFormatter.format(new Date())
}

/** Versi ringkas untuk sumbu grafik: 1.500.000 -> "1,5 jt", 15.000 -> "15 rb". */
export function formatCompactRupiah(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("id-ID", {
      maximumFractionDigits: 1,
    })} jt`
  }
  if (Math.abs(value) >= 1_000) {
    return `${Math.round(value / 1_000)} rb`
  }
  return rupiahFormatter.format(value)
}

/** Ubah tanggal "2026-11-15" menjadi label sumbu "15/11". */
export function formatDayLabel(isoDay: string): string {
  const parts = isoDay.split("-")
  if (parts.length !== 3) return isoDay
  const [, month, day] = parts
  return `${day}/${month}`
}
