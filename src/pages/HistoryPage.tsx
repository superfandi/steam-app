import { Link } from "react-router-dom"
import { Eye, FilterX, ReceiptText, Search } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import {
  PaymentMethodBadge,
  PaymentStatusBadge,
  VehicleBadge,
} from "@/components/shared/badges"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  TRANSACTIONS_PAGE_SIZE,
  useTransactions,
} from "@/hooks/useTransactions"
import { formatDateTime, formatRupiah } from "@/lib/format"
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants"
import type { PaymentMethod, PaymentStatus, VehicleType } from "@/types"

/**
 * Riwayat Transaksi:
 * pencarian invoice/polisi, filter tanggal-kendaraan-pembayaran-status,
 * pagination server-side, dan akses detail transaksi.
 */
export default function HistoryPage() {
  const {
    searchInput,
    setSearchInput,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    vehicleType,
    setVehicleType,
    paymentMethod,
    setPaymentMethod,
    status,
    setStatus,
    resetFilters,
    rows,
    total,
    page,
    pageCount,
    goToPage,
    isLoading,
    error,
    reload,
  } = useTransactions()

  const isFilterActive =
    searchInput.trim().length > 0 ||
    startDate !== "" ||
    endDate !== "" ||
    vehicleType !== "all" ||
    paymentMethod !== "all" ||
    status !== "all"

  const from = total === 0 ? 0 : (page - 1) * TRANSACTIONS_PAGE_SIZE + 1
  const to = Math.min(page * TRANSACTIONS_PAGE_SIZE, total)
  const hasData = rows.length > 0

  return (
    <div>
      <PageHeader
        title="Riwayat Transaksi"
        description="Telusuri, periksa, dan cetak ulang struk transaksi yang tersimpan."
      />

      {/* ---------------- Filter bar ---------------- */}
      <div className="mb-4 space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nomor invoice atau nomor polisi..."
              className="pl-9"
            />
          </div>
          {isFilterActive && (
            <Button
              variant="outline"
              onClick={resetFilters}
              className="gap-1.5"
            >
              <FilterX className="h-4 w-4" />
              Reset Filter
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="filter-start" className="text-xs">
              Tanggal Mulai
            </Label>
            <Input
              id="filter-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-end" className="text-xs">
              Tanggal Sampai
            </Label>
            <Input
              id="filter-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Jenis Kendaraan</Label>
            <Select
              value={vehicleType}
              onValueChange={(v) => setVehicleType(v as "all" | VehicleType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Jenis</SelectItem>
                <SelectItem value="motor">Motor</SelectItem>
                <SelectItem value="mobil">Mobil</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pembayaran</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as "all" | PaymentMethod)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Metode</SelectItem>
                <SelectItem value="cash">
                  {PAYMENT_METHOD_LABELS.cash}
                </SelectItem>
                <SelectItem value="qris">
                  {PAYMENT_METHOD_LABELS.qris}
                </SelectItem>
                <SelectItem value="transfer">
                  {PAYMENT_METHOD_LABELS.transfer}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "all" | PaymentStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="paid">
                  {PAYMENT_STATUS_LABELS.paid}
                </SelectItem>
                <SelectItem value="pending">
                  {PAYMENT_STATUS_LABELS.pending}
                </SelectItem>
                <SelectItem value="cancelled">
                  {PAYMENT_STATUS_LABELS.cancelled}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ---------------- Tabel ---------------- */}
      <div className="rounded-xl border bg-card shadow-sm">
        {error ? (
          <ErrorState description={error} onRetry={() => void reload()} />
        ) : isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-9 w-36 rounded-lg bg-muted animate-pulse" />
                <div className="h-9 flex-1 rounded-lg bg-muted animate-pulse" />
                <div className="hidden h-9 w-24 rounded-lg bg-muted animate-pulse sm:block" />
              </div>
            ))}
          </div>
        ) : !hasData && isFilterActive ? (
          <EmptyState
            icon={Search}
            title="Tidak ada transaksi yang cocok"
            description="Coba ubah kata kunci pencarian atau filter yang dipakai."
            action={
              <Button size="sm" variant="outline" onClick={resetFilters}>
                Reset Filter
              </Button>
            }
          />
        ) : !hasData ? (
          <EmptyState
            icon={ReceiptText}
            title="Belum ada transaksi"
            description="Transaksi yang dibuat lewat halaman kasir akan muncul di sini."
            action={
              <Link to="/pos">
                <Button size="sm">Buka Kasir</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden sm:table-cell">Tanggal</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Pelanggan
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    No. Polisi
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Jenis</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Pembayaran
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-10 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>
                      <Link
                        to={`/history/${txn.id}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {txn.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {formatDateTime(txn.created_at)}
                    </TableCell>
                    <TableCell className="hidden max-w-36 truncate text-sm lg:table-cell">
                      {txn.customer_name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {txn.plate_number ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <VehicleBadge vehicleType={txn.vehicle_type} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <PaymentMethodBadge method={txn.payment_method} />
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={txn.payment_status} />
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {formatRupiah(txn.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        title="Lihat detail transaksi"
                      >
                        <Link to={`/history/${txn.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Menampilkan {from}–{to} dari {total} transaksi
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => goToPage(page - 1)}
                >
                  Sebelumnya
                </Button>
                <span className="text-xs text-muted-foreground">
                  Hal. {page} dari {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount || isLoading}
                  onClick={() => goToPage(page + 1)}
                >
                  Selanjutnya
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
