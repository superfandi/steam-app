import { useState } from "react"
import { toast } from "sonner"
import {
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { VehicleBadge } from "@/components/shared/badges"
import {
  ServiceFormDialog,
} from "@/components/services/ServiceFormDialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useServices, type VehicleTypeFilter } from "@/hooks/useServices"
import { formatDate, formatRupiah } from "@/lib/format"
import {
  createService,
  deleteService,
  setServiceActive,
  updateService,
} from "@/services/services.service"
import type { ServiceRow } from "@/types"
import type { ServiceInput } from "@/services/services.service"

/**
 * Manajemen Layanan — CRUD master layanan pencucian
 * dengan pencarian, filter jenis kendaraan, dan pengelolaan status.
 */
export default function ServicesPage() {
  const {
    services,
    isLoading,
    error,
    reload,
    searchInput,
    setSearchInput,
    vehicleType,
    setVehicleType,
  } = useServices()

  // Dialog tambah/edit
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceRow | null>(null)

  // Dialog hapus
  const [deleting, setDeleting] = useState<ServiceRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(row: ServiceRow) {
    setEditing(row)
    setFormOpen(true)
  }

  async function handleSave(values: ServiceInput): Promise<boolean> {
    try {
      if (editing) {
        await updateService(editing.id, values)
        toast.success("Layanan berhasil diperbarui.")
      } else {
        await createService(values)
        toast.success("Layanan baru berhasil ditambahkan.")
      }
      void reload()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan layanan.")
      return false
    }
  }

  async function handleToggleActive(row: ServiceRow) {
    try {
      await setServiceActive(row.id, !row.is_active)
      toast.success(
        row.is_active
          ? `Layanan "${row.name}" dinonaktifkan.`
          : `Layanan "${row.name}" diaktifkan kembali.`,
      )
      void reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status layanan.")
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setIsDeleting(true)
    try {
      await deleteService(deleting.id)
      toast.success(`Layanan "${deleting.name}" berhasil dihapus.`)
      setDeleting(null)
      void reload()
    } catch (err) {
      // Termasuk kasus layanan pernah dipakai (FK restrict).
      toast.error(err instanceof Error ? err.message : "Gagal menghapus layanan.")
    } finally {
      setIsDeleting(false)
    }
  }

  const isFilterActive =
    searchInput.trim().length > 0 || vehicleType !== "all"
  const hasData = services.length > 0

  return (
    <div>
      <PageHeader
        title="Manajemen Layanan"
        description="Kelola daftar layanan cuci motor & mobil yang muncul di halaman kasir."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tambah Layanan
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama layanan..."
            className="pl-9"
          />
        </div>
        <div className="sm:w-48">
          <Select
            value={vehicleType}
            onValueChange={(value) => setVehicleType(value as VehicleTypeFilter)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Semua jenis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Jenis Kendaraan</SelectItem>
              <SelectItem value="motor">Motor</SelectItem>
              <SelectItem value="mobil">Mobil</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabel */}
      <div className="rounded-xl border bg-card shadow-sm">
        {error ? (
          <ErrorState description={error} onRetry={() => void reload()} />
        ) : isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-10 flex-1 rounded-lg bg-muted animate-pulse" />
                <div className="h-10 w-28 rounded-lg bg-muted animate-pulse" />
                <div className="hidden h-10 w-40 rounded-lg bg-muted animate-pulse sm:block" />
              </div>
            ))}
          </div>
        ) : !hasData && !isFilterActive ? (
          <EmptyState
            icon={Sparkles}
            title="Belum ada layanan"
            description="Tambahkan layanan pertama Anda agar bisa mulai transaksi di halaman kasir."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Tambah Layanan
              </Button>
            }
          />
        ) : !hasData && isFilterActive ? (
          <EmptyState
            icon={Search}
            title="Tidak ada layanan yang cocok"
            description="Coba ubah kata kunci pencarian atau filter jenis kendaraan."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearchInput("")
                  setVehicleType("all")
                }}
              >
                Reset Filter
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Layanan</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Dibuat</TableHead>
                <TableHead className="w-12 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-64">
                    <p className="truncate font-medium">{row.name}</p>
                    {row.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {row.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <VehicleBadge vehicleType={row.vehicle_type} />
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatRupiah(row.price)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span
                      className={
                        row.is_active
                          ? "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"
                          : "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      <span
                        className={
                          row.is_active
                            ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                            : "h-1.5 w-1.5 rounded-full bg-slate-400"
                        }
                        aria-hidden
                      />
                      {row.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {formatDate(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Aksi layanan"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => void handleToggleActive(row)}
                        >
                          <Power className="h-4 w-4" />
                          {row.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setDeleting(row)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialog tambah/edit */}
      <ServiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmit={handleSave}
      />

      {/* Dialog konfirmasi hapus */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus layanan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Layanan{" "}
              <span className="font-semibold text-foreground">
                {deleting?.name}
              </span>{" "}
              akan dihapus permanen. Layanan yang pernah digunakan dalam
              transaksi tidak dapat dihapus — cukup nonaktifkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault() // jaga dialog tetap terbuka sampai selesai
                void handleDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
