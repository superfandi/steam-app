import { supabase } from "@/lib/supabase"
import { getDbErrorCode } from "@/lib/errors"
import type { EmployeeRow } from "@/types"

export interface EmployeeInput {
  name: string
  phone: string | null
  position: string | null
  commission_percent: number
  is_active: boolean
}

/** Terjemahkan error DB menjadi pesan ramah untuk modul karyawan. */
function describeEmployeeError(error: unknown, fallback: string): string {
  const code = getDbErrorCode(error)
  if (code === "23505") {
    return "Nama karyawan sudah digunakan."
  }
  if (code === "23503") {
    return "Karyawan sudah pernah ditugaskan pada transaksi sehingga tidak dapat dihapus. Nonaktifkan saja."
  }
  if (code === "42501") {
    return "Sesi Anda tidak memiliki izin untuk aksi ini. Silakan login ulang."
  }
  return fallback
}

/** Ambil daftar karyawan dengan pencarian nama. */
export async function fetchEmployees(filters: {
  search: string
}): Promise<EmployeeRow[]> {
  let query = supabase.from("employees").select("*")

  const term = filters.search.trim()
  if (term) {
    query = query.ilike("name", `%${term}%`)
  }

  const { data, error } = await query.order("name", { ascending: true })

  if (error) throw error
  return (data ?? []) as EmployeeRow[]
}

/** Ambil karyawan AKTIF (dropdown penugasan di POS). */
export async function fetchActiveEmployees(): Promise<EmployeeRow[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (error) throw error
  return (data ?? []) as EmployeeRow[]
}

/** Tambah karyawan baru. */
export async function createEmployee(input: EmployeeInput): Promise<void> {
  const { error } = await supabase.from("employees").insert({
    name: input.name,
    phone: input.phone,
    position: input.position,
    commission_percent: input.commission_percent,
    is_active: input.is_active,
  })
  if (error) {
    console.error("createEmployee:", error)
    throw new Error(describeEmployeeError(error, "Gagal menyimpan karyawan baru."))
  }
}

/** Perbarui karyawan yang sudah ada. */
export async function updateEmployee(
  id: string,
  input: EmployeeInput,
): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update({
      name: input.name,
      phone: input.phone,
      position: input.position,
      commission_percent: input.commission_percent,
      is_active: input.is_active,
    })
    .eq("id", id)
  if (error) {
    console.error("updateEmployee:", error)
    throw new Error(describeEmployeeError(error, "Gagal memperbarui karyawan."))
  }
}

/** Aktifkan / nonaktifkan karyawan (tanpa menghapus). */
export async function setEmployeeActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update({ is_active: isActive })
    .eq("id", id)
  if (error) {
    console.error("setEmployeeActive:", error)
    throw new Error(describeEmployeeError(error, "Gagal mengubah status karyawan."))
  }
}

/**
 * Hapus karyawan.
 * Database menolak (FK restrict) jika karyawan pernah ditugaskan
 * di transaksi — errornya diterjemahkan menjadi saran menonaktifkan.
 */
export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await supabase.from("employees").delete().eq("id", id)
  if (error) {
    console.error("deleteEmployee:", error)
    throw new Error(describeEmployeeError(error, "Gagal menghapus karyawan."))
  }
}
