import { useCallback, useEffect, useRef, useState } from "react"

import { useDebouncedValue } from "./useDebouncedValue"
import {
  fetchActiveEmployees,
  fetchEmployees,
} from "@/services/employee.service"
import type { EmployeeRow } from "@/types"

/**
 * Daftar karyawan AKTIF untuk dropdown penugasan di POS.
 * Diambil sekali saat komponen terpasang (mount).
 */
export function useActiveEmployees() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const rows = await fetchActiveEmployees()
      if (requestIdRef.current !== requestId) return
      setEmployees(rows)
    } catch (err) {
      console.error("useActiveEmployees load:", err)
      if (requestIdRef.current !== requestId) return
      setError("Gagal memuat daftar karyawan. Silakan coba lagi.")
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { employees, isLoading, error, reload: load }
}

/**
 * Daftar seluruh karyawan untuk halaman Kelola Karyawan:
 * pencarian ter-debounce, reload, dan pengaman stale-response.
 */
export function useEmployeesAdmin() {
  const [searchInput, setSearchInput] = useState("")
  const debouncedSearch = useDebouncedValue(searchInput)

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const rows = await fetchEmployees({ search: debouncedSearch })
      if (requestIdRef.current !== requestId) return
      setEmployees(rows)
    } catch (err) {
      console.error("useEmployeesAdmin load:", err)
      if (requestIdRef.current !== requestId) return
      setError("Gagal memuat daftar karyawan. Silakan coba lagi.")
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [debouncedSearch])

  useEffect(() => {
    void load()
  }, [load])

  return { employees, isLoading, error, reload: load, searchInput, setSearchInput }
}
