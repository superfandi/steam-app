import { useState } from "react"
import { toast } from "sonner"
import {
  Banknote,
  Bike,
  CalendarRange,
  Car,
  Download,
  FileSpreadsheet,
  Info,
  Landmark,
  Loader2,
  QrCode,
  ReceiptText,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"
import { RevenueForecastCard } from "@/components/reports/RevenueForecastCard"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useReport } from "@/hooks/useReport"
import {
  addRow,
  addSectionLabel,
  addStatRow,
  addTableHeader,
  addTitleBlock,
  addTotalsRow,
  createWorkbook,
  freezeRows,
  saveWorkbook,
  setColumnWidths,
  setupPrint,
} from "@/lib/excel-export"
import {
  formatCompactRupiah,
  formatDayLabel,
  formatDateTimeWibPlain,
  formatRupiah,
  dayStartIsoJakarta,
  nextDayStartIsoJakarta,
} from "@/lib/format"
import { getReportPeriods, todayJakartaIso } from "@/lib/periods"
import { PAYMENT_METHOD_LABELS } from "@/lib/constants"
import {
  fetchTransactionsInRangeForExport,
} from "@/services/transaction.service"
import type { PaymentMethod, ReportDailyRow } from "@/types"

/* ------------------------------------------------------------------ */
/* Helper tampilan                                                     */
/* ------------------------------------------------------------------ */

const todayIso = todayJakartaIso()
const defaultCustomStart = `${todayIso.slice(0, 7)}-01`

