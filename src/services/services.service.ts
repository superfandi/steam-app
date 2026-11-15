import { supabase } from "@/lib/supabase"
import { getDbErrorCode } from "@/lib/errors"
import type { ServiceRow, VehicleType } from "@/types"

export interface ServiceInput {
  name: string
  vehicle_type: VehicleType
  price: number
  description: string | null
  is_active: boolean
}

export interface ServiceFilters {
  search: string
  vehicleType: "all" | VehicleType
}

/** Terjemahkan error DB menjadi pesan ramah untuk modul layanan. */
function describeServiceError(error: unknown, fallback: string): string {
  const code = getDbErrorCode(error)
  if (code === "23505") {
    return "Nama layanan dengan jenis kendaraan tersebut sudah digunakan."
  }
  if (code === "23503") {
    return "Layanan sudah pernah digunakan dalam transaksi sehingga tidak dapat dihapus. Nonaktifkan saja."
  }
  if (code === "42501") {
    return "Sesi Anda tidak memiliki izin untuk aksi ini. Silakan login ulang."
  }
  return fallback
}

/** Ambil daftar layanan dengan pencarian & filter jenis kendaraan. */
export async function fetchServices(
  filters: ServiceFilters,
): Promise<ServiceRow[]> {
  let query = supabase.from("services").select("*")

  const term = filters.search.trim()
  if (term) {
    query = query.ilike("name", `%${term}%`)
  }
  if (filters.vehicleType !== "all") {
    query = query.eq("vehicle_type", filters.vehicleType)
  }

  // Motor ditampilkan lebih dulu, lalu nama menaik.
  const { data, error } = await query
    .order("vehicle_type", { ascending: false })
    .order("name", { ascending: true })

  if (error) throw error
  return (data ?? []) as ServiceRow[]
}

/** Tambah layanan baru. */
export async function createService(input: ServiceInput): Promise<void> {
  const { error } = await supabase.from("services").insert({
    name: input.name,
    vehicle_type: input.vehicle_type,
    price: input.price,
    description: input.description,
    is_active: input.is_active,
  })
  if (error) {
    console.error("createService:", error)
    throw new Error(describeServiceError(error, "Gagal menyimpan layanan baru."))
  }
}

/** Perbarui layanan yang sudah ada. */
export async function updateService(
  id: string,
  input: ServiceInput,
): Promise<void> {
  const { error } = await supabase
    .from("services")
    .update({
      name: input.name,
      vehicle_type: input.vehicle_type,
      price: input.price,
      description: input.description,
      is_active: input.is_active,
    })
    .eq("id", id)
  if (error) {
    console.error("updateService:", error)
    throw new Error(describeServiceError(error, "Gagal memperbarui layanan."))
  }
}

/** Aktifkan / nonaktifkan layanan (tanpa menghapus). */
export async function setServiceActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("services")
    .update({ is_active: isActive })
    .eq("id", id)
  if (error) {
    console.error("setServiceActive:", error)
    throw new Error(describeServiceError(error, "Gagal mengubah status layanan."))
  }
}

/**
 * Hapus layanan.
 * Database menolak (FK restrict) jika layanan pernah dipakai di transaksi —
 * errornya diterjemahkan menjadi saran menonaktifkan.
 */
export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase.from("services").delete().eq("id", id)
  if (error) {
    console.error("deleteService:", error)
    throw new Error(describeServiceError(error, "Gagal menghapus layanan."))
  }
}

/** Ambil layanan AKTIF untuk satu jenis kendaraan (panel POS). */
export async function fetchActiveServices(
  vehicleType: VehicleType,
): Promise<ServiceRow[]> {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("is_active", true)
    .eq("vehicle_type", vehicleType)
    .order("name", { ascending: true })

  if (error) throw error
  return (data ?? []) as ServiceRow[]
}
