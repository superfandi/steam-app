import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  Droplets,
  KeyRound,
  Loader2,
  Moon,
  Sun,
} from "lucide-react"

import { FullScreenLoader } from "@/components/shared/FullScreenLoader"
import { PasswordField } from "@/components/shared/PasswordField"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/lib/validators"
import {
  cancelPasswordReset,
  completePasswordReset,
  getSetPasswordErrorMessage,
} from "@/services/auth.service"

/**
 * Halaman publik /reset-password — tujuan tautan email recovery Supabase.
 *
 * Hanya bisa dipakai dengan sesi recovery (event PASSWORD_RECOVERY).
 * Pengguna yang login normal tidak bisa memakai halaman ini untuk mengganti
 * password tanpa password lama — mereka harus lewat Pengaturan Akun.
 */
export default function ResetPasswordPage() {
  const {
    session,
    user,
    loading,
    passwordRecovery,
    clearPasswordRecovery,
  } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()

  // Event PASSWORD_RECOVERY dikirim Supabase sesaat setelah halaman dimuat.
  // Beri jeda singkat sebelum menyimpulkan tautan tidak valid.
  const [graceElapsed, setGraceElapsed] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setGraceElapsed(true), 1000)
    return () => window.clearTimeout(timer)
  }, [])

  const [formError, setFormError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  })

  const submitting = form.formState.isSubmitting

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await completePasswordReset(values.new_password)
      clearPasswordRecovery()
      setFinished(true)
      toast.success(
        "Password berhasil diperbarui. Silakan login dengan password baru.",
      )
      navigate("/login", { replace: true, state: { passwordReset: true } })
    } catch (err) {
      const message = getSetPasswordErrorMessage(err)
      setFormError(message)
      toast.error(message)
    }
  })

  async function handleCancel() {
    setFormError(null)
    try {
      await cancelPasswordReset()
      clearPasswordRecovery()
      navigate("/login", { replace: true })
    } catch (err) {
      const message = getSetPasswordErrorMessage(err)
      setFormError(message)
      toast.error(message)
    }
  }

  // Tunggu loader sesi + jeda pemrosesan token recovery.
  if (loading || (!passwordRecovery && !finished && !graceElapsed)) {
    return <FullScreenLoader label="Memeriksa tautan reset..." />
  }

  const linkValid = finished || (Boolean(session) && passwordRecovery)

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-6">
      {/* Toggle mode pagi/malam */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        title={isDark ? "Aktifkan mode pagi" : "Aktifkan mode malam"}
        aria-label={isDark ? "Aktifkan mode pagi" : "Aktifkan mode malam"}
        className="absolute top-4 right-4 z-10"
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>

      <Card className="w-full max-w-md border-none shadow-lg">
        <CardContent className="p-8">
          {/* Brand mini */}
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Droplets className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold">Mtwo Steam</p>
              <p className="text-[11px] text-muted-foreground">
                Kasir Cuci Motor &amp; Mobil
              </p>
            </div>
          </div>

          {linkValid ? (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <KeyRound className="h-5 w-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-xl font-bold">Atur Password Baru</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Buat password baru untuk{" "}
                <span className="font-medium text-foreground">
                  {user?.email ?? "akun admin Anda"}
                </span>
                .
              </p>

              {formError && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                >
                  {formError}
                </p>
              )}

              <form
                onSubmit={onSubmit}
                noValidate
                className="mt-6 space-y-4"
              >
                <PasswordField
                  id="reset-new-password"
                  label="Password Baru"
                  autoComplete="new-password"
                  registration={form.register("new_password")}
                  error={form.formState.errors.new_password?.message}
                  hint="Minimal 8 karakter."
                />

                <PasswordField
                  id="reset-confirm-password"
                  label="Konfirmasi Password Baru"
                  autoComplete="new-password"
                  registration={form.register("confirm_password")}
                  error={form.formState.errors.confirm_password?.message}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    "Simpan Password Baru"
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Setelah disimpan, sesi di perangkat lain diputus dan Anda
                  perlu login ulang dengan password baru.
                </p>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => void handleCancel()}
                  disabled={submitting}
                >
                  Batal dan keluar
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-6 w-6" aria-hidden />
              </div>
              <h1 className="mt-4 text-xl font-bold">Tautan Tidak Valid</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tautan reset password tidak valid atau sudah kedaluwarsa.
                Tautan hanya bisa dipakai sekali dan berlaku terbatas.
              </p>

              <Button asChild className="mt-6 w-full">
                <Link to="/login">
                  <ArrowLeft className="h-4 w-4" />
                  Kembali ke Login
                </Link>
              </Button>

              <p className="mt-4 text-xs text-muted-foreground">
                Minta tautan baru lewat tombol{" "}
                <span className="font-medium text-foreground">
                  Lupa password?
                </span>{" "}
                di halaman login.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
