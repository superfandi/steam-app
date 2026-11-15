import { Plus } from "lucide-react"

import { formatRupiah } from "@/lib/format"
import type { ServiceRow } from "@/types"

/** Kartu layanan pada panel kiri POS — klik untuk menambah ke keranjang. */
export function ServiceCard({
  service,
  onAdd,
}: {
  service: ServiceRow
  onAdd: (service: ServiceRow) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onAdd(service)}
      className="group flex flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug font-semibold">{service.name}</p>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
          <Plus className="h-4 w-4" aria-hidden />
        </span>
      </div>

      {service.description && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
          {service.description}
        </p>
      )}

      <p className="mt-auto pt-3 text-sm font-bold text-primary">
        {formatRupiah(service.price)}
      </p>
    </button>
  )
}
