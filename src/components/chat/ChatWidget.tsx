import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  Bot,
  MessageCircle,
  RotateCcw,
  SendHorizonal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useChat } from "@/hooks/useChat"
import { cn } from "cn"

/**
 * Asisten Data — tombol melayang di kanan-bawah + panel chat (Sheet kanan).
 * Jawaban dihasilkan Gemini di Edge Function dengan data asli dari RPC
 * (pendapatan, transaksi, komisi) — verifikasi admin di server.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const { messages, isSending, error, send, reset } = useChat()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Gulir otomatis ke pesan terbaru.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, isSending])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = input
    setInput("")
    void send(text)
  }

  return (
    <>
      {/* FAB — hanya tampil saat panel tertutup */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Asisten Data"
          className="fixed right-5 bottom-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b p-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" aria-hidden />
              Asisten Data
            </SheetTitle>
            <SheetDescription className="text-xs">
              Tanya data transaksi &amp; komisi — dijawab dari database (WIB)
            </SheetDescription>
          </SheetHeader>

          {/* Daftar pesan */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                    message.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted text-foreground",
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                  <span className="flex gap-1" aria-label="Asisten mengetik">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya data..."
              disabled={isSending}
              className="flex-1"
              aria-label="Pertanyaan untuk asisten"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isSending || !input.trim()}
            >
              <SendHorizonal className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Hapus percakapan"
              onClick={reset}
              disabled={isSending}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
