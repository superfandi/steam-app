import { supabase } from "@/lib/supabase"
import { getDbErrorCode } from "@/lib/errors"
import type { QueueEntryRow, QueueTodayData, VehicleType } from "@/types"

/* ------------------------------------------------------------------ */
/* Tipe input                                                          */
/* ------------------------------------------------------------------ */

export interface CreateQueueEntryPayload {
  customerName: string | null
  customerPhone: string | null
  plateNumber: string | null
  vehicleType: VehicleType
  serviceId: string | null
  note: string | null
}

export interface UpdateQueueStatusPayload {
  queueId: string
  status: "dipanggil" | "dikerjakan" | "selesai" | "batal"
  /** Wajib bila status 'batal' (min. 3 karakter, divalidasi database). */
  cancelReason?: string | null
  /** Kaitkan transaksi POS saat antrian langsung ke 'selesai'. */
  transactionId?: string | null
}

/* ------------------------------------------------------------------ */
/* Pemetaan error database → pesan ramah                               */
/* ------------------------------------------------------------------ */

export function mapQueueError(error: unknown, fallback: string): string {
  const message =
    error instanceof Error && error.message ? error.message : null
  if (message) return message

  const code = getDbErrorCode(error)
  if (code === "42501") {
    return "Sesi Anda tidak memiliki izin untuk aksi ini. Silakan login ulang."
  }
  return fallback
}

/* ------------------------------------------------------------------ */
/* RPC                                                                 */
/* ------------------------------------------------------------------ */

/** Papan antrian hari ini: daftar entri + statistik waktu (WIB). */
export async function fetchQueueToday(): Promise<QueueTodayData> {
  const { data, error } = await supabase.rpc("get_queue_today")
  if (error) {
    console.error("fetchQueueToday:", error)
    throw new Error(
      mapQueueError(error, "Gagal memuat papan antrian. Silakan coba lagi."),
    )
  }
  return data as QueueTodayData
}

/**
 * Daftarkan antrian baru. Nomor urut & normalisasi nomor WhatsApp
 * ditangani database (nomor harian atomik via advisory lock).
 */
export async function createQueueEntry(
  payload: CreateQueueEntryPayload,
): Promise<QueueEntryRow> {
  const { data, error } = await supabase.rpc("create_queue_entry", {
    p_customer_name: payload.customerName,
    p_customer_phone: payload.customerPhone,
    p_plate_number: payload.plateNumber,
    p_vehicle_type: payload.vehicleType,
    p_service_id: payload.serviceId,
    p_note: payload.note,
  })
  if (error) {
    console.error("createQueueEntry:", error)
    throw new Error(
      mapQueueError(error, "Gagal mendaftarkan antrian. Silakan coba lagi."),
    )
  }
  return data as QueueEntryRow
}

/**
 * Pindahkan status antrian (menunggu → dipanggil → dikerjakan →
 * selesai, atau batal dengan alasan). Loncat tahap diperbolehkan.
 */
export async function updateQueueStatus(
  payload: UpdateQueueStatusPayload,
): Promise<QueueEntryRow> {
  const { data, error } = await supabase.rpc("update_queue_status", {
    p_queue_id: payload.queueId,
    p_status: payload.status,
    p_transaction_id: payload.transactionId ?? null,
    p_cancel_reason: payload.cancelReason ?? null,
  })
  if (error) {
    console.error("updateQueueStatus:", error)
    throw new Error(
      mapQueueError(error, "Gagal memperbarui status antrian. Silakan coba lagi."),
    )
  }
  return data as QueueEntryRow
}
