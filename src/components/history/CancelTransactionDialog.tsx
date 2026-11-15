import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface CancelTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceNumber: string
  isCancelling: boolean
  /** Dipanggil dengan alasan yang sudah tervalidasi. Kembalikan true jika sukses. */
  onConfirm: (reason: string) => Promise<boolean>
}

/**
 * Dialog pembatalan transaksi — alasan wajib (minimal 3 karakter)
 * dan tersimpan ke database melalui RPC cancel_transaction.
 */
export function CancelTransactionDialog({
  open,
  onOpenChange,
  invoiceNumber,
  isCancelling,
  onConfirm,
}: CancelTransactionDialogProps) {
  const [reason, setReason] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  // Reset isi form setiap dialog dibuka.
  useEffect(() => {
    if (open) {
      setReason("")
      setLocalError(null)
    }
  }, [open])

  async function handleSubmit() {
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      setLocalError("Alasan pembatalan wajib diisi (minimal 3 karakter).")
      return
    }
    setLocalError(null)
    const ok = await onConfirm(trimmed)
    if (ok) onOpenChange(false)
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isCancelling) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Batalkan transaksi ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Invoice{" "}
            <span className="font-mono font-semibold text-foreground">
              {invoiceNumber}
            </span>{" "}
            akan ditandai <span className="font-semibold text-destructive">Dibatalkan</span>{" "}
            dan tidak lagi dihitung sebagai pendapatan. Tindakan ini tidak dapat
            dibatalkan (undone) — pastikan sudah yakin.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor="cancel-reason">
            Alasan Pembatalan{" "}
            <span className="text-xs text-muted-foreground">
              (tersimpan dalam catatan)
            </span>
          </Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            placeholder="Contoh: Salah input layanan / pelanggan membatalkan pesanan..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (localError) setLocalError(null)
            }}
          />
          {localError && (
            <p className="text-xs text-destructive">{localError}</p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCancelling}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault() // dialog ditutup setelah sukses
              void handleSubmit()
            }}
            disabled={isCancelling}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isCancelling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              "Ya, Batalkan Transaksi"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
