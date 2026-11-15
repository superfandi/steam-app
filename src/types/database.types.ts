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

export interface EmployeeRow {
  id: string
  name: string
  phone: string | null
  position: string | null
  /** Persen komisi dari total transaksi (0-100). */
  commission_percent: number
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
  /** Nomor WhatsApp pelanggan (format internasional 62…, opsional). */
  customer_phone: string | null
  vehicle_type: VehicleType
  subtotal: number
  discount: number
  total: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  cash_received: number | null
  cash_change: number | null
  /** Karyawan yang mengerjakan (opsional). */
  employee_id: string | null
  /** Snapshot komisi karyawan (rupiah) saat transaksi dibuat. */
  commission_amount: number
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
  today_commission: number
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
/* RPC get_revenue_history — deret harian untuk prediksi omzet          */
/* ------------------------------------------------------------------ */

export interface RevenueHistoryPoint {
  /** Tanggal WIB "yyyy-mm-dd". */
  day: string
  /** Total pendapatan lunas hari itu (hari tanpa transaksi = 0). */
  revenue: number
  transaction_count: number
}

export interface RevenueHistory {
  start_date: string
  end_date: string
  /** Deret kontinu dari start_date s.d. end_date (hari kosong = 0). */
  daily: RevenueHistoryPoint[]
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
  employee_name: string | null
  commission_amount: number
}

/* ------------------------------------------------------------------ */
/* Bentuk hasil RPC get_commission_report()                            */
/* ------------------------------------------------------------------ */

export interface CommissionReportTotals {
  total_commission: number
  transaction_count: number
  employee_count: number
}

export interface CommissionEmployeeRow {
  employee_id: string
  name: string
  position: string | null
  transaction_count: number
  commission: number
}

export interface CommissionTransactionRow {
  id: string
  invoice_number: string
  /** Tanggal WIB "yyyy-mm-dd". */
  day: string
  employee_name: string
  total: number
  commission: number
}

export interface CommissionReport {
  start_date: string
  end_date: string
  totals: CommissionReportTotals
  per_employee: CommissionEmployeeRow[]
  transactions: CommissionTransactionRow[]
}

/* ------------------------------------------------------------------ */
/* Antrian harian + notifikasi WhatsApp (migrasi 009)                  */
/* ------------------------------------------------------------------ */

export type QueueStatus =
  | "menunggu"
  | "dipanggil"
  | "dikerjakan"
  | "selesai"
  | "batal"

export interface QueueEntryRow {
  id: string
  /** Nomor urut harian (reset tiap hari WIB): 1, 2, 3, ... */
  queue_number: number
  /** Tanggal antrian "yyyy-mm-dd" (kalender WIB). */
  queue_date: string
  customer_name: string | null
  /** Nomor WhatsApp pelanggan (format internasional 62…, opsional). */
  customer_phone: string | null
  plate_number: string | null
  vehicle_type: VehicleType
  service_id: string | null
  /** Snapshot nama layanan yang diminta (opsional). */
  service_name: string | null
  note: string | null
  status: QueueStatus
  /** Terisi bila antrian selesai lalu dibayar lewat POS. */
  transaction_id: string | null
  cancel_reason: string | null
  called_at: string | null
  started_at: string | null
  done_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

/** Statistik papan antrian (hasil RPC get_queue_today). */
export interface QueueStats {
  waiting_count: number
  called_count: number
  working_count: number
  done_count: number
  cancelled_count: number
  /** Rata-rata menit daftar → mulai dikerjakan (7 hari terakhir). */
  avg_wait_minutes: number
  /** Rata-rata menit mulai dikerjakan → selesai (7 hari terakhir). */
  avg_service_minutes: number
}

/** Bentuk hasil RPC get_queue_today(). */
export interface QueueTodayData {
  date: string
  entries: QueueEntryRow[]
  stats: QueueStats
}
