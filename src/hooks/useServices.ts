import { useCallback, useEffect, useRef, useState } from "react"

import { useDebouncedValue } from "./useDebouncedValue"
import { fetchServices } from "@/services/services.service"
import type { ServiceRow, VehicleType } from "@/types"

export type VehicleTypeFilter = "all" | VehicleType

/**
 * State daftar layanan + pencarian (ter-debounce) + filter jenis kendaraan.
 * Dilengkapi pengaman stale-response (request id) agar perubahan filter
 * cepat tidak menimpa hasil query terbaru dengan hasil yang lama.
 */
export function useServices() {
  const [searchInput, setSearchInput] = useState("")
  const [vehicleType, setVehicleType] = useState<VehicleTypeFilter>("all")
  const debouncedSearch = useDebouncedValue(searchInput)

  const [services, setServices] = useState<ServiceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const rows = await fetchServices({
        search: debouncedSearch,
        vehicleType,
      })
      if (requestIdRef.current !== requestId) return // respons lama, abaikan
      setServices(rows)
    } catch (err) {
      console.error("useServices load:", err)
      if (requestIdRef.current !== requestId) return
      setError("Gagal memuat daftar layanan. Silakan coba lagi.")
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [debouncedSearch, vehicleType])

  useEffect(() => {
    void load()
  }, [load])

  return {
    services,
    isLoading,
    error,
    reload: load,
    searchInput,
    setSearchInput,
    vehicleType,
    setVehicleType,
  }
}
