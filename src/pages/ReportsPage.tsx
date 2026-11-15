import { BarChart3 } from "lucide-react"

/** Sementara — halaman Laporan diimplementasikan penuh pada Fase 6. */
export default function ReportsPage() {
  return (
    <div className="flex items-center justify-center rounded-2xl border bg-card p-12 text-center">
      <div>
        <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Laporan</p>
        <p className="text-xs text-muted-foreground">
          Modul ini diimplementasikan pada Fase 6.
        </p>
      </div>
    </div>
  )
}
