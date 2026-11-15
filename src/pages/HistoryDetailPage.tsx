import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, CircleX, Printer, ReceiptText } from "lucide-react"

import { CancelTransactionDialog } from "@/components/history/CancelTransactionDialog"
import { FullScreenLoader } from "@/components/shared/FullScreenLoader"
import { ErrorState } from "@/components/shared/ErrorState"
import {
  PaymentMethodBadge,
  PaymentStatusBadge,
  VehicleBadge,
} from "@/components/shared/badges"
import { Receipt, toReceiptData } from "@/components/pos/Receipt"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  cancelTransaction,
  fetchTransactionDetail,
  type TransactionDetail,
} from "@/services/transaction.service"
import { formatDateTime, formatRupiah } from "@/lib/format"

/**
 * Detail Transaksi:
 * informasi lengkap, daftar item (snapshot harga), struk siap cetak ulang,
 * dan pembatalan aman dengan alasan wajib.
 */
export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [detail, setDetail] = useState<TransactionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    try {
      setDetail(await fetchTransactionDetail(id))
    } catch (err) {
      console.error("HistoryDetail load:", err)
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memuat detail transaksi. Silakan coba lagi.",
      )
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCancel(reason: string): Promise<boolean> {
    if (!detail) return false
    setIsCancelling(true)
    try {
      await cancelTransaction(detail.transaction.id, reason)
      toast.success(
        `Transaksi ${detail.transaction.invoice_number} telah dibatalkan.`,
      )
      await load()
      return true
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal membatalkan transaksi. Coba lagi.",
      )
      return false
    } finally {
      setIsCancelling(false)
    }
  }

  /* ---------------- Loading & error ---------------- */
  if (isLoading) {
    return <FullScreenLoader label="Memuat detail transaksi..." />
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border bg-card shadow-sm">
          <ErrorState
            title="Gagal memuat transaksi"
            description={error ?? "Transaksi tidak ditemukan."}
            onRetry={() => void load()}
          />
        </div>
        <div className="mt-4 text-center">
          <Button variant="outline" asChild>
            <Link to="/history">Kembali ke Riwayat</Link>
          </Button>
        </div>
      </div>
    )
  }

  const { transaction, items, cashierName, employeeName } = detail
  const isCancelled = transaction.payment_status === "cancelled"

  return (
    <div className="mx-auto max-w-5xl">
      {/* ---------------- Header ---------------- */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link to="/history" title="Kembali ke riwayat">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-mono text-xl font-bold tracking-tight">
            {transaction.invoice_number}
          </h2>
          <div className="mt-1">
            <PaymentStatusBadge status={transaction.payment_status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Cetak Struk
          </Button>
          {!isCancelled && (
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              <CircleX className="h-4 w-4" />
              Batalkan
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---------------- Kolom kiri: info & item ---------------- */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Informasi Transaksi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <InfoRow label="Tanggal" value={formatDateTime(transaction.created_at)} />
              <InfoRow label="Kasir" value={cashierName ?? "—"} />
              <InfoRow label="Karyawan" value={employeeName ?? "—"} />
              {employeeName && (
                <InfoRow
                  label="Komisi Karyawan"
                  value={formatRupiah(transaction.commission_amount)}
                />
              )}
              <InfoRow
                label="Pelanggan"
                value={transaction.customer_name ?? "—"}
              />
              <InfoRow
                label="No. Polisi"
                value={transaction.plate_number ?? "—"}
              />
              <InfoRow
                label="Jenis Kendaraan"
                value={<VehicleBadge vehicleType={transaction.vehicle_type} />}
              />
              <InfoRow
                label="Metode Pembayaran"
                value={<PaymentMethodBadge method={transaction.payment_method} />}
              />
              {transaction.payment_method === "cash" && (
                <>
                  <InfoRow
                    label="Tunai Diterima"
                    value={formatRupiah(transaction.cash_received)}
                  />
                  <InfoRow
                    label="Kembalian"
                    value={formatRupiah(transaction.cash_change)}
                  />
                </>
              )}

              {/* Alasan pembatalan */}
              {isCancelled && (
                <>
                  <Separator className="my-3" />
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                    <p className="font-semibold text-destructive">
                      Dibatalkan pada {formatDateTime(transaction.cancelled_at)}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Alasan: {transaction.cancel_reason ?? "—"}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">
                Item Layanan ({items.length})
              </CardTitle>
              <CardDescription>
                Harga disalin dari master saat transaksi dibuat (snapshot).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Layanan</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.service_name}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatRupiah(item.service_price)}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {formatRupiah(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Separator className="my-4" />

              <div className="ml-auto max-w-56 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatRupiah(transaction.subtotal)}</span>
                </div>
                {transaction.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Diskon</span>
                    <span className="text-destructive">
                      - {formatRupiah(transaction.discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 text-base font-bold">
                  <span>Total</span>
                  <span>{formatRupiah(transaction.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---------------- Kolom kanan: struk ---------------- */}
        <div className="space-y-4 lg:sticky lg:top-20">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4" />
                Struk
              </CardTitle>
              <CardDescription>
                Pratinjau struk thermal 80mm — gunakan tombol Cetak Struk di
                atas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Receipt
                data={toReceiptData(
                  transaction,
                  items,
                  cashierName,
                  employeeName,
                )}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---------------- Dialog pembatalan ---------------- */}
      <CancelTransactionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        invoiceNumber={transaction.invoice_number}
        isCancelling={isCancelling}
        onConfirm={handleCancel}
      />
    </div>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  )
}
