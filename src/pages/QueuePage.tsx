import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Ban,
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  Megaphone,
  MessageCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import { QueueFormDialog } from "@/components/queue/QueueFormDialog"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatCard } from "@/components/shared/StatCard"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useQueueToday } from "@/hooks/useQueueToday"
import { VEHICLE_TYPE_LABELS } from "@/lib/constants"
import {
  buildQueueMessageText,
  formatQueueNumber,
  sendWhatsAppMessage,
} from "@/lib/whatsapp"
import {
  createQueueEntry,
  updateQueueStatus,
} from "@/services/queue.service"
import type { QueueEntryRow, QueueStatus } from "@/types"
import type { QueueFormValues } from "@/lib/validators"

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

/** Menit berlalu sebelum ISO timestamp (WIB) hingga sekarang. */
function minutesSince(iso: string | null): number | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(diff / 60_000))
}

/** "12 mnt lalu" — untuk stempel waktu kartu antrian. */
function sinceLabel(iso: string | null): string | null {
  const minutes = minutesSince(iso)
  if (minutes === null) return null
  if (minutes < 1) return "baru saja"
  if (minutes < 60) return `${minutes} mnt`
  return `${Math.floor(minutes / 60)} jam ${minutes % 60} mnt`
}

const STATUS_LABELS: Record<QueueStatus, string> = {
  menunggu: "Menunggu",
  dipanggil: "Dipanggil",
  dikerjakan: "Dikerjakan",
  selesai: "Selesai",
  batal: "Batal",
}

/** Aksi status lanjutan yang tersedia dari setiap status. */
const NEXT_ACTION: Partial<
  Record<QueueStatus, { status: "dipanggil" | "dikerjakan" | "selesai"; label: string; icon: LucideIcon }>
> = {
  menunggu: { status: "dipanggil", label: "Panggil", icon: Megaphone },
  dipanggil: { status: "dikerjakan", label: "Mulai Kerjakan", icon: Wrench },
  dikerjakan: { status: "selesai", label: "Tandai Selesai", icon: CheckCircle2 },
}

interface QueueCardProps {
  entry: QueueEntryRow
  /** Jumlah pelanggan di depan (khusus status menunggu). */
  waitingAhead: number
  /** Rata-rata menit per layanan (untuk perkiraan pesan WA). */
  avgServiceMinutes: number
  onAdvance: (entry: QueueEntryRow, next: "dipanggil" | "dikerjakan" | "selesai") => void
  onCancel: (entry: QueueEntryRow) => void
}

/** Kartu satu pelanggan di papan antrian. */
function QueueCard({
  entry,
  waitingAhead,
  avgServiceMinutes,
  onAdvance,
  onCancel,
}: QueueCardProps) {
  const navigate = useNavigate()
  const next = NEXT_ACTION[entry.status]
  const canCancel = entry.status !== "selesai" && entry.status !== "batal"
  const canCheckout = entry.status === "dipanggil" || entry.status === "dikerjakan"
  const since = sinceLabel(entry.created_at)

  function handleSendWhatsApp() {
    if (!entry.customer_phone) {
      toast.error("Pelanggan ini tidak mencantumkan nomor WhatsApp.")
      return
    }
    const estimate =
      waitingAhead > 0 && avgServiceMinutes > 0
        ? waitingAhead * avgServiceMinutes
        : null
    sendWhatsAppMessage(
      entry.customer_phone,
      buildQueueMessageText(entry.status, {
        queueNumber: entry.queue_number,
        customerName: entry.customer_name,
        plateNumber: entry.plate_number,
        serviceName: entry.service_name,
        vehicleType: entry.vehicle_type,
        waitingAhead,
        estimateMinutes: estimate,
      }),
    )
    toast.success("Pesan dibuka di WhatsApp — tinggal tekan kirim.")
  }

  function handleCheckout() {
    navigate("/pos", {
      state: {
        queue: {
          id: entry.id,
          queueNumber: entry.queue_number,
          customerName: entry.customer_name,
          plateNumber: entry.plate_number,
          customerPhone: entry.customer_phone,
          vehicleType: entry.vehicle_type,
          serviceId: entry.service_id,
        },
      },
    })
  }

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={
            entry.status === "dipanggil" || entry.status === "dikerjakan"
              ? "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground"
              : "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-muted text-foreground"
          }
        >
          <span className="text-sm leading-none font-extrabold">
            {formatQueueNumber(entry.queue_number)}
          </span>
          <span className="mt-0.5 text-[9px] leading-none opacity-80">
            NO. URUT
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {entry.customer_name ?? "Pelanggan"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {VEHICLE_TYPE_LABELS[entry.vehicle_type]}
                {entry.plate_number ? ` · ${entry.plate_number}` : ""}
              </p>
            </div>
            {since && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {since}
              </span>
            )}
          </div>

          {entry.service_name && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 shrink-0" />
              {entry.service_name}
            </p>
          )}
          {entry.note && (
            <p className="mt-1 truncate rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
              {entry.note}
            </p>
          )}
          {entry.status === "batal" && entry.cancel_reason && (
            <p className="mt-1 truncate text-xs text-destructive">
              Dibatalkan: {entry.cancel_reason}
            </p>
          )}

          {/* Aksi */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {next && (
              <Button
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs"
                onClick={() => onAdvance(entry, next.status)}
              >
                <next.icon className="h-3.5 w-3.5" />
                {next.label}
              </Button>
            )}
            {canCheckout && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2.5 text-xs"
                onClick={handleCheckout}
              >
                <Plus className="h-3.5 w-3.5" />
                Buat Transaksi
              </Button>
            )}
            {entry.customer_phone && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-emerald-200 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                title={`Kirim kabar "${STATUS_LABELS[entry.status]}" via WhatsApp`}
                onClick={handleSendWhatsApp}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WA
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => onCancel(entry)}
              >
                <Ban className="h-3.5 w-3.5" />
                Batal
              </Button>
            )}
            {entry.status === "selesai" && entry.transaction_id && (
              <Badge variant="secondary" className="text-[10px]">
                Terbayar
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Kolom papan antrian dengan judul + jumlah. */
function QueueColumn({
  title,
  icon: Icon,
  entries,
  accent,
  emptyText,
  children,
}: {
  title: string
  icon: LucideIcon
  entries: QueueEntryRow[]
  accent?: boolean
  emptyText: string
  children: (entry: QueueEntryRow, index: number) => ReactNode
}) {
  return (
    <section className="rounded-xl border bg-muted/30 p-3">
      <header className="mb-3 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={accent ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
          {title}
        </h3>
        <Badge variant={accent ? "default" : "secondary"}>
          {entries.length}
        </Badge>
      </header>
      <div className="space-y-2.5">
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          entries.map((entry, index) => (
            <div key={entry.id}>{children(entry, index)}</div>
          ))
        )}
      </div>
    </section>
  )
}

