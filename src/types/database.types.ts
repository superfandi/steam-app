/**
 * Tipe data yang mencerminkan skema database Supabase (migrations 001)
 * dan bentuk hasil fungsi RPC (migrations 003).
 */

export type VehicleType = "motor" | "mobil"
export type PaymentMethod = "cash" | "qris" | "transfer"
export type PaymentStatus = "pending" | "paid" | "cancelled"

export interface ProfileRow {
  id: string
  full_name: string
  role: "admin"
  created_at: string
}

export interface ServiceRow {
  id: string
  name: string
  vehicle_type: VehicleType
  price: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TransactionRow {
  id: string
  invoice_number: string
  cashier_id: string | null
  customer_name: string | null
  plate_number: string | null
  vehicle_type: VehicleType
  subtotal: number
  discount: number
  total: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  cash_received: number | null
  cash_change: number | null
  cancel_reason: string | null
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface TransactionItemRow {
  id: string
  transaction_id: string
  service_id: string
  service_name: string
  service_price: number
  quantity: number
  subtotal: number
  created_at: string
}

/* ------------------------------------------------------------------ */
/* Bentuk hasil RPC get_dashboard_summary()                            */
/* ------------------------------------------------------------------ */

export interface DashboardPaymentSummaryItem {
  payment_method: PaymentMethod
  transaction_count: number
  revenue: number
}

export interface DashboardDailyPoint {
  day: string
  revenue: number
  transaction_count: number
}

export interface DashboardSummary {
  date: string
  today_revenue: number
  today_transactions: number
  today_motor: number
  today_mobil: number
  payment_summary: DashboardPaymentSummaryItem[]
  daily_series: DashboardDailyPoint[]
}

/* ------------------------------------------------------------------ */
/* Bentuk hasil RPC get_report()                                       */
/* ------------------------------------------------------------------ */

export interface ReportTotals {
  revenue: number
  transaction_count: number
  motor_revenue: number
  mobil_revenue: number
  cash_revenue: number
  qris_revenue: number
  transfer_revenue: number
  cancelled_count: number
}

export interface ReportDailyRow {
  day: string
  revenue: number
  transaction_count: number
  motor_revenue: number
  mobil_revenue: number
  cash_revenue: number
  qris_revenue: number
  transfer_revenue: number
}

export interface ReportData {
  start_date: string
  end_date: string
  totals: ReportTotals
  daily: ReportDailyRow[]
}

/* ------------------------------------------------------------------ */
/* RPC create_transaction                                              */
/* ------------------------------------------------------------------ */

export interface CreateTransactionItemInput {
  service_id: string
  quantity: number
}

export interface CreateTransactionResult {
  transaction_id: string
  invoice_number: string
  subtotal: number
  discount: number
  total: number
  payment_method: PaymentMethod
  cash_change: number | null
}
