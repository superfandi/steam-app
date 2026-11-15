import { supabase } from "@/lib/supabase"
import type {
  CreateTransactionItemInput,
  CreateTransactionResult,
  PaymentMethod,
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
}

/**
 * Ambil satu transaksi beserta seluruh item-nya (untuk struk & detail).
 */
export async function fetchTransactionDetail(
  id: string,
): Promise<TransactionDetail> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, transaction_items(*)")
    .eq("id", id)
    .single()

  if (error) {
    console.error("fetchTransactionDetail:", error)
    throw new Error("Gagal memuat detail transaksi.")
  }

  const row = data as (TransactionRow & { transaction_items: TransactionItemRow[] }) | null
  if (!row) throw new Error("Transaksi tidak ditemukan.")

  const { transaction_items: items, ...transaction } = row
  return {
    transaction: transaction as TransactionRow,
    items: items ?? [],
  }
}
