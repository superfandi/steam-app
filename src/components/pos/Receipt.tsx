import { formatDateTime, formatRupiah } from "@/lib/format"
import {
  PAYMENT_METHOD_LABELS,
  VEHICLE_TYPE_LABELS,
} from "@/lib/constants"
import type {
  PaymentMethod,
  PaymentStatus,
  TransactionItemRow,
  TransactionRow,
  VehicleType,
} from "@/types"

export interface ReceiptData {
  invoiceNumber: string
  createdAt: string
  cashierName: string | null
  customerName: string | null
  plateNumber: string | null
  vehicleType: VehicleType
  items: Array<{
    name: string
    quantity: number
    price: number
    subtotal: number
  }>
  subtotal: number
  discount: number
  total: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  cashReceived: number | null
  cashChange: number | null
  /** Nama karyawan yang mengerjakan (opsional). */
  operatorName: string | null
}

/**
 * Petakan baris database + item menjadi data struk.
 * `operatorName` = nama karyawan yang mengerjakan (opsional).
 */
export function toReceiptData(
  transaction: TransactionRow,
  items: TransactionItemRow[],
  cashierName: string | null,
  operatorName: string | null = null,
): ReceiptData {
  return {
    invoiceNumber: transaction.invoice_number,
    createdAt: transaction.created_at,
    cashierName,
    customerName: transaction.customer_name,
    plateNumber: transaction.plate_number,
    vehicleType: transaction.vehicle_type,
    items: items.map((item) => ({
      name: item.service_name,
      quantity: item.quantity,
      price: item.service_price,
      subtotal: item.subtotal,
    })),
    subtotal: transaction.subtotal,
    discount: transaction.discount,
    total: transaction.total,
    paymentMethod: transaction.payment_method,
    paymentStatus: transaction.payment_status,
    cashReceived: transaction.cash_received,
    cashChange: transaction.cash_change,
    operatorName,
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  )
}

function DashedDivider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`my-2 border-t border-dashed border-slate-300 ${className}`}
      aria-hidden
    />
  )
}

/**
 * Struk pembayaran bergaya printer thermal 80mm.
 * Dengan class .print-area sehingga hanya struk ini yang tercetak.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  return (
    <div className="print-area mx-auto w-full max-w-[302px] rounded-lg border bg-white px-4 py-4 font-mono text-[11px] leading-relaxed text-slate-900 shadow-sm">
      {/* Kop */}
      <div className="text-center">
        <p className="text-sm font-bold tracking-widest">WASH POS</p>
        <p className="text-[10px] text-slate-500">
          Layanan Cuci Motor &amp; Mobil
        </p>
      </div>

      <DashedDivider />

      {/* Banner transaksi dibatalkan */}
      {data.paymentStatus === "cancelled" && (
        <p className="mb-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-center text-[10px] font-bold tracking-widest text-red-700">
          TRANSAKSI DIBATALKAN
        </p>
      )}

      {/* Info transaksi */}
      <div className="space-y-0.5">
        <Row label="No. Invoice" value={data.invoiceNumber} />
        <Row label="Tanggal" value={formatDateTime(data.createdAt)} />
        {data.cashierName && <Row label="Kasir" value={data.cashierName} />}
        {data.customerName && <Row label="Pelanggan" value={data.customerName} />}
        {data.plateNumber && <Row label="No. Polisi" value={data.plateNumber} />}
        <Row label="Kendaraan" value={VEHICLE_TYPE_LABELS[data.vehicleType]} />
        {data.operatorName && <Row label="Operator" value={data.operatorName} />}
      </div>

      <DashedDivider />

      {/* Item */}
      <div className="space-y-1.5">
        {data.items.map((item, index) => (
          <div key={`${item.name}-${index}`}>
            <div className="flex justify-between gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.name}
              </span>
              <span className="shrink-0 font-medium">
                {formatRupiah(item.subtotal)}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              {item.quantity} x {formatRupiah(item.price)}
            </div>
          </div>
        ))}
      </div>

      <DashedDivider />

      {/* Total */}
      <div className="space-y-0.5">
        <Row label="Subtotal" value={formatRupiah(data.subtotal)} />
        {data.discount > 0 && (
          <Row label="Diskon" value={`- ${formatRupiah(data.discount)}`} />
        )}
        <div className="mt-1 flex justify-between gap-2 border-t border-dashed border-slate-300 pt-1 text-[13px] font-bold">
          <span>TOTAL</span>
          <span>{formatRupiah(data.total)}</span>
        </div>
      </div>

      {/* Pembayaran */}
      <div className="mt-1.5 space-y-0.5">
        <Row label="Metode" value={PAYMENT_METHOD_LABELS[data.paymentMethod]} />
        {data.paymentMethod === "cash" && data.cashReceived !== null && (
          <>
            <Row label="Tunai" value={formatRupiah(data.cashReceived)} />
            {data.cashChange !== null && (
              <Row label="Kembali" value={formatRupiah(data.cashChange)} />
            )}
          </>
        )}
      </div>

      <DashedDivider />

      <p className="text-center text-[10px] text-slate-500">
        Terima kasih telah mempercayai kendaraan Anda kepada kami.
      </p>
    </div>
  )
}
