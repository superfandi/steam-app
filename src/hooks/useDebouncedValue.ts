import { useEffect, useState } from "react"

/**
 * Menunda nilai (debounce) — dipakai untuk input pencarian
 * agar query database tidak berjalan setiap ketikan.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
