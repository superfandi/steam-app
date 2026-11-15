import { ReceiptText } from "lucide-react"

/** Sementara — halaman Riwayat Transaksi diimplementasikan penuh pada Fase 5. */
export default function HistoryPage() {
  return (
    <div className="flex items-center justify-center rounded-2xl border bg-card p-12 text-center">
      <div>
        <ReceiptText className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Riwayat Transaksi</p>
        <p className="text-xs text-muted-foreground">
          Modul ini diimplementasikan pada Fase 5.
        </p>
      </div>
    </div>
  )
}
