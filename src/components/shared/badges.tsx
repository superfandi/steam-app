import {
  Banknote,
  Bike,
  Car,
  CircleCheck,
  CircleX,
  Clock3,
  Landmark,
  QrCode,
  type LucideIcon,
} from "lucide-react"

import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
} from "@/lib/constants"
import type { PaymentMethod, PaymentStatus, VehicleType } from "@/types"

/* ------------------------------------------------------------------ */
/* Badge jenis kendaraan                                               */
/* ------------------------------------------------------------------ */

const vehicleIcons: Record<VehicleType, LucideIcon> = {
  motor: Bike,
  mobil: Car,
}

export function VehicleBadge({ vehicleType }: { vehicleType: VehicleType }) {
  const Icon = vehicleIcons[vehicleType]
  return (
    <Badge variant="outline" className="gap-1.5 bg-muted font-medium">
      <Icon className="h-3 w-3" aria-hidden />
      {VEHICLE_TYPE_LABELS[vehicleType]}
    </Badge>
  )
}

/* ------------------------------------------------------------------ */
/* Badge metode pembayaran                                             */
/* ------------------------------------------------------------------ */

const paymentMethodMeta: Record<PaymentMethod, { icon: LucideIcon; className: string }> = {
  cash: {
    icon: Banknote,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  qris: {
    icon: QrCode,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  transfer: {
    icon: Landmark,
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
}

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const meta = paymentMethodMeta[method]
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", meta.className)}>
      <meta.icon className="h-3 w-3" aria-hidden />
      {PAYMENT_METHOD_LABELS[method]}
    </Badge>
  )
}

/* ------------------------------------------------------------------ */
/* Badge status pembayaran                                             */
/* ------------------------------------------------------------------ */

const paymentStatusMeta: Record<PaymentStatus, { icon: LucideIcon; className: string }> = {
  paid: {
    icon: CircleCheck,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  pending: {
    icon: Clock3,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  cancelled: {
    icon: CircleX,
    className: "bg-red-50 text-red-700 border-red-200",
  },
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const meta = paymentStatusMeta[status]
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", meta.className)}>
      <meta.icon className="h-3 w-3" aria-hidden />
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  )
}
