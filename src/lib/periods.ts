/**
 * Periode laporan (zona Asia/Jakarta).
 * Semua tanggal dalam format "yyyy-mm-dd" lokal WIB.
 */

export interface ReportPeriod {
  key: string
  label: string
  start: string
  end: string
}

/** Tanggal hari ini di Asia/Jakarta sebagai "yyyy-mm-dd". */
export function todayJakartaIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date())
}

/** Geser tanggal "yyyy-mm-dd" sejumlah hari (aman lintas bulan/tahun). */
export function shiftIsoDate(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Senin pada minggu tanggal ISO yang diberikan. */
function mondayOf(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`)
  const dayOfWeek = date.getUTCDay() // 0=Minggu ... 6=Sabtu
  const diff = (dayOfWeek + 6) % 7 // Senin = 0
  return shiftIsoDate(isoDay, -diff)
}

/** Awal bulan dari tanggal ISO. */
function firstOfMonth(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`
}

/** Hari terakhir bulan sebelumnya dari tanggal ISO. */
function lastOfPrevMonth(isoDay: string): string {
  const year = Number(isoDay.slice(0, 4))
  const monthIndex = Number(isoDay.slice(5, 7)) - 1 // 0-based
  return new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10)
}

/** Preset periode laporan. */
export function getReportPeriods(): ReportPeriod[] {
  const today = todayJakartaIso()
  return [
    { key: "today", label: "Hari Ini", start: today, end: today },
    { key: "last7", label: "7 Hari Terakhir", start: shiftIsoDate(today, -6), end: today },
    { key: "thisWeek", label: "Minggu Ini", start: mondayOf(today), end: today },
    { key: "thisMonth", label: "Bulan Ini", start: firstOfMonth(today), end: today },
    { key: "last30", label: "30 Hari Terakhir", start: shiftIsoDate(today, -29), end: today },
    {
      key: "prevMonth",
      label: "Bulan Lalu",
      start: firstOfMonth(lastOfPrevMonth(today)),
      end: lastOfPrevMonth(today),
    },
  ]
}
