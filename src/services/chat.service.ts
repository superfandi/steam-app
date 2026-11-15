import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Kirim percakapan ke Edge Function "chat" (Gemini + function calling).
 * supabase.functions.invoke otomatis menyertakan JWT sesi aktif —
 * Edge Function memverifikasi bahwa pemanggil adalah admin.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("chat", {
    body: { messages },
  })

  if (error) {
    console.error("sendChatMessage:", error)
    if (error instanceof FunctionsHttpError) {
      const detail = (await error.context.json()) as { error?: string }
      throw new Error(detail.error ?? "Asisten gagal merespons. Coba lagi.")
    }
    throw new Error("Tidak dapat menghubungi asisten. Periksa koneksi internet.")
  }

  const reply = (data as { reply?: string })?.reply
  if (!reply) {
    throw new Error("Asisten tidak memberikan jawaban. Coba lagi.")
  }
  return reply
}
