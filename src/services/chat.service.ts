import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Pesan ramah untuk penolakan platform Supabase — terjadi SEBELUM kode
 * fungsi berjalan (mis. JWT tidak ikut / invalid / expired).
 */
function describePlatformRejection(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes("missing authorization") ||
    lower.includes("invalid jwt") ||
    lower.includes("expired")
  ) {
    return (
      "Sesi login tidak valid atau sudah kedaluwarsa, sehingga server " +
      "menolak permintaan sebelum asisten berjalan. Silakan keluar (logout) " +
      "lalu login ulang, kemudian coba lagi."
    )
  }
  return `Server menolak permintaan asisten: ${message}`
}

/**
 * Kirim percakapan ke Edge Function "chat" (Gemini + function calling).
 * Token sesi dikirim eksplisit di header Authorization — Edge Function
 * memverifikasi bahwa pemanggil adalah admin.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
): Promise<string> {
  // 0. Pre-flight sesi: tanpa token valid, platform menolak request
  //    (body {code,message} tanpa field "error") dan penyebab aslinya
  //    tersembunyi di balik pesan generik. Cek eksplisit + kirim token
  //    secara deterministik supaya diagnosisnya jelas.
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) {
    throw new Error(
      "Sesi login sudah berakhir. Silakan keluar (logout) lalu login ulang, kemudian coba lagi.",
    )
  }

  const { data, error } = await supabase.functions.invoke("chat", {
    body: { messages },
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (error) {
    console.error("sendChatMessage:", error)
    if (error instanceof FunctionsHttpError) {
      // Body error bisa dari Edge Function ({ error }) ATAU dari platform
      // Supabase ({ code, message }). Baca teks mentah dulu agar body
      // non-JSON (mis. halaman HTML saat fungsi gagal boot) tidak
      // memunculkan SyntaxError yang membingungkan.
      const raw = await error.context.text().catch(() => "")
      let message: string | null = null
      try {
        const detail = JSON.parse(raw) as {
          error?: unknown
          message?: unknown
        }
        if (typeof detail.error === "string" && detail.error) {
          message = detail.error
        } else if (typeof detail.message === "string" && detail.message) {
          message = describePlatformRejection(detail.message)
        }
      } catch {
        message = raw ? raw.slice(0, 300) : null
      }
      throw new Error(
        message ??
          `Asisten gagal merespons (HTTP ${error.context.status}). Coba lagi.`,
      )
    }
    if (error instanceof FunctionsRelayError) {
      throw new Error(
        "Asisten mengalami error saat berjalan. Periksa log fungsi \"chat\" di Supabase Dashboard (Edge Functions → Logs).",
      )
    }
    if (error instanceof FunctionsFetchError) {
      throw new Error(
        'Tidak dapat menghubungi asisten. Kemungkinan Edge Function "chat" belum di-deploy atau nama fungsi tidak tepat — ikuti README §5, lalu coba lagi.',
      )
    }
    throw new Error("Tidak dapat menghubungi asisten. Periksa koneksi internet.")
  }

  const reply = (data as { reply?: string })?.reply
  if (!reply) {
    throw new Error("Asisten tidak memberikan jawaban. Coba lagi.")
  }
  return reply
}
