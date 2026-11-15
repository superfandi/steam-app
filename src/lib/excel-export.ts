/**
 * Util export Excel (.xlsx) berformat profesional — pengganti export CSV.
 *
 * Desain file:
 *   - Blok judul + info periode di atas, digabung (merged) sepanjang tabel.
 *   - Header tabel berwarna (bold putih di atas biru), tebal + border tipis.
 *   - Baris data berselang-seling (zebra) + border tipis.
 *   - Kolom uang memakai format angka Excel "#,##0" (tetap angka, bisa
 *     di-SUM/di-chart — bukan teks "Rp ...").
 *   - Baris Total dengan sorotan khusus.
 *   - Print-ready: landscape + fit-to-width.
 *
 * Library `exceljs` di-import DINAMIS (lazy) sehingga bundle halaman laporan
 * tetap ringan; hanya dimuat saat pertama kali tombol export ditekan.
 */
import type { Workbook, Worksheet } from "exceljs"

/* ------------------------------------------------------------------ */
/* Tema & konstanta                                                    */
/* ------------------------------------------------------------------ */

const COLORS = {
  title: "FF0F172A", // slate-900
  muted: "FF64748B", // slate-500
  headerFill: "FF1D4ED8", // blue-700
  headerText: "FFFFFFFF",
  border: "FFCBD5E1", // slate-300
  zebra: "FFF1F5F9", // slate-100
  totalsFill: "FFDBEAFE", // blue-100
  dangerFill: "FFFEE2E2", // red-100 (baris transaksi dibatalkan)
} as const

/** Format angka uang: tetap angka murni agar bisa dijumlahkan di Excel. */
export const MONEY_FMT = "#,##0"

const THIN = { style: "thin" as const, color: { argb: COLORS.border } }
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN }

/* ------------------------------------------------------------------ */
/* Workbook & penyimpanan                                              */
/* ------------------------------------------------------------------ */

/** Buat workbook baru — memuat exceljs secara dinamis (lazy chunk). */
export async function createWorkbook(): Promise<Workbook> {
  const mod = await import("exceljs")
  // Interop UMD/bundler: coba named export dulu, fallback ke `default`.
  const ctor =
    (mod as { Workbook?: new () => Workbook }).Workbook ??
    (
      mod as {
        default?: { Workbook?: new () => Workbook }
      }
    ).default?.Workbook
  if (!ctor) {
    throw new Error("Library Excel gagal dimuat. Muat ulang halaman.")
  }
  return new ctor()
}

/**
 * Unduh workbook sebagai file .xlsx ke browser.
 */
export async function saveWorkbook(
  workbook: Workbook,
  filename: string,
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ */
/* Blok penyusun sheet (berurut dari atas ke bawah)                     */
/* ------------------------------------------------------------------ */

/**
 * Blok judul + subjudul (info periode), digabung sepanjang tabel.
 * Mengembalikan nomor baris berikutnya yang kosong (siap diisi).
 */
export function addTitleBlock(
  sheet: Worksheet,
  title: string,
  subtitleLines: string[],
  spanCols: number,
): number {
  let row = 1

  const titleCell = sheet.getCell(row, 1)
  titleCell.value = title
  titleCell.font = { bold: true, size: 15, color: { argb: COLORS.title } }
  if (spanCols > 1) sheet.mergeCells(row, 1, row, spanCols)
  row += 1

  for (const line of subtitleLines) {
    const cell = sheet.getCell(row, 1)
    cell.value = line
    cell.font = { size: 10, color: { argb: COLORS.muted } }
    if (spanCols > 1) sheet.mergeCells(row, 1, row, spanCols)
    row += 1
  }

  return row + 1 // satu baris kosong pemisah
}

/**
 * Judul seksi (mis. "Rekap Harian") — mengembalikan baris berikutnya.
 */
export function addSectionLabel(
  sheet: Worksheet,
  row: number,
  text: string,
  spanCols = 1,
): number {
  const cell = sheet.getCell(row, 1)
  cell.value = text
  cell.font = { bold: true, size: 12, color: { argb: COLORS.title } }
  if (spanCols > 1) sheet.mergeCells(row, 1, row, spanCols)
  return row + 1
}

/**
 * Baris header tabel: bold putih di atas biru, border tipis, rata tengah.
 */
export function addTableHeader(
  sheet: Worksheet,
  row: number,
  headers: string[],
): number {
  headers.forEach((header, index) => {
    const cell = sheet.getCell(row, index + 1)
    cell.value = header
    cell.font = { bold: true, color: { argb: COLORS.headerText } }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.headerFill },
    }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = ALL_BORDERS
  })
  sheet.getRow(row).height = 22
  return row + 1
}

