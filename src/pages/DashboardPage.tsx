import { LayoutDashboard } from "lucide-react"

/** Sementara — halaman Dashboard diimplementasikan penuh pada Fase 3. */
export default function DashboardPage() {
  return (
    <div className="flex items-center justify-center rounded-2xl border bg-card p-12 text-center">
      <div>
        <LayoutDashboard className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Dashboard</p>
        <p className="text-xs text-muted-foreground">
          Modul ini diimplementasikan pada Fase 3.
        </p>
      </div>
    </div>
  )
}
