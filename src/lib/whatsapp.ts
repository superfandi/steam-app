import { formatDateTime, formatRupiah } from "@/lib/format"
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/constants"
import type { ReceiptData } from "@/components/pos/Receipt"
import type { QueueStatus, VehicleType } from "@/types"

/* ------------------------------------------------------------------ */
/* Normalisasi nomor WhatsApp (format internasional tanpa "+")         */
/* ------------------------------------------------------------------ */

/**
 * Ubah input nomor pelanggan menjadi format internasional yang siap
 * dipakai link wa.me (contoh: 6281234567890).
 *
 * Aturan:
 *   - buang semua karakter non-digit (spasi, tanda "-", "+", dst.)
 *   - diawali "0"  → ganti awalan menjadi "62" (08xx → 628xx)
 *   - diawali "8"  → tambahkan awalan "62" (8xx → 628xx)
 *   - panjang akhir wajar: 9–15 digit
 *
 * Mengembalikan null bila nomor tidak valid (termasuk kosong).
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null

  let intl = digits
  if (intl.startsWith("0")) intl = `62${intl.slice(1)}`
  else if (intl.startsWith("8")) intl = `62${intl}`

  if (intl.length < 9 || intl.length > 15) return null
  return intl
}

/* ------------------------------------------------------------------ */
/* Teks struk untuk pesan WhatsApp                                    */
/* ------------------------------------------------------------------ */

/**
 * Susun isi struk sebagai teks pesan WhatsApp (ringkas, ada *bold*).
 *
 * Yang DIKIRIM ke pelanggan: identitas transaksi, item, total, metode bayar.
 * Yang TIDAK dikirim: komisi karyawan & nama kasir (data internal).
 */
export function buildWhatsAppReceiptText(data: ReceiptData): string {
  const lines: string[] = []

  lines.push("*Pandawa Steam*")
  lines.push("Layanan Cuci Motor & Mobil")
  lines.push("─────────────────────")
  if (data.queueNumber != null) {
    lines.push(
      `Antrian     : #${String(data.queueNumber).padStart(2, "0")}`,
    )
  }
  lines.push(`No. Invoice : ${data.invoiceNumber}`)
  lines.push(`Tanggal     : ${formatDateTime(data.createdAt)}`)
  if (data.customerName) lines.push(`Pelanggan   : ${data.customerName}`)
  if (data.plateNumber) lines.push(`No. Polisi  : ${data.plateNumber}`)
  lines.push(`Kendaraan   : ${VEHICLE_TYPE_LABELS[data.vehicleType]}`)

  lines.push("")
  lines.push("*Detail Layanan*")
  for (const item of data.items) {
    lines.push(`• ${item.name} ×${item.quantity} = ${formatRupiah(item.subtotal)}`)
  }

  lines.push("─────────────────────")
  lines.push(`Subtotal    : ${formatRupiah(data.subtotal)}`)
  if (data.discount > 0) {
    lines.push(`Diskon      : - ${formatRupiah(data.discount)}`)
  }
  lines.push(`*TOTAL*     : *${formatRupiah(data.total)}*`)
  lines.push(`Metode      : ${PAYMENT_METHOD_LABELS[data.paymentMethod]}`)

  lines.push("")
  lines.push(
    "Terima kasih telah mempercayai kendaraan Anda kepada kami! 🙏",
  )
  lines.push("Simpan pesan ini sebagai bukti pembayaran.")

  return lines.join("\n")
}

/* ------------------------------------------------------------------ */
/* Teks kabar antrian untuk pesan WhatsApp                             */
/* ------------------------------------------------------------------ */

export interface QueueMessageData {
  queueNumber: number
  customerName: string | null
  plateNumber: string | null
  serviceName: string | null
  vehicleType: VehicleType
  /** Posisi menunggu saat ini (jumlah pelanggan di depan) — untuk sambutan. */
  waitingAhead: number
  /** Perkiraan menunggu dalam menit — untuk sambutan (null = tidak ada data). */
  estimateMinutes: number | null
}

/** Format nomor antrian dua digit: 5 → "05". */
export function formatQueueNumber(queueNumber: number): string {
  return String(queueNumber).padStart(2, "0")
}

/**
 * Susun pesan kabar antrian sesuai tahap:
 *   - menunggu  : sambutan + nomor antrian + perkiraan waktu tunggu
 *   - dipanggil : undangan bersiap (kendaraan akan segera diproses)
 *   - dikerjakan: progres — kendaraan sedang dicuci
 *   - selesai   : undangan ke kasir untuk pembayaran
 */
export function buildQueueMessageText(
  status: QueueStatus,
  data: QueueMessageData,
): string {
  const greetingName = data.customerName ? ` ${data.customerName}` : ""
  const vehicleInfo =
    data.plateNumber !== null && data.plateNumber !== ""
      ? ` (${data.plateNumber})`
      : ""
  const queueTag = `antrian *#${formatQueueNumber(data.queueNumber)}*${vehicleInfo}`

  switch (status) {
    case "menunggu": {
      const lines: string[] = []
      lines.push("*Pandawa Steam*")
      lines.push("Layanan Cuci Motor & Mobil")
      lines.push("─────────────────────")
      lines.push(`Halo${greetingName}! 👋`)
      lines.push("")
      lines.push(`Anda terdaftar di ${queueTag}`)
      if (data.serviceName) lines.push(`Layanan: ${data.serviceName}`)
      lines.push(
        `Kendaraan: ${VEHICLE_TYPE_LABELS[data.vehicleType]}`,
      )
      if (data.waitingAhead > 0) {
        lines.push(`Masih menunggu ± ${data.waitingAhead} pelanggan lagi`)
      }
      if (data.estimateMinutes !== null && data.estimateMinutes > 0) {
        lines.push(`Perkiraan menunggu: ± ${data.estimateMinutes} menit`)
      }
      lines.push("")
      lines.push("Terima kasih atas kesabarannya 🙏")
      return lines.join("\n")
    }
    case "dipanggil":
      return (
        `*Pandawa Steam*\n\n` +
        `Halo${greetingName}! ${queueTag} akan segera kami proses — ` +
        `mohon bersiap di lokasi ya 🙏`
      )
    case "dikerjakan":
      return (
        `*Pandawa Steam*\n\n` +
        `Kendaraan Anda ${queueTag} sedang kami kerjakan ✨ ` +
        `Kami kabari lagi begitu selesai 🙏`
      )
    case "selesai":
      return (
        `*Pandawa Steam*\n\n` +
        `Halo${greetingName}! Cucian Anda ${queueTag} sudah *SELESAI* ✅\n` +
        `Silakan ke kasir untuk pembayaran ya 🙏\n` +
        `Terima kasih telah mempercayai kendaraan Anda kepada kami!`
      )
    case "batal":
      return ""
  }
}

/* ------------------------------------------------------------------ */
/* Buka WhatsApp dengan pesan siap kirim                              */
/* ------------------------------------------------------------------ */

/**
 * Buka WhatsApp (aplikasi / WhatsApp Web) dengan nomor & pesan struk
 * yang sudah terisi — admin tinggal menekan tombol kirim.
 *
 * Memakai link wa.me (gratis, tanpa API WhatsApp Business), jadi tidak
 * ada kredensial pihak ketiga dan pesan dibuat sepenuhnya di browser.
 */
export function sendWhatsAppMessage(phone: string, text: string): void {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  window.open(url, "_blank", "noopener,noreferrer")
}
