import { Droplets } from "lucide-react"

import { Toaster } from "@/components/ui/sonner"

export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
          <Droplets className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">WASH POS</h1>
        <p className="text-sm text-muted-foreground">
          Fase 1 selesai — fondasi proyek &amp; migrasi database siap.
        </p>
      </div>

      <Toaster />
    </div>
  )
}
