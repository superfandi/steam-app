import { useCallback, useState } from "react"

import { sendChatMessage, type ChatMessage } from "@/services/chat.service"

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    'Halo! 👋 Saya asisten data Pandawa Steam. Tanyakan apa saja tentang data Anda — misalnya "berapa pendapatan hari ini?" atau "komisi minggu ini".',
}

/**
 * Percakapan asisten data: state pesan + kirim ke Edge Function "chat".
 * Riwayat disimpan di memori (hilang saat refresh) — anggap seperti sesi.
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isSending) return

      const next = [
        ...messages,
        { role: "user", content: trimmed } as ChatMessage,
      ]
      setMessages(next)
      setIsSending(true)
      setError(null)

      try {
        const reply = await sendChatMessage(next)
        setMessages([...next, { role: "assistant", content: reply }])
      } catch (err) {
        console.error("useChat send:", err)
        setError(err instanceof Error ? err.message : "Gagal mengirim pesan.")
      } finally {
        setIsSending(false)
      }
    },
    [messages, isSending],
  )

  const reset = useCallback(() => {
    setMessages([GREETING])
    setError(null)
  }, [])

  return { messages, isSending, error, send, reset }
}
