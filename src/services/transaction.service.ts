import { supabase } from "@/lib/supabase"
import {
  dayStartIsoJakarta,
  nextDayStartIsoJakarta,
} from "@/lib/format"
import type {
  CreateTransactionItemInput,
  CreateTransactionResult,
  PaymentMethod,
  PaymentStatus,
  TransactionItemRow,
  TransactionRow,
  VehicleType,
} from "@/types"

/**
 * Ambil transaksi terbaru untuk dashboard.
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

/* ------------------------------------------------------------------ */
/* Checkout POS (RPC atomik create_transaction)                        */
/* ------------------------------------------------------------------ */

export interface CreateTransactionPayload {
  vehicleType: VehicleType
  items: CreateTransactionItemInput[]
  paymentMethod: PaymentMethod
  discount: number
  customerName: string | null
  plateNumber: string | null
  cashReceived: number | null
}

/**
 * Menerjemahkan error RPC/PostgREST menjadi pesan ramah pengguna.
 * Pesan exception dari RPC (migrasi 003) sudah berbahasa Indonesia
 * sehingga langsung dipakai bila tersedia.
 */
export function mapTransactionError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message).trim()
    if (message) return message
  }
  if (error instanceof Error && error.message) return error.message
  return "Gagal memproses transaksi. Silakan coba lagi."
}

/**
 * Buat transaksi secara atomik lewat RPC database:
 * - harga diambil dari tabel services (bukan dari frontend),
 * - nomor invoice unik INV-YYMMDD-NNNN,
 * - header + detail tersimpan dalam satu transaksi database.
 */
export async function createTransaction(
  input: CreateTransactionPayload,
): Promise<CreateTransactionResult> {
  const { data, error } = await supabase.rpc("create_transaction", {
    p_vehicle_type: input.vehicleType,
    p_items: input.items,
    p_payment_method: input.paymentMethod,
    p_discount: input.discount,
    p_customer_name: input.customerName,
    p_plate_number: input.plateNumber,
    p_cash_received: input.cashReceived,
  })

  if (error) {
    console.error("createTransaction:", error)
    throw new Error(mapTransactionError(error))
  }

  const rows = data as unknown as CreateTransactionResult[] | null
  const row = rows?.[0]
  if (!row) {
    throw new Error("Transaksi tidak dapat dibuat. Silakan coba lagi.")
  }
  return row
}

export interface TransactionDetail {
  transaction: TransactionRow
  items: TransactionItemRow[]
  cashierName: string | null
}

/**
 * Ambil satu transaksi beserta seluruh item-nya (untuk struk & detail)
 * termasuk nama kasir dari tabel profiles.
 */
export async function fetchTransactionDetail(
  id: string,
): Promise<TransactionDetail> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, transaction_items(*), cashier:profiles(full_name)")
    .eq("id", id)
    .single()

  if (error) {
    console.error("fetchTransactionDetail:", error)
    throw new Error("Gagal memuat detail transaksi.")
  }

  const row = data as (TransactionRow & {
    transaction_items: TransactionItemRow[]
    cashier: { full_name: string } | null
  }) | null
  if (!row) throw new Error("Transaksi tidak ditemukan.")

  const { transaction_items: items, cashier, ...transaction } = row
  return {
    transaction: transaction as TransactionRow,
    items: items ?? [],
    cashierName: cashier?.full_name ?? null,
  }
}

/* ------------------------------------------------------------------ */
/* Riwayat transaksi: filter + pagination                              */
/* ------------------------------------------------------------------ */

export interface TransactionListFilters {
  /** Pencarian nomor invoice ATAU nomor polisi. */
  search: string
  /** "yyyy-mm-dd" atau "" (tanpa batas) — zona Asia/Jakarta. */
  startDate: string
  endDate: string
  vehicleType: "all" | VehicleType
  paymentMethod: "all" | PaymentMethod
  status: "all" | PaymentStatus
}

export interface TransactionRowWithCashier extends TransactionRow {
  cashierName: string | null
}

export interface TransactionListResult {
  rows: TransactionRowWithCashier[]
  total: number
}

/** Bersihkan kata kunci agar aman dipakai di ekspresi `.or()` PostgREST. */
function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/[,%()'\\"]/g, "")
}

/**
 * Ambil daftar transaksi dengan filter & pagination (server-side).
 * Urutan: terbaru lebih dulu. Total dihitung database (count exact).
 */
