import { useCallback, useEffect, useRef, useState } from "react"

import { fetchQueueToday } from "@/services/queue.service"
import type { QueueTodayData } from "@/types"

const POLL_INTERVAL_MS = 30_000

/**
 * Papan antrian hari ini (RPC get_queue_today):
 * - dimuat saat mount, setelah setiap aksi (reload), dan
 * - disegarkan otomatis tiap 30 detik agar papan tetap sinkron
 *   bila admin membuka beberapa tab (kasir + antrian).
 * Ada pengaman stale-response terhadap reload yang beririsan.
 */
export function useQueueToday() {
  const [data, setData] = useState<QueueTodayData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const load = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current
    if (!silent) setIsLoading(true)
    setError(null)

    try {
      const result = await fetchQueueToday()
      if (requestIdRef.current !== requestId) return
      setData(result)
    } catch (err) {
      console.error("useQueueToday load:", err)
      if (requestIdRef.current !== requestId) return
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memuat papan antrian. Silakan coba lagi.",
      )
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()
    // Segarkan otomatis (silent) tanpa memicu skeleton berkedip.
    const timer = window.setInterval(() => void load(true), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  return {
    data,
    isLoading,
    error,
    /** Muat ulang manual (tombol) — tampilkan indikator. */
    reload: () => void load(false),
    /** Segarkan senyap setelah aksi berhasil. */
    refresh: () => void load(true),
  }
}
