import { useState } from "react"
import { toast } from "sonner"
import {
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Users,
} from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmployeeFormDialog } from "@/components/employees/EmployeeFormDialog"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useEmployeesAdmin } from "@/hooks/useEmployees"
import { formatDate } from "@/lib/format"
import {
  createEmployee,
  deleteEmployee,
  setEmployeeActive,
  updateEmployee,
  type EmployeeInput,
} from "@/services/employee.service"
import type { EmployeeRow } from "@/types"

/**
 * Kelola Karyawan — CRUD data karyawan pencucian dengan
 * pencarian, pengelolaan status, dan pengaturan komisi persen.
 */
export default function EmployeesPage() {
  const { employees, isLoading, error, reload, searchInput, setSearchInput } =
    useEmployeesAdmin()

  // Dialog tambah/edit
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeRow | null>(null)

  // Dialog hapus
  const [deleting, setDeleting] = useState<EmployeeRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(row: EmployeeRow) {
    setEditing(row)
    setFormOpen(true)
  }

  async function handleSave(values: EmployeeInput): Promise<boolean> {
    try {
      if (editing) {
        await updateEmployee(editing.id, values)
        toast.success("Karyawan berhasil diperbarui.")
      } else {
        await createEmployee(values)
        toast.success("Karyawan baru berhasil ditambahkan.")
      }
      void reload()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan karyawan.")
      return false
    }
  }

  async function handleToggleActive(row: EmployeeRow) {
    try {
      await setEmployeeActive(row.id, !row.is_active)
      toast.success(
        row.is_active
          ? `Karyawan "${row.name}" dinonaktifkan.`
          : `Karyawan "${row.name}" diaktifkan kembali.`,
      )
      void reload()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengubah status karyawan.",
      )
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setIsDeleting(true)
    try {
      await deleteEmployee(deleting.id)
      toast.success(`Karyawan "${deleting.name}" berhasil dihapus.`)
      setDeleting(null)
      void reload()
    } catch (err) {
      // Termasuk kasus karyawan pernah ditugaskan (FK restrict).
      toast.error(
        err instanceof Error ? err.message : "Gagal menghapus karyawan.",
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const isFilterActive = searchInput.trim().length > 0
  const hasData = employees.length > 0

  return (
    <div>
      <PageHeader
        title="Kelola Karyawan"
        description="Data karyawan pengerjakan cucian dan persentase komisi dari total transaksi."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tambah Karyawan
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
            placeholder="Cari nama karyawan..."
            className="pl-9"
          />
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
                <div className="hidden h-10 w-28 rounded-lg bg-muted animate-pulse sm:block" />
                <div className="hidden h-10 w-32 rounded-lg bg-muted animate-pulse lg:block" />
              </div>
            ))}
          </div>
        ) : !hasData && !isFilterActive ? (
          <EmptyState
            icon={Users}
            title="Belum ada karyawan"
            description="Tambahkan karyawan dan atur persen komisinya — karyawan aktif bisa dipilih saat transaksi di kasir."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Tambah Karyawan
              </Button>
            }
          />
        ) : !hasData && isFilterActive ? (
          <EmptyState
            icon={Search}
            title="Tidak ada karyawan yang cocok"
            description="Coba ubah kata kunci pencarian."
            action={
              <Button size="sm" variant="outline" onClick={() => setSearchInput("")}>
                Reset Filter
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Karyawan</TableHead>
                <TableHead className="hidden md:table-cell">Jabatan</TableHead>
                <TableHead className="text-right">Komisi</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Dibuat</TableHead>
                <TableHead className="w-12 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-64">
                    <p className="truncate font-medium">{row.name}</p>
                    {row.phone && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {row.phone}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground md:table-cell">
                    {row.position ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {row.commission_percent}%
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
                          title="Aksi karyawan"
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

      <p className="mt-3 text-xs text-muted-foreground">
        Karyawan ditugaskan lewat halaman kasir; komisi dihitung otomatis saat
        transaksi lunas dan dapat dipantau di menu Komisi.
      </p>

      {/* Dialog tambah/edit */}
      <EmployeeFormDialog
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
            <AlertDialogTitle>Hapus karyawan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Karyawan{" "}
              <span className="font-semibold text-foreground">
                {deleting?.name}
              </span>{" "}
              akan dihapus permanen. Karyawan yang sudah pernah ditugaskan pada
              transaksi tidak dapat dihapus — cukup nonaktifkan agar riwayat
              komisinya tetap utuh.
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
