import { CloudAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Tampilan konsisten ketika gagal memuat data, dengan tombol coba lagi. */
export function ErrorState({
  title = "Terjadi kesalahan",
  description = "Gagal memuat data. Periksa koneksi internet Anda.",
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
        <CloudAlert className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Coba Lagi
        </Button>
      )}
    </div>
  )
}