/**
 * Halaman Antrian (Fase 12):
 * papan antrian hari ini (menunggu → dipanggil → dikerjakan → selesai),
 * pendaftaran pelanggan dengan nomor urut harian (reset WIB), tombol
 * kabar WhatsApp per tahap, dan jalan pintas ke kasir (POS).
 */
export default function QueuePage() {
  const { data, isLoading, error, reload, refresh } = useQueueToday()

  const [addOpen, setAddOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<QueueEntryRow | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [isMutating, setIsMutating] = useState(false)

  const entries = data?.entries ?? []
  const stats = data?.stats

  const waiting = entries.filter((e) => e.status === "menunggu")
  const called = entries.filter((e) => e.status === "dipanggil")
  const working = entries.filter((e) => e.status === "dikerjakan")
  const finished = entries
    .filter((e) => e.status === "selesai" || e.status === "batal")
    .reverse() // yang terbaru tampil lebih dulu

  const avgServiceMinutes = stats?.avg_service_minutes ?? 0
  const activeCount = (stats?.called_count ?? 0) + (stats?.working_count ?? 0)
  const totalToday = entries.length

  /* ---------------- Aksi ---------------- */

  async function handleCreate(values: QueueFormValues): Promise<boolean> {
    setIsMutating(true)
    try {
      const entry = await createQueueEntry({
        customerName: values.customer_name?.trim() || null,
        customerPhone: values.customer_phone?.trim() || null,
        plateNumber: values.plate_number?.trim() || null,
        vehicleType: values.vehicle_type,
        serviceId: values.service_id?.trim() || null,
        note: values.note?.trim() || null,
      })
      toast.success(
        `Antrian #${formatQueueNumber(entry.queue_number)} terdaftar.`,
      )
      refresh()
      return true
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal mendaftarkan antrian. Silakan coba lagi.",
      )
      return false
    } finally {
      setIsMutating(false)
    }
  }

  async function handleAdvance(
    entry: QueueEntryRow,
    next: "dipanggil" | "dikerjakan" | "selesai",
  ) {
    setIsMutating(true)
    try {
      await updateQueueStatus({
        queueId: entry.id,
        status: next,
      })
      toast.success(
        `Antrian #${formatQueueNumber(entry.queue_number)} → ${STATUS_LABELS[next]}.`,
      )
      refresh()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal memperbarui status antrian.",
      )
    } finally {
      setIsMutating(false)
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    if (cancelReason.trim().length < 3) {
      toast.error("Alasan pembatalan wajib diisi (minimal 3 karakter).")
      return
    }
    setIsMutating(true)
    try {
      await updateQueueStatus({
        queueId: cancelTarget.id,
        status: "batal",
        cancelReason: cancelReason.trim(),
      })
      toast.success(
        `Antrian #${formatQueueNumber(cancelTarget.queue_number)} dibatalkan.`,
      )
      setCancelTarget(null)
      setCancelReason("")
      refresh()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal membatalkan antrian.",
      )
    } finally {
      setIsMutating(false)
    }
  }

  /* ---------------- Render ---------------- */

  if (error) {
    return (
      <div>
        <PageHeader
          title="Antrian Hari Ini"
          description="Nomor urut pelanggan per hari (WIB) + kabar WhatsApp otomatis."
        />
        <ErrorState description={error} onRetry={reload} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Antrian Hari Ini"
        description="Nomor urut reset setiap hari (WIB). Setiap tahap bisa dikabarkan ke pelanggan via WhatsApp."
        actions={
          <>
            <Button
              variant="outline"
              onClick={reload}
              disabled={isLoading}
              title="Muat ulang papan antrian"
            >
              <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Muat Ulang
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Daftarkan Antrian
            </Button>
          </>
        }
      />

      {/* Statistik ringkas */}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={Hourglass}
          label="Menunggu"
          value={String(stats?.waiting_count ?? 0)}
          hint={
            avgServiceMinutes > 0 && (stats?.waiting_count ?? 0) > 0
              ? `± ${avgServiceMinutes} mnt / layanan`
              : undefined
          }
        />
        <StatCard
          icon={Wrench}
          label="Diproses"
          value={String(activeCount)}
          hint="dipanggil + dikerjakan"
        />
        <StatCard
          icon={CheckCircle2}
          label="Selesai Hari Ini"
          value={String(stats?.done_count ?? 0)}
          hint={
            (stats?.avg_wait_minutes ?? 0) > 0
              ? `rata-rata tunggu ${stats?.avg_wait_minutes} mnt`
              : undefined
          }
        />
        <StatCard
          icon={Clock}
          label="Total Antrian Hari Ini"
          value={String(totalToday)}
          hint={data?.date ? `kalender WIB ${data.date}` : undefined}
        />
      </div>

      {/* Papan antrian */}
      {isLoading && !data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : totalToday === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Hourglass}
              title="Belum ada antrian hari ini"
              description="Daftarkan pelanggan pertama melalui tombol 'Daftarkan Antrian' — nomor urut mulai dari 01."
              action={
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Daftarkan Antrian
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <QueueColumn
            title="Menunggu"
            icon={Hourglass}
            entries={waiting}
            emptyText="Tidak ada yang menunggu."
          >
            {(entry, index) => (
              <QueueCard
                entry={entry}
                waitingAhead={index}
                avgServiceMinutes={avgServiceMinutes}
                onAdvance={handleAdvance}
                onCancel={setCancelTarget}
              />
            )}
          </QueueColumn>

          <QueueColumn
            title="Dipanggil"
            icon={Megaphone}
            entries={called}
            accent
            emptyText="Belum ada yang dipanggil."
          >
            {(entry) => (
              <QueueCard
                entry={entry}
                waitingAhead={0}
                avgServiceMinutes={avgServiceMinutes}
                onAdvance={handleAdvance}
                onCancel={setCancelTarget}
              />
            )}
          </QueueColumn>

          <QueueColumn
            title="Dikerjakan"
            icon={Wrench}
            entries={working}
            accent
            emptyText="Tidak ada yang sedang dikerjakan."
          >
            {(entry) => (
              <QueueCard
                entry={entry}
                waitingAhead={0}
                avgServiceMinutes={avgServiceMinutes}
                onAdvance={handleAdvance}
                onCancel={setCancelTarget}
              />
            )}
          </QueueColumn>
        </div>
      )}

      {/* Riwayat selesai / batal hari ini */}
      {finished.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            Riwayat Hari Ini ({finished.length})
          </h3>
          <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2">
            {finished.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-mono text-sm font-bold">
                    #{formatQueueNumber(entry.queue_number)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.customer_name ?? "Pelanggan"}
                    {entry.plate_number ? ` · ${entry.plate_number}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry.status === "batal" ? (
                    <Badge variant="destructive" className="text-[10px]">
                      Batal
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Selesai
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {sinceLabel(
                      entry.status === "batal" ? entry.cancelled_at : entry.done_at,
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dialog daftarkan antrian */}
      <QueueFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleCreate}
      />

      {/* Dialog konfirmasi batal antrian */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null)
            setCancelReason("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Batalkan antrian #
              {cancelTarget ? formatQueueNumber(cancelTarget.queue_number) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Antrian yang dibatalkan tidak bisa dipakai lagi dan masuk ke
              riwayat hari ini dengan tanda Batal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="queue-cancel-reason">Alasan Pembatalan</Label>
            <Textarea
              id="queue-cancel-reason"
              placeholder="Misal: pelanggan pulang, salah daftar..."
              rows={3}
              maxLength={200}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Tutup</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleCancelConfirm()
              }}
              disabled={isMutating || cancelReason.trim().length < 3}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isMutating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Batalkan Antrian"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
