import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type Theme = "light" | "dark"

/** Kunci localStorage — dipakai juga oleh script anti-flash di index.html. */
const THEME_STORAGE_KEY = "mtwo-theme"

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light"
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // localStorage bisa diblokir (mode privat) — jatuhkan ke preferensi sistem.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

interface ThemeContextValue {
  theme: Theme
  isDark: boolean
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Mode pagi (terang) & malam (gelap).
 * Pilihan disimpan di localStorage dan diterapkan sebagai class `dark`
 * pada <html> — semua warna mengikuti token di src/index.css.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Abaikan — preferensi tetap berlaku untuk sesi ini.
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"))
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, isDark: theme === "dark", setTheme, toggleTheme }),
    [theme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme harus dipakai di dalam ThemeProvider.")
  }
  return context
}
