import { ReceiptText } from "lucide-react"

/** Sementara — detail transaksi diimplementasikan penuh pada Fase 5. */
export default function HistoryDetailPage() {
  return (
    <div className="flex items-center justify-center rounded-2xl border bg-card p-12 text-center">
      <div>
        <ReceiptText className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Detail Transaksi</p>
        <p className="text-xs text-muted-foreground">
          Modul ini diimplementasikan pada Fase 5.
        </p>
      </div>
    </div>
  )
}
