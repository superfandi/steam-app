import { supabase } from "@/lib/supabase"
import type { CommissionReport } from "@/types"

/**
 * Ambil laporan komisi per rentang tanggal (yyyy-mm-dd, WIB)
 * dari RPC get_commission_report.
 * Hanya transaksi lunas dengan karyawan yang dihitung —
 * transaksi dibatalkan otomatis dikecualikan database.
 */
export async function fetchCommissionReport(
  start: string,
  end: string,
): Promise<CommissionReport> {
  const { data, error } = await supabase.rpc("get_commission_report", {
    // Tukar bila urutan terbalik agar sesuai kontrak RPC.
    p_start: start <= end ? start : end,
    p_end: start <= end ? end : start,
  })

  if (error) {
    console.error("fetchCommissionReport:", error)
    throw new Error(
      error.message === "Rentang tanggal tidak valid"
        ? "Rentang tanggal tidak valid."
        : "Gagal memuat laporan komisi. Silakan coba lagi.",
    )
  }

  if (!data) throw new Error("Laporan komisi tidak tersedia.")
  return data as CommissionReport
}
