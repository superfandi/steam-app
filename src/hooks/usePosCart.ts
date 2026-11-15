import { useCallback, useMemo, useState } from "react"

import type { ServiceRow, VehicleType } from "@/types"

export interface CartLine {
  service: ServiceRow
  quantity: number
}

const MAX_QUANTITY = 99

function parseMoneyInput(value: string): number {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * State keranjang POS:
 * - baris layanan + quantity,
 * - diskon nominal rupiah dengan validasi,
 * - kalkulasi subtotal & total.
 */
export function usePosCart() {
  const [lines, setLines] = useState<CartLine[]>([])
  const [discountInput, setDiscountInput] = useState("")

  const cartVehicleType: VehicleType | null =
    lines[0]?.service.vehicle_type ?? null

  const addItem = useCallback((service: ServiceRow) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.service.id === service.id)
      if (existing) {
        return prev.map((l) =>
          l.service.id === service.id
            ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QUANTITY) }
            : l,
        )
      }
      return [...prev, { service, quantity: 1 }]
    })
  }, [])

  const increment = useCallback((serviceId: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.service.id === serviceId
          ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QUANTITY) }
          : l,
      ),
    )
  }, [])

  const decrement = useCallback((serviceId: string) => {
    setLines((prev) => {
      const target = prev.find((l) => l.service.id === serviceId)
      if (!target) return prev
      if (target.quantity <= 1) {
        return prev.filter((l) => l.service.id !== serviceId)
      }
      return prev.map((l) =>
        l.service.id === serviceId ? { ...l, quantity: l.quantity - 1 } : l,
      )
    })
  }, [])

  const removeItem = useCallback((serviceId: string) => {
    setLines((prev) => prev.filter((l) => l.service.id !== serviceId))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  /** Reset penuh untuk transaksi baru. */
  const resetForNewTransaction = useCallback(() => {
    setLines([])
    setDiscountInput("")
  }, [])

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.service.price * l.quantity, 0),
    [lines],
  )

  const discount = useMemo(() => parseMoneyInput(discountInput), [discountInput])

  const discountError: string | null = useMemo(() => {
    if (discount > subtotal) return "Diskon tidak boleh melebihi subtotal."
    return null
  }, [discount, subtotal])

  const total = useMemo(
    () => Math.max(subtotal - discount, 0),
    [subtotal, discount],
  )

  const itemCount = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  )

  return {
    lines,
    cartVehicleType,
    itemCount,
    addItem,
    increment,
    decrement,
    removeItem,
    clear,
    resetForNewTransaction,
    subtotal,
    discountInput,
    setDiscountInput,
    discount,
    discountError,
    total,
  }
}
