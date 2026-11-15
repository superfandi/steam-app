import { Link } from "react-router-dom"
import {
  ArrowRight,
  Banknote,
  Bike,
  Car,
  CloudAlert,
  Landmark,
  QrCode,
  ReceiptText,
  Wallet,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { StatCard } from "@/components/shared/StatCard"
import {
  PaymentMethodBadge,
  PaymentStatusBadge,
  VehicleBadge,
} from "@/components/shared/badges"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/useAuth"
import { useDashboard } from "@/hooks/useDashboard"
import {
  formatCompactRupiah,
  formatDayLabel,
  formatFullDateNow,
  formatRupiah,
} from "@/lib/format"
import { PAYMENT_METHOD_LABELS } from "@/lib/constants"
import type { PaymentMethod } from "@/types"

interface ChartPoint {
  label: string
  revenue: number
  count: number
}

/** Tooltip kustom grafik pendapatan. */
function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartPoint }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{point.label}</p>
      <p className="mt-1 text-muted-foreground">
        Pendapatan:{" "}
        <span className="font-semibold text-foreground">
          {formatRupiah(point.revenue)}
        </span>
      </p>
      <p className="text-muted-foreground">
        Transaksi:{" "}
        <span className="font-semibold text-foreground">{point.count}</span>
      </p>
    </div>
  )
}

const METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  qris: QrCode,
  transfer: Landmark,
}

/**
 * Dashboard admin — statistik hari ini, grafik pendapatan 14 hari,
 * ringkasan metode pembayaran, dan transaksi terbaru.
 * Seluruh data dari database Supabase (RPC get_dashboard_summary,
 * zona waktu Asia/Jakarta).
 */
export default function DashboardPage() {
  const { profile } = useAuth()
  const { summary, recentTransactions, isLoading, error, reload } =
    useDashboard()

  /* ---------------- Loading skeleton ---------------- */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  /* ---------------- Error ---------------- */
  if (error || !summary) {
    return (
      <div className="rounded-xl border bg-card shadow-sm">
        <ErrorState
          title="Gagal memuat dashboard"
          description={error ?? "Data tidak tersedia."}
          onRetry={() => void reload()}
        />
      </div>
    )
  }

  /* ---------------- Data siap ---------------- */
  const chartData: ChartPoint[] = summary.daily_series.map((point) => ({
    label: formatDayLabel(point.day),
    revenue: point.revenue,
    count: point.transaction_count,
  }))

  // Pastikan ketiga metode selalu tampil walau belum ada transaksi hari ini.
  const methodRows = (["cash", "qris", "transfer"] as PaymentMethod[]).map(
    (method) => {
      const found = summary.payment_summary.find(
        (p) => p.payment_method === method,
      )
      return {
        method,
        count: found?.transaction_count ?? 0,
        revenue: found?.revenue ?? 0,
      }
    },
  )

  const displayName = profile?.full_name?.trim() || "Admin"

  return (
    <div className="space-y-6">
      {/* Sapaan */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">
          Selamat datang, {displayName} 👋
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatFullDateNow()} (WIB)
        </p>
      </div>

      {/* Statistik hari ini */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Pendapatan Hari Ini"
          value={formatRupiah(summary.today_revenue)}
          hint="Transaksi lunas (WIB)"
        />
        <StatCard
          icon={ReceiptText}
          label="Transaksi Hari Ini"
          value={String(summary.today_transactions)}
          hint="Jumlah transaksi lunas"
        />
        <StatCard
          icon={Bike}
          label="Motor Hari Ini"
          value={String(summary.today_motor)}
          hint="Transaksi motor"
        />
        <StatCard
          icon={Car}
          label="Mobil Hari Ini"
          value={String(summary.today_mobil)}
          hint="Transaksi mobil"
        />
      </div>

      {/* Grafik + ringkasan pembayaran */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Pendapatan 14 Hari Terakhir</CardTitle>
            <CardDescription>
              Hanya transaksi lunas — zona waktu Asia/Jakarta
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E2E8F0"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#64748B" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fontSize: 12, fill: "#64748B" }}
                  tickFormatter={(value: number) =>
                    formatCompactRupiah(Number(value))
                  }
                />
                <Tooltip content={<RevenueTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fill="url(#revenueFill)"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Ringkasan Pembayaran</CardTitle>
            <CardDescription>Metode pembayaran hari ini</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {methodRows.map((row) => {
              const Icon = METHOD_ICONS[row.method]
              return (
                <div
                  key={row.method}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {PAYMENT_METHOD_LABELS[row.method]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} transaksi
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatRupiah(row.revenue)}
                  </p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Transaksi terbaru */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Transaksi Terbaru</CardTitle>
            <CardDescription>8 transaksi terakhir</CardDescription>
          </div>
          <Link
            to="/history"
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Lihat Semua
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Belum ada transaksi"
              description="Transaksi akan muncul di sini setelah kasir dipakai."
              action={
                <Link to="/pos">
                  <Button size="sm">Buka Kasir</Button>
                </Link>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Pelanggan
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Jenis</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Pembayaran
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {txn.invoice_number}
                    </TableCell>
                    <TableCell className="hidden max-w-36 truncate text-sm sm:table-cell">
                      {txn.customer_name ?? txn.plate_number ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <VehicleBadge vehicleType={txn.vehicle_type} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <PaymentMethodBadge method={txn.payment_method} />
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={txn.payment_status} />
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {formatRupiah(txn.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Catatan kecil */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CloudAlert className="h-3.5 w-3.5" />
        Pembatalan transaksi tidak dihitung sebagai pendapatan.
      </p>
    </div>
  )
}
