import type { PaymentMethod, PaymentStatus, VehicleType } from "@/types"

/** Label tampilan untuk nilai enum database. */
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  motor: "Motor",
  mobil: "Mobil",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer Bank",
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Menunggu",
  paid: "Lunas",
  cancelled: "Dibatalkan",
}
