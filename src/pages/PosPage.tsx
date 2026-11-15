import { useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import {
  Banknote,
  Bike,
  Car,
  CreditCard,
  Landmark,
  Minus,
  Plus,
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react"
import { Link } from "react-router-dom"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { CheckoutConfirmDialog } from "@/components/pos/CheckoutConfirmDialog"
import { CheckoutSuccessDialog } from "@/components/pos/CheckoutSuccessDialog"
import { ServiceCard } from "@/components/pos/ServiceCard"
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/useAuth"
import { useActiveEmployees } from "@/hooks/useEmployees"
import { usePosCart } from "@/hooks/usePosCart"
import { usePosServices } from "@/hooks/usePosServices"
import { formatRupiah } from "@/lib/format"
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from "@/lib/constants"
import { normalizePhone } from "@/lib/whatsapp"
import {
  createTransaction,
  fetchTransactionDetail,
  mapTransactionError,
  type TransactionDetail,
} from "@/services/transaction.service"
import type { PaymentMethod, ServiceRow, VehicleType } from "@/types"

const PAYMENT_METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  cash: Banknote,
  qris: QrCode,
  transfer: Landmark,
}

const CASH_PRESETS = [50000, 100000, 200000] as const

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "")
}

function parseMoney(value: string): number {
  const parsed = Number.parseInt(digitsOnly(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Halaman Kasir (POS):
 * - Panel kiri: tab Motor/Mobil + kartu layanan aktif.
 * - Panel kanan: keranjang, diskon nominal, metode pembayaran,
 *   validasi tunai + kembalian, dan tombol checkout.
 * Transaksi disimpan atomik lewat RPC create_transaction.
 */
export default function PosPage() {
  const { profile } = useAuth()

  // Panel kiri
  const [vehicleType, setVehicleType] = useState<VehicleType>("motor")
  const { services, isLoading, error, reload } = usePosServices(vehicleType)

  // Keranjang
  const cart = usePosCart()

  // Karyawan pengerjakan (opsional) — komisi dihitung di database.
  const {
    employees: activeEmployees,
    isLoading: isLoadingEmployees,
    error: employeesError,
    reload: reloadEmployees,
  } = useActiveEmployees()
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")

  // Form transaksi
  const [customerName, setCustomerName] = useState("")
  const [plateNumber, setPlateNumber] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [cashInput, setCashInput] = useState("")

  const selectedEmployee =
    activeEmployees.find((employee) => employee.id === selectedEmployeeId) ??
    null

  /** Estimasi komisi untuk preview — angka final dihitung database. */
  const commissionEstimate = selectedEmployee
    ? Math.floor((cart.total * selectedEmployee.commission_percent) / 100)
    : null

  const cashReceived =
    paymentMethod === "cash" ? parseMoney(cashInput) : null
  const cashChange =
    cashReceived !== null && cashReceived >= cart.total
      ? cashReceived - cart.total
      : null

  const cashShort =
    paymentMethod === "cash" && cart.lines.length > 0 && (cashReceived ?? 0) < cart.total

  // Nomor WhatsApp opsional — bila diisi, harus valid agar bisa dipakai
  // link wa.me saat mengirim struk.
  const phoneInvalid =
    customerPhone.trim() !== "" && normalizePhone(customerPhone) === null

  const canCheckout =
    cart.lines.length > 0 && !cart.discountError && !cashShort && !phoneInvalid

  // Dialog & proses
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pendingVehicleType, setPendingVehicleType] =
    useState<VehicleType | null>(null)
  const [successDetail, setSuccessDetail] = useState<TransactionDetail | null>(
    null,
  )
  const [successOpen, setSuccessOpen] = useState(false)

  /* ---------------- Aksi ---------------- */

  function handleTabChange(value: string) {
    const next = value as VehicleType
    if (next === vehicleType) return
    // Keranjang berisi item → minta konfirmasi sebelum dikosongkan.
    if (cart.lines.length > 0) {
      setPendingVehicleType(next)
      return
    }
    setVehicleType(next)
  }

  function confirmVehicleSwitch() {
    cart.clear()
    if (pendingVehicleType) setVehicleType(pendingVehicleType)
    setPendingVehicleType(null)
  }

  function openCheckout() {
    if (!canCheckout || isProcessing) return
    setConfirmOpen(true)
  }

  async function handleConfirmCheckout() {
    if (!canCheckout || isProcessing) return
    setIsProcessing(true)

    try {
      // 1) Simpan transaksi secara atomik (harga divalidasi di database).
      const result = await createTransaction({
        vehicleType,
        items: cart.lines.map((line) => ({
          service_id: line.service.id,
          quantity: line.quantity,
        })),
        paymentMethod,
        discount: cart.discount,
        customerName: customerName.trim() || null,
        plateNumber: plateNumber.trim() || null,
        customerPhone: normalizePhone(customerPhone) ?? null,
        cashReceived: paymentMethod === "cash" ? cashReceived : null,
        employeeId: selectedEmployee ? selectedEmployee.id : null,
      })

      // 2) Ambil data lengkap (header + item snapshot) untuk struk.
      const detail = await fetchTransactionDetail(result.transaction_id)

      // 3) Tampilkan struk & reset keranjang untuk transaksi berikutnya.
      setSuccessDetail(detail)
      setConfirmOpen(false)
      setSuccessOpen(true)
      cart.resetForNewTransaction()
      setCustomerName("")
      setPlateNumber("")
      setCustomerPhone("")
      setCashInput("")
      setPaymentMethod("cash")
      setSelectedEmployeeId("")

      toast.success(`Transaksi ${result.invoice_number} berhasil disimpan.`)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : mapTransactionError(err),
      )
    } finally {
      setIsProcessing(false)
    }
  }

  function closeSuccess() {
    setSuccessOpen(false)
    setSuccessDetail(null)
  }

  /* ---------------- Render ---------------- */

  function renderServiceArea() {
    if (error) {
      return <ErrorState description={error} onRetry={() => void reload()} />
    }

    if (isLoading) {
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )
    }

    if (services.length === 0) {
      return (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={Sparkles}
            title={`Belum ada layanan ${VEHICLE_TYPE_LABELS[vehicleType].toLowerCase()} yang aktif`}
            description="Tambahkan layanan pada menu Manajemen Layanan agar bisa ditransaksikan."
            action={
              <Link to="/services">
                <Button size="sm">Kelola Layanan</Button>
              </Link>
            }
          />
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {services.map((service: ServiceRow) => (
          <ServiceCard
            key={service.id}
            service={service}
            onAdd={cart.addItem}
          />
        ))}
      </div>
    )
  }

  const methodIcons = PAYMENT_METHOD_ICONS

  return (
    <div>
      <p className="mb-5 text-sm text-muted-foreground">
        Pilih jenis kendaraan, klik kartu layanan untuk menambahkannya ke
        keranjang, lalu proses pembayaran.
      </p>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ================= PANEL KIRI: LAYANAN ================= */}
        <section>
          <Tabs value={vehicleType} onValueChange={handleTabChange}>
            <TabsList className="grid w-full max-w-sm grid-cols-2">
              <TabsTrigger value="motor" className="gap-1.5">
                <Bike className="h-4 w-4" />
                Motor
              </TabsTrigger>
              <TabsTrigger value="mobil" className="gap-1.5">
                <Car className="h-4 w-4" />
                Mobil
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-4">{renderServiceArea()}</div>
        </section>

        {/* ================= PANEL KANAN: KERANJANG ================= */}
        <section>
          <Card className="self-start shadow-sm xl:sticky xl:top-20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4" />
                  Keranjang
                  {cart.itemCount > 0 && (
                    <Badge variant="secondary" className="font-semibold">
                      {cart.itemCount}
                    </Badge>
                  )}
                </CardTitle>
                {cart.lines.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cart.clear}
                    className="h-8 gap-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Kosongkan
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {cart.lines.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="Keranjang masih kosong"
                  description="Pilih layanan di panel kiri untuk mulai transaksi."
                />
              ) : (
                <>
                  {/* Daftar item */}
                  <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                    {cart.lines.map((line) => (
                      <div
                        key={line.service.id}
                        className="rounded-lg border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {line.service.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatRupiah(line.service.price)} / layanan
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => cart.removeItem(line.service.id)}
                            title="Hapus dari keranjang"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => cart.decrement(line.service.id)}
                              title="Kurangi"
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-semibold">
                              {line.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => cart.increment(line.service.id)}
                              disabled={line.quantity >= 99}
                              title="Tambah"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="text-sm font-semibold">
                            {formatRupiah(line.service.price * line.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Info pelanggan */}
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pos-customer">
                        Nama Pelanggan{" "}
                        <span className="text-xs text-muted-foreground">
                          (opsional)
                        </span>
                      </Label>
                      <Input
                        id="pos-customer"
                        placeholder="Nama pelanggan..."
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        maxLength={60}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pos-plate">
                        Nomor Polisi{" "}
                        <span className="text-xs text-muted-foreground">
                          (opsional)
                        </span>
                      </Label>
                      <Input
                        id="pos-plate"
                        placeholder="B 1234 ABC"
                        className="uppercase"
                        value={plateNumber}
                        onChange={(e) =>
                          setPlateNumber(e.target.value.toUpperCase())
                        }
                        maxLength={12}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pos-phone">
                        No. WhatsApp Pelanggan{" "}
                        <span className="text-xs text-muted-foreground">
                          (opsional — untuk kirim struk)
                        </span>
                      </Label>
                      <Input
                        id="pos-phone"
                        placeholder="0812xxxxxxx"
                        inputMode="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        maxLength={20}
                        aria-invalid={phoneInvalid}
                      />
                      {phoneInvalid && (
                        <p className="text-xs text-destructive">
                          Nomor WhatsApp tidak valid. Contoh: 0812xxxxxxx
                          atau 62812xxxxxxx.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Karyawan pengerjakan (opsional) */}
                  {employeesError ? (
                    <div className="flex items-center justify-between rounded-lg border p-2.5 text-xs">
                      <span className="text-muted-foreground">
                        Gagal memuat daftar karyawan.
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => void reloadEmployees()}
                      >
                        Coba Lagi
                      </Button>
                    </div>
                  ) : isLoadingEmployees ? (
                    <Skeleton className="h-14 rounded-lg" />
                  ) : activeEmployees.length > 0 ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="pos-employee" className="text-xs">
                        Karyawan Pengerjakan{" "}
                        <span className="text-xs text-muted-foreground">
                          (opsional)
                        </span>
                      </Label>
                      <Select
                        value={selectedEmployeeId || "none"}
                        onValueChange={(value) =>
                          setSelectedEmployeeId(value === "none" ? "" : value)
                        }
                      >
                        <SelectTrigger id="pos-employee" className="w-full">
                          <SelectValue placeholder="Pilih karyawan..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Tanpa Karyawan —</SelectItem>
                          {activeEmployees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.name}
                              {employee.commission_percent > 0 &&
                                ` · ${employee.commission_percent}%`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedEmployee && (
                        <p className="text-xs text-muted-foreground">
                          Komisi ≈ {formatRupiah(commissionEstimate ?? 0)} (
                          {selectedEmployee.commission_percent}% dari total)
                        </p>
                      )}
                    </div>
                  ) : null}

                  {/* Ringkasan + diskon */}
                  <div className="space-y-2.5 rounded-lg bg-muted/50 p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">
                        {formatRupiah(cart.subtotal)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="pos-discount" className="text-xs">
                        Diskon (Rupiah)
                      </Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
                          Rp
                        </span>
                        <Input
                          id="pos-discount"
                          inputMode="numeric"
                          placeholder="0"
                          className="pl-8"
                          value={cart.discountInput}
                          onChange={(
                            e: ChangeEvent<HTMLInputElement>,
                          ) => cart.setDiscountInput(digitsOnly(e.target.value))}
                        />
                      </div>
                      {cart.discountError && (
                        <p className="text-xs text-destructive">
                          {cart.discountError}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-between border-t pt-2.5">
                      <span className="text-sm font-semibold">Total</span>
                      <span className="text-lg font-bold text-primary">
                        {formatRupiah(cart.total)}
                      </span>
                    </div>
                  </div>

                  {/* Metode pembayaran */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Metode Pembayaran</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        ["cash", "qris", "transfer"] as PaymentMethod[]
                      ).map((method) => {
                        const Icon = methodIcons[method]
                        const active = paymentMethod === method
                        return (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setPaymentMethod(method)}
                            className={
                              active
                                ? "flex flex-col items-center gap-1 rounded-lg border border-primary bg-primary/5 p-2.5 text-xs font-semibold text-primary transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                : "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            }
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                            {PAYMENT_METHOD_LABELS[method]}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Pembayaran tunai */}
                  {paymentMethod === "cash" && (
                    <div className="space-y-2">
                      <Label htmlFor="pos-cash" className="text-xs">
                        Uang Diterima
                      </Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
                          Rp
                        </span>
                        <Input
                          id="pos-cash"
                          inputMode="numeric"
                          placeholder="0"
                          className="pl-8"
                          value={cashInput}
                          onChange={(e) => setCashInput(digitsOnly(e.target.value))}
                        />
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCashInput(String(cart.total))}
                          className="rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        >
                          Uang Pas
                        </button>
                        {CASH_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setCashInput((prev) =>
                                String(parseMoney(prev) + preset),
                              )
                            }
                            className="rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          >
                            +{formatRupiah(preset)}
                          </button>
                        ))}
                      </div>

                      {cashReceived !== null && cashShort && (
                        <p className="text-xs text-destructive">
                          Uang diterima kurang{" "}
                          {formatRupiah(cart.total - (cashReceived ?? 0))}.
                        </p>
                      )}

                      {cashChange !== null && (
                        <div className="flex justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                          <span className="font-medium text-emerald-800">
                            Kembalian
                          </span>
                          <span className="font-bold text-emerald-800">
                            {formatRupiah(cashChange)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Catatan QRIS / Transfer */}
                  {paymentMethod !== "cash" && (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      Pastikan pembayaran {PAYMENT_METHOD_LABELS[paymentMethod]}{" "}
                      sudah diterima — verifikasi dikonfirmasi pada langkah
                      berikutnya.
                    </p>
                  )}

                  {/* Checkout */}
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={openCheckout}
                    disabled={!canCheckout}
                  >
                    <CreditCard className="h-4 w-4" />
                    Bayar {formatRupiah(cart.total)}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Dialog konfirmasi pindah jenis kendaraan */}
      <AlertDialog
        open={pendingVehicleType !== null}
        onOpenChange={(open) => !open && setPendingVehicleType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ganti jenis kendaraan?</AlertDialogTitle>
            <AlertDialogDescription>
              Keranjang berisi layanan{" "}
              <span className="font-semibold text-foreground">
                {cart.cartVehicleType
                  ? VEHICLE_TYPE_LABELS[cart.cartVehicleType].toLowerCase()
                  : ""}
              </span>
              . Berganti ke{" "}
              <span className="font-semibold text-foreground">
                {pendingVehicleType
                  ? VEHICLE_TYPE_LABELS[pendingVehicleType].toLowerCase()
                  : ""}
              </span>{" "}
              akan mengosongkan keranjang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmVehicleSwitch}>
              Ya, Ganti &amp; Kosongkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog konfirmasi pembayaran */}
      <CheckoutConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        vehicleType={vehicleType}
        lines={cart.lines}
        subtotal={cart.subtotal}
        discount={cart.discount}
        total={cart.total}
        paymentMethod={paymentMethod}
        cashReceived={cashReceived}
        cashChange={cashChange}
        employeeName={selectedEmployee ? selectedEmployee.name : null}
        commission={selectedEmployee ? commissionEstimate : null}
        customerName={customerName}
        plateNumber={plateNumber}
        isProcessing={isProcessing}
        onConfirm={() => void handleConfirmCheckout()}
      />

      {/* Dialog sukses + struk */}
      <CheckoutSuccessDialog
        open={successOpen}
        onClose={closeSuccess}
        detail={successDetail}
        cashierName={profile?.full_name ?? null}
      />
    </div>
  )
}
