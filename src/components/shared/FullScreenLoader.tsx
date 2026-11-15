import { Loader2, Droplets } from "lucide-react"

/** Layar penuh pemuatan dengan branding Pandawa Steam. */
export function FullScreenLoader({ label = "Memuat..." }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg">
        <Droplets className="h-6 w-6 text-primary-foreground" />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {label}
      </div>
    </div>
  )
}
