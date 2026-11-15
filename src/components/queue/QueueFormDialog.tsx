import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fetchActiveServices } from "@/services/services.service"
import {
  queueFormSchema,
  type QueueFormValues,
} from "@/lib/validators"
import type { ServiceRow, VehicleType } from "@/types"

interface QueueFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Dipanggil saat form disubmit. Kembalikan true jika berhasil —
   * dialog akan ditutup oleh pemanggil melalui onOpenChange(false).
   */
  onSubmit: (values: QueueFormValues) => Promise<boolean>
}

const VEHICLE_OPTIONS: Array<{ value: VehicleType; label: string }> = [
  { value: "motor", label: "Motor" },
  { value: "mobil", label: "Mobil" },
]

/**
 * Dialog daftarkan pelanggan ke antrian (Fase 12).
 * Daftar layanan dimuat ulang tiap kali jenis kendaraan berubah —
 * hanya layanan aktif yang cocok dengan jenis tersebut.
 */
export function QueueFormDialog({
  open,
  onOpenChange,
  onSubmit,
}: QueueFormDialogProps) {
  const form = useForm({
    resolver: zodResolver(queueFormSchema),
    defaultValues: {
      customer_name: "",
      customer_phone: "",
      plate_number: "",
      vehicle_type: "motor" as VehicleType,
      service_id: "",
      note: "",
    },
  })

  // Layanan aktif untuk jenis kendaraan yang sedang dipilih di form.
  const watchVehicleType = form.watch("vehicle_type")
  const [services, setServices] = useState<ServiceRow[]>([])
  const [isLoadingServices, setIsLoadingServices] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setIsLoadingServices(true)
    fetchActiveServices(watchVehicleType)
      .then((rows) => {
        if (!cancelled) setServices(rows)
      })
      .catch((err) => {
        console.error("QueueFormDialog loadServices:", err)
        if (!cancelled) setServices([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingServices(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, watchVehicleType])

  // Ganti jenis kendaraan → reset pilihan layanan (layanan beda daftar).
  useEffect(() => {
    if (open) form.setValue("service_id", "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchVehicleType])

  // Reset nilai form setiap kali dialog dibuka.
  useEffect(() => {
    if (!open) return
    form.reset({
      customer_name: "",
      customer_phone: "",
      plate_number: "",
      vehicle_type: "motor",
      service_id: "",
      note: "",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const isSubmitting = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Daftarkan Antrian</DialogTitle>
          <DialogDescription>
            Nomor urut dihitung otomatis dan reset setiap hari (WIB). Semua
            kolom opsional kecuali jenis kendaraan.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(async (values) => {
            const success = await onSubmit(values)
            if (success) onOpenChange(false)
          })}
          className="space-y-4"
          noValidate
        >
          {/* Jenis kendaraan */}
          <div className="space-y-2">
            <Label>Jenis Kendaraan</Label>
            <div className="grid grid-cols-2 gap-2">
              {VEHICLE_OPTIONS.map((option) => {
                const active = watchVehicleType === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => form.setValue("vehicle_type", option.value)}
                    className={
                      active
                        ? "rounded-lg border border-primary bg-primary/5 p-2.5 text-sm font-semibold text-primary transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        : "rounded-lg border p-2.5 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {form.formState.errors.vehicle_type?.message && (
              <p className="text-xs text-destructive">
                {form.formState.errors.vehicle_type.message}
              </p>
            )}
          </div>

          {/* Nama pelanggan */}
          <div className="space-y-1.5">
            <Label htmlFor="queue-name">
              Nama Pelanggan{" "}
              <span className="text-xs text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="queue-name"
              placeholder="Nama pelanggan..."
              maxLength={60}
              {...form.register("customer_name")}
            />
          </div>

          {/* No. WhatsApp */}
          <div className="space-y-1.5">
            <Label htmlFor="queue-phone">
              No. WhatsApp{" "}
              <span className="text-xs text-muted-foreground">
                (opsional — untuk kabar antrian)
              </span>
            </Label>
            <Input
              id="queue-phone"
              placeholder="0812xxxxxxx"
              inputMode="tel"
              maxLength={20}
              aria-invalid={Boolean(form.formState.errors.customer_phone)}
              {...form.register("customer_phone")}
            />
            {form.formState.errors.customer_phone?.message && (
              <p className="text-xs text-destructive">
                {form.formState.errors.customer_phone.message}
              </p>
            )}
          </div>

          {/* Nomor polisi */}
          <div className="space-y-1.5">
            <Label htmlFor="queue-plate">
              Nomor Polisi{" "}
              <span className="text-xs text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="queue-plate"
              placeholder="B 1234 ABC"
              className="uppercase"
              maxLength={12}
              {...form.register("plate_number", {
                setValueAs: (value: string) => value.toUpperCase(),
              })}
            />
          </div>

          {/* Layanan yang diminta */}
          <div className="space-y-1.5">
            <Label htmlFor="queue-service">
              Layanan{" "}
              <span className="text-xs text-muted-foreground">
                (opsional — bisa dipilih ulang di kasir)
              </span>
            </Label>
            <Select
              value={form.watch("service_id") || "none"}
              onValueChange={(value) =>
                form.setValue("service_id", value === "none" ? "" : value)
              }
              disabled={isLoadingServices}
            >
              <SelectTrigger id="queue-service" className="w-full">
                <SelectValue
                  placeholder={
                    isLoadingServices ? "Memuat layanan..." : "Pilih layanan..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Belum Ditentukan —</SelectItem>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name} — {service.price.toLocaleString("id-ID")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Catatan */}
          <div className="space-y-1.5">
            <Label htmlFor="queue-note">
              Catatan{" "}
              <span className="text-xs text-muted-foreground">(opsional)</span>
            </Label>
            <Textarea
              id="queue-note"
              placeholder="Misal: motor kotor ban, titip helm..."
              rows={2}
              maxLength={200}
              {...form.register("note")}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "Daftarkan Antrian"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
