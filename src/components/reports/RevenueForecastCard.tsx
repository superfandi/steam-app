import { useMemo, useState } from "react"
import { TrendingUp } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useForecast, type ForecastHorizon } from "@/hooks/useForecast"
import { useChartColors } from "@/hooks/useChartColors"
import type { ForecastResult } from "@/lib/forecast"
import { formatCompactRupiah, formatDayLabel, formatRupiah } from "@/lib/format"
import type { RevenueHistory } from "@/types"

/** Berapa hari terakhir riwayat ditampilkan di grafik. */
const HISTORY_SHOWN = 30

const HORIZONS: Array<{ value: ForecastHorizon; label: string }> = [
  { value: 7, label: "7 Hari" },
  { value: 14, label: "14 Hari" },
  { value: 30, label: "30 Hari" },
]

interface ForecastChartPoint {
  label: string
  actual: number | null
  projected: number | null
  lower: number | null
  upper: number | null
}

/** Gabungkan riwayat (terakhir) + proyeksi menjadi titik-titik grafik. */
function buildChartData(
  history: RevenueHistory,
  result: ForecastResult,
): ForecastChartPoint[] {
  const points: ForecastChartPoint[] = history.daily
    .slice(-HISTORY_SHOWN)
    .map((d) => ({
      label: formatDayLabel(d.day),
      actual: d.revenue,
      projected: null,
      lower: null,
      upper: null,
    }))

  // Jembatan: garis proyeksi mulai dari nilai riwayat terakhir.
  if (points.length > 0) {
    points[points.length - 1].projected = points[points.length - 1].actual
  }

  for (const p of result.points) {
    points.push({
      label: formatDayLabel(p.day),
      actual: null,
      projected: p.revenue,
      lower: p.lower,
      upper: p.upper,
    })
  }
  return points
}

/** Tooltip kustom grafik proyeksi. */
function ForecastTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ForecastChartPoint }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{point.label}</p>
      {point.actual !== null && (
        <p className="mt-1 text-muted-foreground">
          Riwayat:{" "}
          <span className="font-semibold text-foreground">
            {formatRupiah(point.actual)}
          </span>
        </p>
      )}
      {point.projected !== null && point.actual === null && (
        <p className="text-muted-foreground">
          Proyeksi:{" "}
          <span className="font-semibold text-foreground">
            {formatRupiah(point.projected)}
          </span>
        </p>
      )}
      {point.lower !== null && point.upper !== null && (
        <p className="text-muted-foreground">
          Kisaran:{" "}
          <span className="font-semibold text-foreground">
            {formatCompactRupiah(point.lower)} – {formatCompactRupiah(point.upper)}
          </span>
        </p>
      )}
    </div>
  )
}

/** Format angka kecil gaya Indonesia: 0.2 → "0,2". */
function formatParam(value: number): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 2 })
}

/**
 * Kartu Proyeksi Omzet pada halaman Laporan:
 * model Holt-Winters (musiman mingguan) dihitung di klien dari
 * riwayat 60 hari; horizon 7/14/30 hari + pita ±1σ + MAPE backtest.
 * Komponen mengambil datanya sendiri — dipasang sebagai satu baris.
 */
export function RevenueForecastCard() {
  const [horizon, setHorizon] = useState<ForecastHorizon>(7)
  const chartColors = useChartColors()
  const { forecast, history, isLoading, error, reload } = useForecast(horizon)

  const chartData = useMemo(
    () => (history && forecast ? buildChartData(history, forecast) : null),
    [history, forecast],
  )

  const totalProjection =
    forecast?.points.reduce((sum, p) => sum + p.revenue, 0) ?? 0

  const mapeLabel =
    forecast?.metrics.mape === null || forecast === null
      ? "—"
      : `${forecast.metrics.mape.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`

  return (
    <Card className="mt-4 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
              Proyeksi Omzet
            </CardTitle>
            <CardDescription>
              Holt-Winters (musiman mingguan) dari riwayat transaksi lunas — WIB
            </CardDescription>
          </div>

          {/* Toggle horizon */}
          <div className="flex flex-wrap gap-2">
            {HORIZONS.map((h) => {
              const active = horizon === h.value
              return (
                <button
                  key={h.value}
                  type="button"
                  onClick={() => setHorizon(h.value)}
                  className={
                    active
                      ? "rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      : "rounded-full border px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  }
                >
                  {h.label}
                </button>
              )
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full rounded-lg" />
        ) : error ? (
          <ErrorState
            title="Gagal memuat proyeksi"
            description={error}
            onRetry={() => void reload()}
          />
        ) : !forecast || !chartData ? (
          <EmptyState
            icon={TrendingUp}
            title="Data belum cukup untuk diprediksi"
            description="Model membutuhkan riwayat minimal 21 hari sejak transaksi pertama. Coba lagi setelah aplikasi dipakai beberapa hari."
          />
        ) : (
          <>
            {/* Ringkasan metrik */}
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">
                Proyeksi {horizon} hari: {formatRupiah(totalProjection)}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                MAPE 7 hari: <span className="font-semibold text-foreground">{mapeLabel}</span>
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                MAE: <span className="font-semibold text-foreground">{formatRupiah(forecast.metrics.mae)}</span>
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                α {formatParam(forecast.metrics.alpha)} · β{" "}
                {formatParam(forecast.metrics.beta)} · γ{" "}
                {formatParam(forecast.metrics.gamma)}
              </span>
            </div>

            {/* Legenda mini */}
            <div className="mb-1 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-6 border-t-2"
                  style={{ borderColor: chartColors.primary }}
                  aria-hidden
                />
                Riwayat
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-6 border-t-2 border-dashed"
                  style={{ borderColor: chartColors.primary }}
                  aria-hidden
                />
                Proyeksi
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-6 border-t-2 border-dotted"
                  style={{ borderColor: chartColors.band }}
                  aria-hidden
                />
                Kisaran ±1σ
              </span>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={chartColors.grid}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: chartColors.tick }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fontSize: 12, fill: chartColors.tick }}
                  tickFormatter={(value: number) =>
                    formatCompactRupiah(Number(value))
                  }
                />
                <Tooltip content={<ForecastTooltip />} />
                <Line
                  dataKey="upper"
                  stroke={chartColors.band}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  dot={false}
                  connectNulls
                />
                <Line
                  dataKey="lower"
                  stroke={chartColors.band}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  dot={false}
                  connectNulls
                />
                <Line
                  dataKey="actual"
                  stroke={chartColors.primary}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  dataKey="projected"
                  stroke={chartColors.primary}
                  strokeDasharray="6 4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>

            <p className="mt-3 text-xs text-muted-foreground">
              Proyeksi adalah estimasi statistik dari {forecast.historyDays} hari
              riwayat aktif — bukan angka pasti. Hari ini (masih berjalan) tetap
              dihitung sebagai satu hari data sehingga bisa sedikit menekan
              proyeksi. Transaksi dibatalkan tidak dihitung.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
