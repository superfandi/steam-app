import { Link } from "react-router-dom"
import { Compass } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Halaman 404 — rute tidak ditemukan. */
export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Compass className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">404</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Halaman yang Anda cari tidak ditemukan.
          </p>
        </div>
        <Button asChild>
          <Link to="/">Kembali ke Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
