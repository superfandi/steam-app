import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"

import { PasswordField } from "@/components/shared/PasswordField"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/useAuth"
import {
  changeEmailSchema,
  changePasswordSchema,
  type ChangeEmailFormValues,
  type ChangePasswordFormValues,
} from "@/lib/validators"
import {
  getAccountErrorMessage,
  updateEmail,
  updatePassword,
} from "@/services/auth.service"

export type AccountTab = "email" | "password"

interface AccountSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tab yang langsung aktif saat dialog dibuka. */
  initialTab?: AccountTab
}

/** Input password dengan tombol tampilkan/sembunyikan. */

/**
 * Dialog pengaturan akun admin:
 * - Ganti email  : Supabase mengirim tautan konfirmasi ke email baru
 *                  (berlaku setelah tautan diklik).
 * - Ganti password: password lama diverifikasi ulang sebelum diganti.
 */
export function AccountSettingsDialog({
  open,
  onOpenChange,
  initialTab = "email",
}: AccountSettingsDialogProps) {
  const { user } = useAuth()

  const [tab, setTab] = useState<AccountTab>(initialTab)
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const emailForm = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { new_email: "", confirm_email: "" },
  })

  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  })

  const emailSubmitting = emailForm.formState.isSubmitting
  const passwordSubmitting = passwordForm.formState.isSubmitting
  const busy = emailSubmitting || passwordSubmitting

  // Reset isi form & status setiap kali dialog dibuka.
  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setEmailSentTo(null)
    setEmailError(null)
    setPasswordError(null)
    emailForm.reset()
    passwordForm.reset()
  }, [open, initialTab, emailForm, passwordForm])

  function handleOpenChange(next: boolean) {
    // Jangan tutup dialog saat proses simpan/kirim sedang berjalan.
    if (!next && busy) return
    onOpenChange(next)
  }

  async function onSubmitEmail(values: ChangeEmailFormValues) {
    setEmailError(null)

    const currentEmail = user?.email?.toLowerCase()
    if (currentEmail && values.new_email.toLowerCase() === currentEmail) {
      emailForm.setError("new_email", {
        message: "Email baru sama dengan email saat ini",
      })
      return
    }

    try {
      await updateEmail(values.new_email)
      setEmailSentTo(values.new_email)
      emailForm.reset()
      toast.success("Tautan konfirmasi dikirim ke email baru.")
    } catch (err) {
      const message = getAccountErrorMessage(err)
      setEmailError(message)
      toast.error(message)
    }
  }

  async function onSubmitPassword(values: ChangePasswordFormValues) {
    if (!user?.email) {
      toast.error("Email akun tidak ditemukan. Silakan login ulang.")
      return
    }

    setPasswordError(null)
    try {
      await updatePassword(
        user.email,
        values.current_password,
        values.new_password,
      )
      passwordForm.reset()
      toast.success("Password berhasil diperbarui.")
      onOpenChange(false)
    } catch (err) {
      const message = getAccountErrorMessage(err)
      const raw = err instanceof Error ? err.message : ""
      if (/invalid login credentials/i.test(raw)) {
        // Salah password lama → tampilkan di bawah field yang tepat.
        passwordForm.setError("current_password", { message })
      } else {
        setPasswordError(message)
      }
      toast.error(message)
    }
  }

  const emailErrors = emailForm.formState.errors
  const passwordErrors = passwordForm.formState.errors

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pengaturan Akun</DialogTitle>
          <DialogDescription>
            Kelola email dan password akun admin Anda.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as AccountTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email" className="gap-1.5">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="password" className="gap-1.5">
              <KeyRound className="h-4 w-4" />
              Password
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Tab email ---------------- */}
          <TabsContent value="email" className="pt-2">
            {emailSentTo ? (
              <div className="space-y-4">
                <div
                  role="status"
                  className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm"
                >
                  <p className="flex items-center gap-2 font-semibold text-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Tautan konfirmasi terkirim
                  </p>
                  <p className="mt-1.5 text-muted-foreground">
                    Buka{" "}
                    <span className="font-medium text-foreground">
                      {emailSentTo}
                    </span>{" "}
                    lalu klik tautan konfirmasi. Email baru berlaku setelah
                    dikonfirmasi.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tidak menemukan email? Periksa folder spam. Bila pengaturan
                  &quot;Secure email change&quot; aktif di Supabase, konfirmasi
                  juga diminta dari email lama.
                </p>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                  >
                    Tutup
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={emailForm.handleSubmit(onSubmitEmail)}
                noValidate
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="account-current-email">Email Saat Ini</Label>
                  <Input
                    id="account-current-email"
                    value={user?.email ?? "-"}
                    readOnly
                    disabled
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account-new-email">Email Baru</Label>
                  <Input
                    id="account-new-email"
                    type="email"
                    autoComplete="email"
                    placeholder="admin@namadomain.com"
                    aria-invalid={Boolean(emailErrors.new_email)}
                    {...emailForm.register("new_email")}
                  />
                  {emailErrors.new_email?.message && (
                    <p className="text-xs text-destructive">
                      {emailErrors.new_email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account-confirm-email">
                    Konfirmasi Email Baru
                  </Label>
                  <Input
                    id="account-confirm-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Ulangi email baru"
                    aria-invalid={Boolean(emailErrors.confirm_email)}
                    {...emailForm.register("confirm_email")}
                  />
                  {emailErrors.confirm_email?.message && (
                    <p className="text-xs text-destructive">
                      {emailErrors.confirm_email.message}
                    </p>
                  )}
                </div>

                {emailError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                  >
                    {emailError}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Tautan konfirmasi dikirim ke email baru — perubahan aktif
                  setelah tautan diklik. Layanan email bawaan Supabase
                  dibatasi ±2 email/jam per proyek.
                </p>

                <DialogFooter className="gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={emailSubmitting}
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={emailSubmitting}>
                    {emailSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Mengirim...
                      </>
                    ) : (
                      "Kirim Tautan Konfirmasi"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </TabsContent>

          {/* ---------------- Tab password ---------------- */}
          <TabsContent value="password" className="pt-2">
            <form
              onSubmit={passwordForm.handleSubmit(onSubmitPassword)}
              noValidate
              className="space-y-4"
            >
              <PasswordField
                id="account-current-password"
                label="Password Saat Ini"
                autoComplete="current-password"
                registration={passwordForm.register("current_password")}
                error={passwordErrors.current_password?.message}
              />

              <PasswordField
                id="account-new-password"
                label="Password Baru"
                autoComplete="new-password"
                registration={passwordForm.register("new_password")}
                error={passwordErrors.new_password?.message}
                hint="Minimal 8 karakter, berbeda dari password saat ini."
              />

              <PasswordField
                id="account-confirm-password"
                label="Konfirmasi Password Baru"
                autoComplete="new-password"
                registration={passwordForm.register("confirm_password")}
                error={passwordErrors.confirm_password?.message}
              />

              {passwordError && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                >
                  {passwordError}
                </p>
              )}

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={passwordSubmitting}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={passwordSubmitting}>
                  {passwordSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    "Simpan Password"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
