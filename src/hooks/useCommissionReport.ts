import { useCallback, useEffect, useRef, useState } from "react"

import { fetchCommissionReport } from "@/services/commission.service"
import type { CommissionReport } from "@/types"

/**
 * Data laporan komisi untuk satu rentang tanggal (yyyy-mm-dd, WIB)
 * dari RPC get_commission_report. Transaksi dibatalkan otomatis
 * dikecualikan di database.
 *
 * Pengaman: request lama diabaikan bila rentang diganti cepat,
 * dan fetch dilewati bila tanggal belum lengkap.
 */
export function useCommissionReport(start: string, end: string) {
  const [data, setData] = useState<CommissionReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const isValid = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const result = await fetchCommissionReport(start, end)
      if (requestIdRef.current !== requestId) return
      setData(result)
    } catch (err) {
      console.error("useCommissionReport load:", err)
      if (requestIdRef.current !== requestId) return
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memuat laporan komisi. Silakan coba lagi.",
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