/** "2026-11-15" → "15 Nov 2026" (dibaca sebagai tanggal kalender). */
function formatIsoDay(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`))
}

const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  cash: Banknote,
  qris: QrCode,
  transfer: Landmark,
}

interface ChartPoint {
  label: string
  revenue: number
  count: number
}

/** Tooltip kustom grafik pendapatan harian. */
function ReportTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartPoint }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{point.label}</p>
      <p className="mt-1 text-muted-foreground">
        Pendapatan:{" "}
        <span className="font-semibold text-foreground">
          {formatRupiah(point.revenue)}
        </span>
      </p>
      <p className="text-muted-foreground">
        Transaksi:{" "}
        <span className="font-semibold text-foreground">{point.count}</span>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Halaman Laporan                                                     */
/* ------------------------------------------------------------------ */

/**
 * Laporan Pendapatan:
 * preset periode + rentang kustom (Asia/Jakarta), ringkasan pendapatan,
 * breakdown metode pembayaran, grafik & rekap harian, export Excel.
 * Data dari RPC get_report — transaksi 'cancelled' tidak dihitung.
 */
export default function ReportsPage() {
  const periods = getReportPeriods()

  const [periodKey, setPeriodKey] = useState("today")
  const [customStart, setCustomStart] = useState(defaultCustomStart)
  const [customEnd, setCustomEnd] = useState(todayIso)

  const activePeriod = periods.find((p) => p.key === periodKey)
  const start = activePeriod ? activePeriod.start : customStart
  const end = activePeriod ? activePeriod.end : customEnd

  const { data, isLoading, error, reload } = useReport(start, end)
  const [isExportingSummary, setIsExportingSummary] = useState(false)
  const [isExportingTransactions, setIsExportingTransactions] = useState(false)

  function applyCustomRange() {
    if (!customStart || !customEnd) {
      toast.error("Tanggal mulai dan tanggal sampai wajib diisi.")
      return
    }
    if (customStart > customEnd) {
      // Tukar bila urutan terbalik agar hasil tetap masuk akal.
      setCustomStart(customEnd)
      setCustomEnd(customStart)
    }
    setPeriodKey("custom")
  }

  /* ---------------- Export Excel (.xlsx) ---------------- */

  async function exportSummary() {
    if (!data) return
    setIsExportingSummary(true)
    try {
      const t = data.totals
      const wb = await createWorkbook()
      const sheet = wb.addWorksheet("Ringkasan")

      // Lebar kolom: label statistik lebar, kolom uang pas konten.
      setColumnWidths(sheet, [32, 18, 19, 19, 15, 15, 15, 19])
      setupPrint(sheet)

      const span = 8
      let row = addTitleBlock(
        sheet,
        "Pandawa Steam — Laporan Pendapatan",
        [
          `Periode: ${data.start_date} s/d ${data.end_date} (WIB)`,
          `Dibuat: ${formatDateTimeWibPlain(new Date().toISOString())} WIB`,
        ],
        span,
      )

      // Seksi 1: ringkasan statistik (label + nilai).
      row = addSectionLabel(sheet, row, "Ringkasan Periode", 2)
      row = addStatRow(sheet, row, "Pendapatan Total (Lunas)", t.revenue, true)
      row = addStatRow(
        sheet,
        row,
        "Jumlah Transaksi Lunas",
        t.transaction_count,
      )
      row = addStatRow(sheet, row, "Pendapatan Motor", t.motor_revenue, true)
      row = addStatRow(sheet, row, "Pendapatan Mobil", t.mobil_revenue, true)
      row = addStatRow(sheet, row, "Pembayaran Tunai", t.cash_revenue, true)
      row = addStatRow(sheet, row, "Pembayaran QRIS", t.qris_revenue, true)
      row = addStatRow(sheet, row, "Pembayaran Transfer", t.transfer_revenue, true)
      row = addStatRow(
        sheet,
        row,
        "Transaksi Dibatalkan (tidak dihitung)",
        t.cancelled_count,
      )
      row += 1 // baris kosong pemisah

      // Seksi 2: rekap harian.
      row = addSectionLabel(sheet, row, "Rekap Harian", span)
      row = addTableHeader(sheet, row, [
        "Tanggal",
        "Transaksi Lunas",
        "Pendapatan Motor (Rp)",
        "Pendapatan Mobil (Rp)",
        "Tunai (Rp)",
        "QRIS (Rp)",
        "Transfer (Rp)",
        "Total Pendapatan (Rp)",
      ])
      const moneyCols = [2, 3, 4, 5, 6, 7]
      let zebraIndex = 0
      for (const d of data.daily) {
        row = addRow(
          sheet,
          row,
          [
            d.day,
            d.transaction_count,
            d.motor_revenue,
            d.mobil_revenue,
            d.cash_revenue,
            d.qris_revenue,
            d.transfer_revenue,
            d.revenue,
          ],
          { moneyCols, zebraIndex },
        )
        zebraIndex += 1
      }
      addTotalsRow(
        sheet,
        row,
        [
          "Total",
          t.transaction_count,
          t.motor_revenue,
          t.mobil_revenue,
          t.cash_revenue,
          t.qris_revenue,
          t.transfer_revenue,
          t.revenue,
        ],
        moneyCols,
      )

      await saveWorkbook(
        wb,
        `laporan-ringkasan_${data.start_date}_s.d._${data.end_date}.xlsx`,
      )
      toast.success("Ringkasan laporan berhasil diunduh.")
    } catch (err) {
      console.error("exportSummary:", err)
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal export ringkasan. Silakan coba lagi.",
      )
    } finally {
      setIsExportingSummary(false)
    }
  }

  async function exportTransactions() {
    if (!data) return
    setIsExportingTransactions(true)
    try {
      const [from, to] = start <= end ? [start, end] : [end, start]
      const rows = await fetchTransactionsInRangeForExport(
        dayStartIsoJakarta(from),
        nextDayStartIsoJakarta(to),
      )

      const wb = await createWorkbook()
      const sheet = wb.addWorksheet("Transaksi")

      // 16 kolom: Invoice..Alasan Pembatalan.
      setColumnWidths(sheet, [
        18, 19, 14, 18, 12, 9, 12, 11, 16, 12, 12, 10, 12, 14, 12, 30,
      ])
      setupPrint(sheet)

      let row = addTitleBlock(
        sheet,
        "Pandawa Steam — Laporan Transaksi",
        [
          `Periode: ${from} s/d ${to} (WIB)`,
          `Dibuat: ${formatDateTimeWibPlain(new Date().toISOString())} WIB`,
        ],
        16,
      )

      const headerRow = row
      row = addTableHeader(sheet, row, [
        "Invoice",
        "Tanggal (WIB)",
        "Kasir",
        "Pelanggan",
        "No. Polisi",
        "Jenis",
        "Metode Bayar",
        "Status",
        "Karyawan",
        "Komisi (Rp)",
        "Subtotal (Rp)",
        "Diskon (Rp)",
        "Total (Rp)",
        "Tunai Diterima (Rp)",
        "Kembalian (Rp)",
        "Alasan Pembatalan",
      ])
      // Header tetap terlihat saat menggulir + bisa difilter dari Excel.
      freezeRows(sheet, headerRow)
      sheet.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow, column: 16 },
      }

      const moneyCols = [9, 10, 11, 12, 13, 14]
      let zebraIndex = 0
      for (const row_ of rows) {
        row = addRow(
          sheet,
          row,
          [
            row_.invoice_number,
            formatDateTimeWibPlain(row_.created_at),
            row_.cashierName ?? "",
            row_.customer_name ?? "",
            row_.plate_number ?? "",
            row_.vehicle_type === "motor" ? "Motor" : "Mobil",
            PAYMENT_METHOD_LABELS[row_.payment_method],
            row_.payment_status === "paid"
              ? "Lunas"
              : row_.payment_status === "cancelled"
                ? "Dibatalkan"
                : "Menunggu",
            row_.employeeName ?? "",
            row_.commission_amount,
            row_.subtotal,
            row_.discount,
            row_.total,
            row_.cash_received ?? "",
            row_.cash_change ?? "",
            row_.cancel_reason ?? "",
          ],
          {
            moneyCols,
            zebraIndex,
            danger: row_.payment_status === "cancelled",
          },
        )
        zebraIndex += 1
      }

      await saveWorkbook(wb, `laporan-transaksi_${from}_s.d._${to}.xlsx`)
      toast.success(`${rows.length} transaksi berhasil diunduh.`)
    } catch (err) {
      console.error("exportTransactions:", err)
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal export transaksi. Silakan coba lagi.",
      )
    } finally {
      setIsExportingTransactions(false)
    }
  }

  /* ---------------- Render ---------------- */

  function renderChartArea() {
    if (!data) return null

    if (data.totals.transaction_count === 0) {
      return (
        <EmptyState
          icon={ReceiptText}
          title="Belum ada transaksi lunas pada periode ini"
          description="Ubah periode atau rentang tanggal, atau buat transaksi baru melalui halaman kasir."
        />
      )
    }

    const chartData: ChartPoint[] = data.daily.map((d: ReportDailyRow) => ({
      label: formatDayLabel(d.day),
      revenue: d.revenue,
      count: d.transaction_count,
    }))

    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#E2E8F0"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#64748B" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fontSize: 12, fill: "#64748B" }}
            tickFormatter={(value: number) => formatCompactRupiah(Number(value))}
          />
          <Tooltip content={<ReportTooltip />} />
          <Bar
            dataKey="revenue"
            fill="#2563EB"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  const totals = data?.totals
  const isEmpty = totals?.transaction_count === 0

  return (
    <div>
      <PageHeader
        title="Laporan Pendapatan"
        description="Rekap pendapatan transaksi lunas per periode — zona waktu Asia/Jakarta (WIB)."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void exportSummary()}
              disabled={!data || isLoading || isExportingSummary}
            >
              {isExportingSummary ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyiapkan...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Ringkasan
                </>
              )}
            </Button>
            <Button
              onClick={() => void exportTransactions()}
              disabled={!data || isLoading || isExportingTransactions}
            >
              {isExportingTransactions ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyiapkan...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export Transaksi
                </>
              )}
            </Button>
          </>
        }
      />

      {/* ---------------- Pemilih periode ---------------- */}
      <div className="mb-4 space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {periods.map((period) => {
            const active = periodKey === period.key
            return (
              <button
                key={period.key}
                type="button"
                onClick={() => setPeriodKey(period.key)}
                className={
                  active
                    ? "rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    : "rounded-full border px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                }
              >
                {period.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={applyCustomRange}
            className={
              periodKey === "custom"
                ? "rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                : "rounded-full border border-dashed px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            }
          >
            Kustom
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="report-start" className="text-xs">
              Tanggal Mulai
            </Label>
            <Input
              id="report-start"
              type="date"
              value={customStart}
              max={todayIso}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="report-end" className="text-xs">
              Tanggal Sampai
            </Label>
            <Input
              id="report-end"
              type="date"
              value={customEnd}
              max={todayIso}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={applyCustomRange} className="gap-1.5">
            <CalendarRange className="h-4 w-4" />
            Terapkan
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Periode aktif:{" "}
          <span className="font-medium text-foreground">
            {activePeriod?.label ?? "Kustom"}
          </span>{" "}
          · {formatIsoDay(start <= end ? start : end)} s/d{" "}
          {formatIsoDay(start <= end ? end : start)}
        </p>
      </div>

      {/* ---------------- Ringkasan periode ---------------- */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-card shadow-sm">
          <ErrorState
            title="Gagal memuat laporan"
            description={error}
            onRetry={() => void reload()}
          />
        </div>
      ) : totals && data ? (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              icon={Wallet}
              label="Total Pendapatan"
              value={formatRupiah(totals.revenue)}
              hint="Hanya transaksi lunas"
            />
            <StatCard
              icon={ReceiptText}
              label="Transaksi Lunas"
              value={String(totals.transaction_count)}
              hint="Dalam periode ini"
            />
            <StatCard
              icon={Bike}
              label="Pendapatan Motor"
              value={formatRupiah(totals.motor_revenue)}
              hint="Kendaraan motor"
            />
            <StatCard
              icon={Car}
              label="Pendapatan Mobil"
              value={formatRupiah(totals.mobil_revenue)}
              hint="Kendaraan mobil"
            />
          </div>

          {/* Grafik + breakdown metode bayar */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle>Pendapatan Harian</CardTitle>
                <CardDescription>
                  {formatIsoDay(start <= end ? start : end)} s/d{" "}
                  {formatIsoDay(start <= end ? end : start)} (WIB)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 pb-4">{renderChartArea()}</CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Metode Pembayaran</CardTitle>
                <CardDescription>
                  Kontribusi tiap metode terhadap pendapatan periode ini
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(
                  [
                    ["cash", totals.cash_revenue],
                    ["qris", totals.qris_revenue],
                    ["transfer", totals.transfer_revenue],
                  ] as Array<[PaymentMethod, number]>
                ).map(([method, revenue]) => {
                  const Icon = METHOD_ICONS[method]
                  const share =
                    totals.revenue > 0 ? (revenue / totals.revenue) * 100 : 0
                  return (
                    <div key={method} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" aria-hidden />
                        </div>
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          {PAYMENT_METHOD_LABELS[method]}
                        </p>
                        <p className="text-sm font-semibold">
                          {formatRupiah(revenue)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pl-10">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(share, 100)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs font-medium text-muted-foreground">
                          {share.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          {/* Proyeksi omzet */}
          <RevenueForecastCard />

          {/* Rekap harian */}
          {!isEmpty && (
            <Card className="mt-4 shadow-sm">
              <CardHeader>
                <CardTitle>Rekap Harian</CardTitle>
                <CardDescription>
                  Rincian pendapatan dan transaksi per tanggal (WIB)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead className="text-center">Transaksi</TableHead>
                        <TableHead className="text-right">Motor</TableHead>
                        <TableHead className="text-right">Mobil</TableHead>
                        <TableHead className="text-right">Tunai</TableHead>
                        <TableHead className="text-right">QRIS</TableHead>
                        <TableHead className="text-right">Transfer</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.daily.map((day) => (
                        <TableRow key={day.day}>
                          <TableCell className="text-sm font-medium">
                            {formatIsoDay(day.day)}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {day.transaction_count}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatRupiah(day.motor_revenue)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatRupiah(day.mobil_revenue)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatRupiah(day.cash_revenue)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatRupiah(day.qris_revenue)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatRupiah(day.transfer_revenue)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {formatRupiah(day.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell className="text-center font-semibold">
                          {totals.transaction_count}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatRupiah(totals.motor_revenue)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatRupiah(totals.mobil_revenue)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatRupiah(totals.cash_revenue)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatRupiah(totals.qris_revenue)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatRupiah(totals.transfer_revenue)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {formatRupiah(totals.revenue)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      {/* Catatan pembatalan */}
      {totals && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {totals.cancelled_count > 0
            ? `${totals.cancelled_count} transaksi dibatalkan dalam periode ini — tidak dihitung sebagai pendapatan.`
            : "Transaksi yang dibatalkan tidak dihitung sebagai pendapatan."}
        </p>
      )}
    </div>
  )
}
