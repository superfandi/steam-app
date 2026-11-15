import { formatDateTime, formatRupiah } from "@/lib/format"
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/constants"
import type { ReceiptData } from "@/components/pos/Receipt"

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
