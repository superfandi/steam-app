import { useEffect, useState } from "react"
import { CircleCheck, Loader2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { formatRupiah } from "@/lib/format"
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/constants"
import type { CartLine } from "@/hooks/usePosCart"
import type { PaymentMethod, VehicleType } from "@/types"

interface CheckoutConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicleType: VehicleType
  lines: CartLine[]
  subtotal: number
  discount: number
  total: number
  paymentMethod: PaymentMethod
  cashReceived: number | null
  cashChange: number | null
  /** Nama karyawan yang ditugaskan (null = tanpa karyawan). */
  employeeName: string | null
  /** Estimasi komisi karyawan — angka final dihitung database. */
  commission: number | null
  customerName: string
  plateNumber: string
  isProcessing: boolean
  onConfirm: () => void
}

/**
 * Dialog konfirmasi sebelum transaksi disimpan:
 * - Cash  : ringkasan + uang diterima/kembalian.
 * - QRIS / Transfer : wajib menandai bahwa pembayaran sudah
 *   diverifikasi admin (sesuai alur yang disepakati).
 */
export function CheckoutConfirmDialog({
  open,
  onOpenChange,
  vehicleType,
  lines,
  subtotal,
  discount,
  total,
  paymentMethod,
  cashReceived,
  cashChange,
  employeeName,
  commission,
  customerName,
  plateNumber,
  isProcessing,
  onConfirm,
}: CheckoutConfirmDialogProps) {
  const [paymentVerified, setPaymentVerified] = useState(false)

  // Reset checkbox verifikasi setiap kali dialog dibuka.
  useEffect(() => {
    if (open) setPaymentVerified(false)
  }, [open])

  const isNonCash = paymentMethod !== "cash"
  const canConfirm = isProcessing || (isNonCash && !paymentVerified)

  function handleOpenChange(next: boolean) {
    if (!next && isProcessing) return // jangan tutup saat memproses
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Konfirmasi Pembayaran</DialogTitle>
          <DialogDescription>
            Periksa kembali detail transaksi sebelum disimpan.
          </DialogDescription>
        </DialogHeader>

        {/* Detail singkat */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Jenis Kendaraan</span>
            <span className="font-medium">
              {VEHICLE_TYPE_LABELS[vehicleType]}
            </span>
          </div>
          {(customerName || plateNumber) && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Pelanggan</span>
              <span className="max-w-40 truncate font-medium">
                {customerName || "-"}{plateNumber ? ` · ${plateNumber}` : ""}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-3">
          <ul className="space-y-1.5 text-sm">
            {lines.map((line) => (
              <li key={line.service.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {line.service.name}
                  <span className="text-muted-foreground"> ×{line.quantity}</span>
                </span>
                <span className="shrink-0 font-medium">
                  {formatRupiah(line.service.price * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <Separator className="my-3" />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatRupiah(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diskon</span>
                <span className="text-destructive">
                  - {formatRupiah(discount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatRupiah(total)}</span>
            </div>
          </div>
        </div>

        {/* Metode pembayaran */}
        <div className="rounded-lg border p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Metode</span>
            <span className="font-medium">
              {PAYMENT_METHOD_LABELS[paymentMethod]}
            </span>
          </div>
          {employeeName && (
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Karyawan</span>
              <span className="max-w-40 truncate font-medium">
                {employeeName}
              </span>
            </div>
          )}
          {employeeName && commission !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Komisi (estimasi)</span>
              <span className="font-medium">{formatRupiah(commission)}</span>
            </div>
          )}
          {paymentMethod === "cash" && cashReceived !== null && (
            <>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Tunai Diterima</span>
                <span className="font-medium">
                  {formatRupiah(cashReceived)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kembalian</span>
                <span className="font-semibold text-emerald-700">
                  {formatRupiah(cashChange)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Verifikasi pembayaran non-tunai */}
        {isNonCash && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <Label
                htmlFor="payment-verified"
                className="text-xs leading-snug font-normal text-amber-900"
              >
                Pembayaran {PAYMENT_METHOD_LABELS[paymentMethod]} sudah
                diterima dan diverifikasi.
              </Label>
            </div>
            <Switch
              id="payment-verified"
              checked={paymentVerified}
              onCheckedChange={setPaymentVerified}
            />
          </div>
        )}

        <DialogFooter className="gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isProcessing}
          >
            Batal
          </Button>
          <Button onClick={onConfirm} disabled={canConfirm}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <CircleCheck className="h-4 w-4" />
                Proses Pembayaran
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
