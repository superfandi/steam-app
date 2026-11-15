import { useCallback, useEffect, useRef, useState } from "react"

import { supabase } from "@/lib/supabase"
import type { ReportData } from "@/types"

/**
 * Data laporan pendapatan untuk satu rentang tanggal (yyyy-mm-dd, WIB)
 * dari RPC get_report. Transaksi 'cancelled' tidak dihitung pendapatan.
 *
 * Pengaman: request lama diabaikan bila rentang diganti cepat,
 * dan fetch dilewati bila tanggal belum lengkap.
 */
export function useReport(start: string, end: string) {
  const [data, setData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const isValid = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        "get_report",
        {
          // Tukar bila urutan terbalik agar sesuai kontrak RPC.
          p_start: start <= end ? start : end,
          p_end: start <= end ? end : start,
        },
      )

      if (requestIdRef.current !== requestId) return

      if (rpcError) {
        console.error("useReport load:", rpcError)
        throw new Error(
          rpcError.message === "Rentang tanggal tidak valid"
            ? "Rentang tanggal tidak valid."
            : "Gagal memuat laporan. Silakan coba lagi.",
        )
      }

      if (!result) throw new Error("Laporan tidak tersedia.")
      setData(result as ReportData)
    } catch (err) {
      console.error("useReport load:", err)
      if (requestIdRef.current !== requestId) return
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memuat laporan. Silakan coba lagi.",
      )
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [start, end])

  useEffect(() => {
    if (!isValid) return
    void load()
  }, [isValid, load])

  return { data, isLoading, error, reload: load }
}
