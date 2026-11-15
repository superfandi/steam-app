import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { supabase } from "@/lib/supabase"
import { computeForecast, type ForecastResult } from "@/lib/forecast"
import type { RevenueHistory } from "@/types"

/** Jumlah hari riwayat yang diambil dari RPC (60 hari termasuk hari ini). */
const HISTORY_DAYS = 60

export type ForecastHorizon = 7 | 14 | 30

/**
 * Data prediksi omzet: deret pendapatan harian 60 hari terakhir
 * (RPC get_revenue_history, WIB) + model Holt-Winters yang dihitung
 * di klien (lib/forecast). Hitung ulang saat horizon diganti sangat
 * murah karena riwayat hanya di-fetch sekali.
 */
export function useForecast(horizon: ForecastHorizon) {
  const [history, setHistory] = useState<RevenueHistory | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_revenue_history",
        { p_days: HISTORY_DAYS },
      )
      if (requestIdRef.current !== requestId) return

      if (rpcError) {
        console.error("useForecast load:", rpcError)
        throw new Error("Gagal memuat data prediksi. Silakan coba lagi.")
      }

      setHistory((data ?? null) as RevenueHistory | null)
    } catch (err) {
      console.error("useForecast load:", err)
      if (requestIdRef.current !== requestId) return
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memuat data prediksi. Silakan coba lagi.",
      )
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Rekompute saat horizon berubah — murni klien, tanpa fetch ulang.
  const forecast = useMemo<ForecastResult | null>(() => {
    if (!history) return null
    return computeForecast(history, horizon)
  }, [history, horizon])

  return { forecast, history, isLoading, error, reload: load }
}
