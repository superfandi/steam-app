import { CircleCheck, Printer, Plus } from "lucide-react"

import { Receipt, toReceiptData } from "@/components/pos/Receipt"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatRupiah } from "@/lib/format"
import type { TransactionDetail } from "@/services/transaction.service"

interface CheckoutSuccessDialogProps {
  open: boolean
  onClose: () => void
  detail: TransactionDetail | null
  cashierName: string | null
}

/**
 * Dialog sukses setelah transaksi tersimpan:
 * menampilkan detail + struk thermal + tombol cetak & transaksi baru.
 */
export function CheckoutSuccessDialog({
  open,
  onClose,
  detail,
  cashierName,
}: CheckoutSuccessDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleCheck className="h-5 w-5 text-emerald-600" />
            Transaksi Berhasil
          </DialogTitle>
          <DialogDescription>
            {detail && (
              <>
                Invoice{" "}
                <span className="font-mono font-semibold text-foreground">
                  {detail.transaction.invoice_number}
                </span>{" "}
                tersimpan — total{" "}
                <span className="font-semibold text-foreground">
                  {formatRupiah(detail.transaction.total)}
                </span>
                .
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {detail && (
          <Receipt
            data={toReceiptData(detail.transaction, detail.items, cashierName)}
          />
        )}

        <DialogFooter className="gap-2 sm:grid sm:grid-cols-2">
          <Button
            variant="outline"
            onClick={() => window.print()}
            disabled={!detail}
          >
            <Printer className="h-4 w-4" />
            Cetak Struk
          </Button>
          <Button onClick={onClose}>
            <Plus className="h-4 w-4" />
            Transaksi Baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
