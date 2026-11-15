import { useEffect, useState } from "react"
import { CircleCheck, MessageCircle, Printer, Plus } from "lucide-react"
import { toast } from "sonner"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatRupiah } from "@/lib/format"
import {
  buildWhatsAppReceiptText,
  normalizePhone,
  sendWhatsAppMessage,
} from "@/lib/whatsapp"
import type { TransactionDetail } from "@/services/transaction.service"

interface CheckoutSuccessDialogProps {
  open: boolean
  onClose: () => void
  detail: TransactionDetail | null
  cashierName: string | null
  /** Nomor antrian bila transaksi berasal dari antrian (opsional). */
  queueNumber?: number | null
}

/**
 * Dialog sukses setelah transaksi tersimpan:
 * menampilkan detail + struk thermal + tombol cetak,
 * kirim via WhatsApp, dan transaksi baru.
 */
export function CheckoutSuccessDialog({
  open,
  onClose,
  detail,
  cashierName,
  queueNumber = null,
}: CheckoutSuccessDialogProps) {
  // Nomor WhatsApp pelanggan: terisi otomatis dari transaksi (bila admin
  // mengisinya saat checkout) dan tetap bisa diedit di sini sebelum kirim.
  const [phone, setPhone] = useState("")

  useEffect(() => {
    setPhone(detail?.transaction.customer_phone ?? "")
  }, [detail])

  const intlPhone = normalizePhone(phone)

  async function handleSendWhatsApp() {
    if (!detail || !intlPhone) {
      toast.error(
        "Nomor WhatsApp tidak valid. Gunakan format 08xx atau 62xx.",
      )
      return
    }

    sendWhatsAppMessage(
      intlPhone,
      buildWhatsAppReceiptText(
        toReceiptData(
          detail.transaction,
          detail.items,
          cashierName,
          detail.employeeName,
          queueNumber,
        ),
      ),
    )
    toast.success("Struk dibuka di WhatsApp — tinggal tekan kirim.")
  }

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
            data={toReceiptData(
              detail.transaction,
              detail.items,
              cashierName,
              detail.employeeName,
              queueNumber,
            )}
          />
        )}

        {/* Nomor WhatsApp pelanggan (opsional) untuk kirim struk */}
        {detail && (
          <div className="space-y-1.5">
            <Label htmlFor="wa-phone" className="text-xs">
              No. WhatsApp Pelanggan{" "}
              <span className="text-muted-foreground">
                (opsional — untuk kirim struk)
              </span>
            </Label>
            <Input
              id="wa-phone"
              placeholder="0812xxxxxxx"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
            />
          </div>
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
          <Button
            onClick={() => void handleSendWhatsApp()}
            disabled={!detail || !intlPhone}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            Kirim via WhatsApp
          </Button>
          <Button onClick={onClose} className="sm:col-span-2">
            <Plus className="h-4 w-4" />
            Transaksi Baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