export async function fetchTransactions(
  filters: TransactionListFilters,
  page: number,
  pageSize: number,
): Promise<TransactionListResult> {
  let query = supabase
    .from("transactions")
    .select("*, cashier:profiles(full_name)", { count: "exact" })

  // --- Pencarian invoice / nomor polisi ---
  const term = sanitizeSearchTerm(filters.search)
  if (term) {
    query = query.or(
      `invoice_number.ilike.%${term}%,plate_number.ilike.%${term}%`,
    )
  }

  // --- Rentang tanggal (Asia/Jakarta) ---
  let { startDate, endDate } = filters
  if (startDate && endDate && startDate > endDate) {
    // Tukar bila urutan terbalik agar hasil tetap masuk akal.
    ;[startDate, endDate] = [endDate, startDate]
  }
  const startIso = startDate ? dayStartIsoJakarta(startDate) : ""
  const endExclusiveIso = endDate ? nextDayStartIsoJakarta(endDate) : ""
  if (startIso) query = query.gte("created_at", startIso)
  if (endExclusiveIso) query = query.lt("created_at", endExclusiveIso)

  // --- Filter lain ---
  if (filters.vehicleType !== "all") {
    query = query.eq("vehicle_type", filters.vehicleType)
  }
  if (filters.paymentMethod !== "all") {
    query = query.eq("payment_method", filters.paymentMethod)
  }
  if (filters.status !== "all") {
    query = query.eq("payment_status", filters.status)
  }

  const from = (page - 1) * pageSize
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1)

  if (error) {
    console.error("fetchTransactions:", error)
    throw new Error("Gagal memuat riwayat transaksi. Silakan coba lagi.")
  }

  const rows = ((data ?? []) as Array<TransactionRow & {
    cashier: { full_name: string } | null
  }>).map(({ cashier, ...txn }) => ({
    ...(txn as TransactionRow),
    cashierName: cashier?.full_name ?? null,
  }))

  return { rows, total: count ?? 0 }
}

/* ------------------------------------------------------------------ */
/* Export CSV laporan: semua transaksi dalam rentang (Asia/Jakarta)    */
/* ------------------------------------------------------------------ */

const EXPORT_PAGE_SIZE = 1000
const EXPORT_MAX_PAGES = 100 // pengaman: maks 100.000 baris

/**
 * Ambil SELURUH transaksi (termasuk yang dibatalkan) dalam rentang
 * tanggal untuk export CSV. Iterasi pagination server-side sampai habis.
 *
 * @param startIsoUtc      batas bawah inklusif (UTC ISO) — tengah malam WIB
 * @param endExclusiveIso  batas atas eksklusif (UTC ISO) — tengah malam WIB +1 hari
 */
export async function fetchTransactionsInRangeForExport(
  startIsoUtc: string,
  endExclusiveIso: string,
): Promise<TransactionRowWithCashier[]> {
  const allRows: TransactionRowWithCashier[] = []

  for (let pageIndex = 0; pageIndex < EXPORT_MAX_PAGES; pageIndex += 1) {
    const from = pageIndex * EXPORT_PAGE_SIZE
    const { data, error } = await supabase
      .from("transactions")
      .select("*, cashier:profiles(full_name)")
      .gte("created_at", startIsoUtc)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: true })
      .range(from, from + EXPORT_PAGE_SIZE - 1)

    if (error) {
      console.error("fetchTransactionsInRangeForExport:", error)
      throw new Error("Gagal mengambil data transaksi untuk export.")
    }

    const rows = ((data ?? []) as Array<TransactionRow & {
      cashier: { full_name: string } | null
    }>).map(({ cashier, ...txn }) => ({
      ...(txn as TransactionRow),
      cashierName: cashier?.full_name ?? null,
    }))

    allRows.push(...rows)

    if (rows.length < EXPORT_PAGE_SIZE) break // halaman terakhir
  }

  return allRows
}

/* ------------------------------------------------------------------ */
/* Pembatalan transaksi (RPC cancel_transaction)                       */
/* ------------------------------------------------------------------ */

/**
 * Batalkan transaksi dengan alasan (wajib, minimal 3 karakter —
 * divalidasi juga di database). Transaksi cancelled tidak dihitung
 * sebagai pendapatan.
 */
export async function cancelTransaction(
  id: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("cancel_transaction", {
    p_transaction_id: id,
    p_reason: reason,
  })
  if (error) {
    console.error("cancelTransaction:", error)
    throw new Error(mapTransactionError(error))
  }
}
