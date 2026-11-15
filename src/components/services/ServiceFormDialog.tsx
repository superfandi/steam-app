import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { serviceFormSchema, type ServiceFormValues } from "@/lib/validators"
import type { ServiceInput } from "@/services/services.service"
import type { ServiceRow } from "@/types"

interface ServiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Layanan yang sedang diedit; null berarti mode tambah. */
  editing: ServiceRow | null
  /**
   * Dipanggil saat form disubmit. Kembalikan true jika berhasil —
   * dialog akan ditutup oleh pemanggil melalui onOpenChange(false).
   */
  onSubmit: (values: ServiceInput) => Promise<boolean>
}

/**
 * Dialog form tambah/edit layanan pencucian.
 * Validasi memakai Zod; jenis kendaraan & status memakai Controller RHF.
 */
export function ServiceFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: ServiceFormDialogProps) {
  const form = useForm({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      vehicle_type: "motor" as ServiceFormValues["vehicle_type"],
      price: 0,
      description: "",
      is_active: true,
    },
  })

  // Reset nilai form setiap kali dialog dibuka (tambah vs edit).
  useEffect(() => {
    if (!open) return
    if (editing) {
      form.reset({
        name: editing.name,
        vehicle_type: editing.vehicle_type,
        price: editing.price,
        description: editing.description ?? "",
        is_active: editing.is_active,
      })
    } else {
      form.reset({
        name: "",
        vehicle_type: "motor",
        price: 0,
        description: "",
        is_active: true,
      })
    }
  }, [open, editing, form])

  const isSubmitting = form.formState.isSubmitting
  const errors = form.formState.errors

  const handleSubmit = form.handleSubmit(async (values) => {
    const payload: ServiceInput = {
      name: values.name,
      vehicle_type: values.vehicle_type,
      price: values.price,
      description: values.description?.trim() ? values.description.trim() : null,
      is_active: values.is_active,
    }
    const ok = await onSubmit(payload)
    if (ok) {
      onOpenChange(false)
    }
  })

  function handleOpenChange(next: boolean) {
    // Jangan tutup dialog saat sedang menyimpan.
    if (!next && isSubmitting) return
    if (!next) form.reset()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Layanan" : "Tambah Layanan"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Perubahan harga hanya memengaruhi transaksi selanjutnya — riwayat transaksi tetap memakai snapshot harga."
              : "Layanan aktif akan langsung muncul di halaman kasir (POS)."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Nama layanan */}
          <div className="space-y-2">
            <Label htmlFor="service-name">Nama Layanan</Label>
            <Input
              id="service-name"
              placeholder="Contoh: Cuci Motor + Vacuum"
              {...form.register("name")}
            />
            {errors.name?.message && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Jenis kendaraan */}
            <div className="space-y-2">
              <Label>Jenis Kendaraan</Label>
              <Controller
                name="vehicle_type"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih jenis" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="motor">Motor</SelectItem>
                      <SelectItem value="mobil">Mobil</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.vehicle_type?.message && (
                <p className="text-xs text-destructive">
                  {errors.vehicle_type.message}
                </p>
              )}
            </div>

            {/* Harga */}
            <div className="space-y-2">
              <Label htmlFor="service-price">Harga (Rupiah)</Label>
              <Input
                id="service-price"
                type="number"
                min={0}
                step={500}
                placeholder="15000"
                {...form.register("price")}
              />
              {errors.price?.message && (
                <p className="text-xs text-destructive">{errors.price.message}</p>
              )}
            </div>
          </div>

          {/* Deskripsi */}
          <div className="space-y-2">
            <Label htmlFor="service-description">
              Deskripsi{" "}
              <span className="text-xs text-muted-foreground">(opsional)</span>
            </Label>
            <Textarea
              id="service-description"
              placeholder="Keterangan singkat isi layanan..."
              rows={3}
              {...form.register("description")}
            />
            {errors.description?.message && (
              <p className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Status aktif */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="service-active">Status Layanan</Label>
              <p className="text-xs text-muted-foreground">
                Nonaktif menyembunyikan layanan dari kasir tanpa menghapusnya.
              </p>
            </div>
            <Controller
              name="is_active"
              control={form.control}
              render={({ field }) => (
                <Switch
                  id="service-active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
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
                (editing ? "Simpan Perubahan" : "Tambah Layanan")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
