import { ShoppingCart } from "lucide-react"

/** Sementara — halaman POS diimplementasikan penuh pada Fase 4. */
export default function PosPage() {
  return (
    <div className="flex items-center justify-center rounded-2xl border bg-card p-12 text-center">
      <div>
        <ShoppingCart className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Kasir (POS)</p>
        <p className="text-xs text-muted-foreground">
          Modul ini diimplementasikan pada Fase 4.
        </p>
      </div>
    </div>
  )
}
