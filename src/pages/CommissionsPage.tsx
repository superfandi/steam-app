import { useState } from "react"
import { toast } from "sonner"
import {
  CalendarRange,
  Download,
  HandCoins,
  Info,
  ReceiptText,
  Users,
} from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"
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
import { useCommissionReport } from "@/hooks/useCommissionReport"
import { downloadCsv } from "@/lib/csv"
import { formatDateTimeWibPlain, formatIsoDayJakarta, formatRupiah } from "@/lib/format"
import { getReportPeriods, todayJakartaIso } from "@/lib/periods"

const todayIso = todayJakartaIso()
const defaultCustomStart = `${todayIso.slice(0, 7)}-01`

/**
 * Laporan Komisi Karyawan:
 * preset periode + rentang kustom (WIB), rekap per karyawan,
 * rincian transaksi berkomisi, dan export CSV.
 * Hanya transaksi lunas yang dihitung — pembatalan otomatis dikecualikan.
 */
export default function CommissionsPage() {
  const periods = getReportPeriods()

  const [periodKey, setPeriodKey] = useState("today")
  const [customStart, setCustomStart] = useState(defaultCustomStart)
  const [customEnd, setCustomEnd] = useState(todayIso)

  const activePeriod = periods.find((p) => p.key === periodKey)
  const start = activePeriod ? activePeriod.start : customStart
  const end = activePeriod ? activePeriod.end : customEnd

  const { data, isLoading, error, reload } = useCommissionReport(start, end)

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

  function exportCommission() {
    if (!data) return
    const t = data.totals

    downloadCsv(
      `laporan-komisi_${start <= end ? start : end}_s.d._${start <= end ? end : start}.csv`,
      [
        "Laporan Komisi Karyawan — WASH POS",
        `Periode: ${data.start_date} s/d ${data.end_date}`,
        `Dibuat: ${formatDateTimeWibPlain(new Date().toISOString())} WIB`,
      ],
      [
        [""],
        ["Rekap per Karyawan"],
        ["Nama", "Jabatan", "Jumlah Transaksi", "Komisi (Rp)"],
        ...data.per_employee.map((row) => [
          row.name,
          row.position ?? "",
          row.transaction_count,
          row.commission,
        ]),
        ["Total", "", t.transaction_count, t.total_commission],
        [""],
        ["Rincian Transaksi"],
        ["Tanggal (WIB)", "Invoice", "Karyawan", "Total (Rp)", "Komisi (Rp)"],
        ...data.transactions.map((txn) => [
          txn.day,
          txn.invoice_number,
          txn.employee_name,
          txn.total,
          txn.commission,
        ]),
      ],
    )
    toast.success("Laporan komisi berhasil diunduh.")
  }

  const totals = data?.totals
  const isEmpty = totals?.transaction_count === 0

  return (
    <div>
      <PageHeader
        title="Komisi Karyawan"
        description="Komisi karyawan dari transaksi lunas yang mereka tangani — zona waktu Asia/Jakarta (WIB)."
        actions={
          <Button
            variant="outline"
            onClick={exportCommission}
            disabled={!data || isLoading}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
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
            <Label htmlFor="commission-start" className="text-xs">
              Tanggal Mulai
            </Label>
            <Input
              id="commission-start"
              type="date"
              value={customStart}
              max={todayIso}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="commission-end" className="text-xs">
              Tanggal Sampai
            </Label>
            <Input
              id="commission-end"
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
          · {formatIsoDayJakarta(start <= end ? start : end)} s/d{" "}
          {formatIsoDayJakarta(start <= end ? end : start)}
        </p>
      </div>

      {/* ---------------- Ringkasan periode ---------------- */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-card shadow-sm">
          <ErrorState
            title="Gagal memuat laporan komisi"
            description={error}
            onRetry={() => void reload()}
          />
        </div>
      ) : totals && data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={HandCoins}
              label="Total Komisi"
              value={formatRupiah(totals.total_commission)}
              hint="Transaksi lunas dengan karyawan"
            />
            <StatCard
              icon={Users}
              label="Karyawan Berkomisi"
              value={String(totals.employee_count)}
              hint="Dalam periode ini"
            />
            <StatCard
              icon={ReceiptText}
              label="Transaksi Berkomisi"
              value={String(totals.transaction_count)}
              hint="Dalam periode ini"
            />
          </div>

          {isEmpty ? (
            <div className="mt-4 rounded-xl border bg-card shadow-sm">
              <EmptyState
                icon={HandCoins}
                title="Belum ada komisi pada periode ini"
                description="Belum ada transaksi lunas dengan karyawan. Tugaskan karyawan saat transaksi di halaman kasir untuk mulai menghitung komisi."
              />
            </div>
          ) : (
            <>
              {/* Rekap per karyawan */}
              <Card className="mt-4 shadow-sm">
                <CardHeader>
                  <CardTitle>Rekap per Karyawan</CardTitle>
                  <CardDescription>
                    Total komisi tiap karyawan pada periode ini
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Karyawan</TableHead>
                        <TableHead className="hidden md:table-cell">
                          Jabatan
                        </TableHead>
                        <TableHead className="text-center">
                          Transaksi
                        </TableHead>
                        <TableHead className="text-right">Komisi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.per_employee.map((row) => (
                        <TableRow key={row.employee_id}>
                          <TableCell className="font-medium">
                            {row.name}
                          </TableCell>
                          <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground md:table-cell">
                            {row.position ?? "—"}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {row.transaction_count}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {formatRupiah(row.commission)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell className="hidden md:table-cell" />
                        <TableCell className="text-center font-semibold">
                          {totals.transaction_count}
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {formatRupiah(totals.total_commission)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </CardContent>
              </Card>

              {/* Rincian transaksi */}
              <Card className="mt-4 shadow-sm">
                <CardHeader>
                  <CardTitle>Rincian Transaksi</CardTitle>
                  <CardDescription>
                    Setiap transaksi lunas yang menghasilkan komisi
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[420px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card">
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead className="hidden sm:table-cell">
                            Tanggal (WIB)
                          </TableHead>
                          <TableHead>Karyawan</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Komisi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.transactions.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell className="font-mono text-xs font-medium">
                              {txn.invoice_number}
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                              {formatIsoDayJakarta(txn.day)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {txn.employee_name}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {formatRupiah(txn.total)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold">
                              {formatRupiah(txn.commission)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="font-semibold"
                          >
                            Total
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatRupiah(
                              data.transactions.reduce(
                                (sum, txn) => sum + txn.total,
                                0,
                              ),
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            {formatRupiah(totals.total_commission)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : null}

      {/* Catatan */}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Komisi dihitung dari persen karyawan terhadap total transaksi (setelah
        diskon) saat checkout. Transaksi yang dibatalkan tidak menghasilkan
        komisi.
      </p>
    </div>
  )
}
