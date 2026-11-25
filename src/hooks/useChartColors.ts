import { useTheme } from "@/hooks/useTheme"

export interface ChartColors {
  /** Garis/isi utama grafik (biru). */
  primary: string
  /** Pita ketidakpastian proyeksi. */
  band: string
  /** Garis kisi Cartesian. */
  grid: string
  /** Teks label sumbu. */
  tick: string
  /** Latar kursor hover Recharts. */
  cursor: string
}

/**
 * Warna grafik Recharts yang menyesuaikan mode pagi/malam.
 * Recharts butuh nilai warna konkret, jadi token CSS tidak bisa dipakai
 * langsung — nilai di bawah diselaraskan dengan palet di index.css.
 */
export function useChartColors(): ChartColors {
  const { isDark } = useTheme()
  return isDark
    ? {
        primary: "#3B82F6",
        band: "#94A3B8",
        grid: "#334155",
        tick: "#94A3B8",
        cursor: "rgba(148, 163, 184, 0.12)",
      }
    : {
        primary: "#2563EB",
        band: "#94A3B8",
        grid: "#E2E8F0",
        tick: "#64748B",
        cursor: "rgba(15, 23, 42, 0.05)",
      }
}
