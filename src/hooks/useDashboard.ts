import { useCallback, useEffect, useState } from "react"

import { supabase } from "@/lib/supabase"
import { fetchRecentTransactions } from "@/services/transaction.service"
import type { DashboardSummary, TransactionRow } from "@/types"

/**
 * Data dashboard: ringkasan statistik (RPC get_dashboard_summary,
 * zona Asia/Jakarta) + daftar transaksi terbaru.
 */
export function useDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc("get_dashboard_summary")
      if (rpcError) throw rpcError

      setSummary((data ?? null) as DashboardSummary | null)
      setRecentTransactions(await fetchRecentTransactions(8))
    } catch (err) {
      console.error("useDashboard load:", err)
      setError("Gagal memuat data dashboard. Periksa koneksi lalu coba lagi.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { summary, recentTransactions, isLoading, error, reload: load }
}
