import { useCallback, useEffect, useRef, useState } from "react"

import { fetchActiveServices } from "@/services/services.service"
import type { ServiceRow, VehicleType } from "@/types"

/**
 * Daftar layanan aktif untuk satu jenis kendaraan (panel kiri POS).
 * Ada pengaman stale-response saat pengguna berpindah tab cepat.
 */
export function usePosServices(vehicleType: VehicleType) {
  const [services, setServices] = useState<ServiceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const rows = await fetchActiveServices(vehicleType)
      if (requestIdRef.current !== requestId) return
      setServices(rows)
    } catch (err) {
      console.error("usePosServices load:", err)
      if (requestIdRef.current !== requestId) return
      setError("Gagal memuat daftar layanan. Silakan coba lagi.")
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [vehicleType])

  useEffect(() => {
    void load()
  }, [load])

  return { services, isLoading, error, reload: load }
}