export interface DataRowOptions {
  /** Indeks kolom (0-based) yang berisi angka uang → format "#,##0". */
  moneyCols?: number[]
  /** Indeks baris data untuk efek zebra (baris genap diberi warna lembut). */
  zebraIndex?: number
  /** Sorot baris merah lembut (transaksi dibatalkan). */
  danger?: boolean
}

/** Baris data dengan border + zebra + format uang. */
export function addRow(
  sheet: Worksheet,
  row: number,
  values: Array<string | number | null>,
  options: DataRowOptions = {},
): number {
  const { moneyCols = [], zebraIndex, danger = false } = options
  const zebra = !danger && zebraIndex !== undefined && zebraIndex % 2 === 1

  values.forEach((value, index) => {
    const cell = sheet.getCell(row, index + 1)
    cell.value = value
    cell.border = ALL_BORDERS
    if (moneyCols.includes(index)) {
      cell.numFmt = MONEY_FMT
      cell.alignment = { horizontal: "right", vertical: "middle" }
    }
    if (zebra) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.zebra },
      }
    }
    if (danger) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.dangerFill },
      }
    }
  })
  return row + 1
}

/**
 * Baris total: bold dengan latar biru muda + border atas tebal.
 */
export function addTotalsRow(
  sheet: Worksheet,
  row: number,
  values: Array<string | number | null>,
  moneyCols: number[] = [],
): number {
  values.forEach((value, index) => {
    const cell = sheet.getCell(row, index + 1)
    cell.value = value
    cell.font = { bold: true, color: { argb: COLORS.title } }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.totalsFill },
    }
    cell.border = {
      top: { style: "medium" as const, color: { argb: COLORS.headerFill } },
      bottom: THIN,
      left: THIN,
      right: THIN,
    }
    if (moneyCols.includes(index)) {
      cell.numFmt = MONEY_FMT
      cell.alignment = { horizontal: "right", vertical: "middle" }
    }
  })
  return row + 1
}

/**
 * Baris "label: nilai" untuk blok ringkasan statistik.
 * `isMoney` → nilai diformat "#,##0".
 */
export function addStatRow(
  sheet: Worksheet,
  row: number,
  label: string,
  value: string | number,
  isMoney = false,
): number {
  const labelCell = sheet.getCell(row, 1)
  labelCell.value = label
  labelCell.font = { size: 11, color: { argb: COLORS.title } }

  const valueCell = sheet.getCell(row, 2)
  valueCell.value = value
  valueCell.font = { bold: true, color: { argb: COLORS.title } }
  if (isMoney) {
    valueCell.numFmt = MONEY_FMT
    valueCell.alignment = { horizontal: "left", vertical: "middle" }
  }
  return row + 1
}

/**
 * Lebar kolom sheet — dipanggil sekali sebelum mengisi sel.
 */
export function setColumnWidths(sheet: Worksheet, widths: number[]): void {
  sheet.columns = widths.map((width) => ({ width }))
}

/**
 * Siapkan tampilan cetak: landscape + muat selebar 1 halaman.
 */
export function setupPrint(sheet: Worksheet): void {
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
  }
}

/**
 * Bekukan baris di atas `ySplit` (judul + header tetap terlihat saat
 * menggulir data panjang).
 */
export function freezeRows(sheet: Worksheet, ySplit: number): void {
  sheet.views = [{ state: "frozen", ySplit }]
}
