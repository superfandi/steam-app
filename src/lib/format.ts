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

/** 15 Nov 2026, 14.30 (Asia/Jakarta) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-"
  return dateTimeFormatter.format(new Date(iso)).replace(".", ":")
}
