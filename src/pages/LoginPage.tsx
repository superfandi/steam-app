import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Bot,
  Droplets,
  Eye,
  EyeOff,
  HandCoins,
  Loader2,
  ReceiptText,
  TrendingUp,
} from "lucide-react"

import { FullScreenLoader } from "@/components/shared/FullScreenLoader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/useAuth"
import { getAuthErrorMessage } from "@/services/auth.service"
import { cn } from "cn"

const loginSchema = z.object({
  email: z.email({ message: "Format email tidak valid" }),
  password: z.string().min(1, "Password wajib diisi"),
})

type LoginFormValues = {
  email: string
  password: string
}

const HIGHLIGHTS = [
  {
    icon: ReceiptText,
    text: "Kasir cepat — invoice otomatis, struk cetak & kirim via WhatsApp",
  },
  {
    icon: HandCoins,
    text: "Komisi karyawan dihitung & dicatat otomatis saat checkout",
  },
  {
    icon: TrendingUp,
    text: "Laporan pendapatan + export Excel & prediksi omzet",
  },
  {
    icon: Bot,
    text: "Asisten data AI — tanya pendapatan & komisi langsung di aplikasi",
  },
]

/**
 * Halaman login admin.
 * Tidak ada registrasi publik — akun dibuat lewat Supabase Dashboard.
 */
export default function LoginPage() {
  const { session, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Halaman asal sebelum dialihkan ke /login (untuk kembali setelah login).
  const from = (location.state as { from?: string } | null)?.from ?? "/"

  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" } satisfies LoginFormValues,
  })

  // Session masih dipulihkan → tampilkan loader.
  if (loading) {
    return <FullScreenLoader label="Memeriksa sesi..." />
  }

  // Sudah login → langsung ke halaman asal/dashboard.
  if (session) {
    return <Navigate to={from} replace />
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      toast.success("Login berhasil. Selamat datang kembali!")
      navigate(from, { replace: true })
    } catch (error) {
      const message = getAuthErrorMessage(error)
      setFormError(message)
      toast.error(message)
    }
  })

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* ---------------- Panel branding (desktop) ---------------- */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex">
        {/* Dekorasi latar lembut */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Droplets className="h-5 w-5 text-primary-foreground" />
          </div>
          <p className="text-lg font-bold tracking-wide text-white">Pandawa Steam</p>
        </div>

        <div className="relative space-y-6">
          <h1 className="max-w-md text-3xl leading-snug font-bold text-white">
            Kelola usaha cuci motor &amp; mobil Anda — dari kasir hingga
            laporan
          </h1>
          <p className="max-w-md text-sm text-sidebar-muted">
            Pandawa Steam menyatukan kasir POS, riwayat transaksi, komisi
            karyawan, prediksi omzet, dan asisten data AI dalam satu aplikasi.
          </p>
          <ul className="space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item.text}
                className="flex items-center gap-3 text-sm text-sidebar-muted"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
                  <item.icon className="h-4 w-4 text-primary" />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-muted">
          © {new Date().getFullYear()} Pandawa Steam. Seluruh hak cipta dilindungi.
        </p>
      </div>

      {/* ---------------- Panel form ---------------- */}
      <div className="flex items-center justify-center p-6 py-12">
        <Card className="w-full max-w-md border-none shadow-lg">
          <CardContent className="p-8">
            {/* Brand mini (mobile) */}
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Droplets className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold">Pandawa Steam</p>
                <p className="text-[11px] text-muted-foreground">
                  Kasir Cuci Motor &amp; Mobil
                </p>
              </div>
            </div>

            <h2 className="text-xl font-bold">Selamat datang kembali</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Masuk untuk mengelola kasir, riwayat, laporan, dan komisi —
              satu akun untuk semuanya.
            </p>

            {formError && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <form
              onSubmit={onSubmit}
              noValidate
              className="mt-6 space-y-5"
            >
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@pandawasteam.id"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  className={cn(
                    form.formState.errors.email &&
                      "border-destructive focus-visible:ring-destructive/30",
                  )}
                  {...form.register("email")}
                />
                {form.formState.errors.email?.message && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={cn(
                      "pr-10",
                      form.formState.errors.password &&
                        "border-destructive focus-visible:ring-destructive/30",
                    )}
                    aria-invalid={Boolean(form.formState.errors.password)}
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {form.formState.errors.password?.message && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  "Masuk"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Akun admin hanya dibuat oleh pengelola sistem — registrasi
              mandiri tidak tersedia.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
