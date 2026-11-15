import { useCallback, useEffect, useRef, useState } from "react"

import { useDebouncedValue } from "./useDebouncedValue"
import { fetchTransactions, type TransactionRowWithCashier } from "@/services/transaction.service"
import type { PaymentMethod, PaymentStatus, VehicleType } from "@/types"

export const TRANSACTIONS_PAGE_SIZE = 10

export interface TransactionFiltersState {
  startDate: string
  endDate: string
  vehicleType: "all" | VehicleType
  paymentMethod: "all" | PaymentMethod
  status: "all" | PaymentStatus
}

/**
 * State halaman Riwayat Transaksi:
 * - pencarian (invoice/polisi) ter-debounce,
 * - filter tanggal, kendaraan, pembayaran, status,
 * - pagination server-side dengan penghitung total dari database.
 */
export function useTransactions() {
  const [searchInput, setSearchInput] = useState("")
  const debouncedSearch = useDebouncedValue(searchInput)

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [vehicleType, setVehicleType] = useState<"all" | VehicleType>("all")
  const [paymentMethod, setPaymentMethod] = useState<"all" | PaymentMethod>("all")
  const [status, setStatus] = useState<"all" | PaymentStatus>("all")

  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<TransactionRowWithCashier[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)
  const filterKeyRef = useRef("")

  // Reset ke halaman 1 saat filter berubah (bukan saat pindah halaman).
  useEffect(() => {
    const key = JSON.stringify([
      debouncedSearch,
      startDate,
      endDate,
      vehicleType,
      paymentMethod,
      status,
    ])
    if (filterKeyRef.current !== key) {
      filterKeyRef.current = key
      setPage(1) // no-op bila memang sudah 1 → tidak memicu fetch ganda
    }
  }, [debouncedSearch, startDate, endDate, vehicleType, paymentMethod, status])

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const result = await fetchTransactions(
        {
          search: debouncedSearch,
          startDate,
          endDate,
          vehicleType,
          paymentMethod,
          status,
        },
        page,
        TRANSACTIONS_PAGE_SIZE,
      )
      if (requestIdRef.current !== requestId) return
      setRows(result.rows)
      setTotal(result.total)
    } catch (err) {
      console.error("useTransactions load:", err)
      if (requestIdRef.current !== requestId) return
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memuat riwayat transaksi. Silakan coba lagi.",
      )
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [debouncedSearch, startDate, endDate, vehicleType, paymentMethod, status, page])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = Math.max(1, Math.ceil(total / TRANSACTIONS_PAGE_SIZE))

  function resetFilters() {
    setSearchInput("")
    setStartDate("")
    setEndDate("")
    setVehicleType("all")
    setPaymentMethod("all")
    setStatus("all")
  }

  return {
    searchInput,
    setSearchInput,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    vehicleType,
    setVehicleType,
    paymentMethod,
    setPaymentMethod,
    status,
    setStatus,
    resetFilters,
    rows,
    total,
    page,
    pageCount,
    goToPage: setPage,
    isLoading,
    error,
    reload: load,
  }
}
