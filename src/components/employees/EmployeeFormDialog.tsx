import { useEffect } from "react"
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
import { Switch } from "@/components/ui/switch"
import {
  employeeFormSchema,
  type EmployeeFormValues,
} from "@/lib/validators"
import type { EmployeeInput } from "@/services/employee.service"
import type { EmployeeRow } from "@/types"

interface EmployeeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Karyawan yang sedang diedit; null berarti mode tambah. */
  editing: EmployeeRow | null
  /**
   * Dipanggil saat form disubmit. Kembalikan true jika berhasil —
   * dialog akan ditutup oleh pemanggil melalui onOpenChange(false).
   */
  onSubmit: (values: EmployeeInput) => Promise<boolean>
}

/**
 * Dialog form tambah/edit karyawan pencucian.
 * Validasi memakai Zod; status aktif memakai Controller RHF.
 */
export function EmployeeFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: EmployeeFormDialogProps) {
  const form = useForm({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      position: "",
      commission_percent: 0,
      is_active: true,
    },
  })

  // Reset nilai form setiap kali dialog dibuka (tambah vs edit).
  useEffect(() => {
    if (!open) return
    if (editing) {
      form.reset({
        name: editing.name,
        phone: editing.phone ?? "",
        position: editing.position ?? "",
        commission_percent: editing.commission_percent,
        is_active: editing.is_active,
      })
    } else {
      form.reset({
        name: "",
        phone: "",
        position: "",
        commission_percent: 0,
        is_active: true,
      })
    }
  }, [open, editing, form])

  const isSubmitting = form.formState.isSubmitting
  const errors = form.formState.errors

  const handleSubmit = form.handleSubmit(async (values: EmployeeFormValues) => {
    const payload: EmployeeInput = {
      name: values.name,
      phone: values.phone?.trim() ? values.phone.trim() : null,
      position: values.position?.trim() ? values.position.trim() : null,
      commission_percent: values.commission_percent,
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
            {editing ? "Edit Karyawan" : "Tambah Karyawan"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Perubahan persen komisi hanya memengaruhi transaksi selanjutnya — riwayat tetap memakai snapshot komisi."
              : "Karyawan aktif dapat dipilih pada halaman kasir saat mengerjakan cucian."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Nama */}
          <div className="space-y-2">
            <Label htmlFor="employee-name">Nama Karyawan</Label>
            <Input
              id="employee-name"
              placeholder="Contoh: Budi Santoso"
              {...form.register("name")}
            />
            {errors.name?.message && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Telepon */}
            <div className="space-y-2">
              <Label htmlFor="employee-phone">
                Telepon{" "}
                <span className="text-xs text-muted-foreground">(opsional)</span>
              </Label>
              <Input
                id="employee-phone"
                type="tel"
                placeholder="0812xxxxxxx"
                {...form.register("phone")}
              />
              {errors.phone?.message && (
                <p className="text-xs text-destructive">
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/* Jabatan */}
            <div className="space-y-2">
              <Label htmlFor="employee-position">
                Jabatan{" "}
                <span className="text-xs text-muted-foreground">(opsional)</span>
              </Label>
              <Input
                id="employee-position"
                placeholder="Contoh: Pencuci Senior"
                {...form.register("position")}
              />
              {errors.position?.message && (
                <p className="text-xs text-destructive">
                  {errors.position.message}
                </p>
              )}
            </div>
          </div>

          {/* Komisi */}
          <div className="space-y-2">
            <Label htmlFor="employee-commission">
              Komisi (% dari Total Transaksi)
            </Label>
            <div className="relative">
              <Input
                id="employee-commission"
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="10"
                className="pr-9"
                {...form.register("commission_percent")}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Contoh: 10% berarti karyawan mendapat Rp 5.000 dari transaksi
              sebesar Rp 50.000 (setelah diskon). Angka final dihitung database
              saat checkout.
            </p>
            {errors.commission_percent?.message && (
              <p className="text-xs text-destructive">
                {errors.commission_percent.message}
              </p>
            )}
          </div>

          {/* Status aktif */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="employee-active">Status Karyawan</Label>
              <p className="text-xs text-muted-foreground">
                Nonaktif menyembunyikan karyawan dari pilihan kasir tanpa
                menghapus riwayat komisinya.
              </p>
            </div>
            <Switch
              id="employee-active"
              checked={form.watch("is_active")}
              onCheckedChange={(checked) =>
                form.setValue("is_active", checked, {
                  shouldValidate: false,
                })
              }
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
              ) : editing ? (
                "Simpan Perubahan"
              ) : (
                "Tambah Karyawan"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
