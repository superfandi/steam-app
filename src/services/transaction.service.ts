import { supabase } from "@/lib/supabase"
import type { TransactionRow } from "@/types"

/**
 * Ambil transaksi terbaru untuk dashboard.
 * (Fungsi transaksi lengkap akan ditambahkan pada Fase 4-5.)
 */
export async function fetchRecentTransactions(
  limit = 8,
): Promise<TransactionRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("fetchRecentTransactions:", error)
    throw new Error("Gagal memuat transaksi terbaru.")
  }
  return (data ?? []) as TransactionRow[]
}
