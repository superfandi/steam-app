import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"

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
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/validators"
import {
  getPasswordResetRequestErrorMessage,
  requestPasswordReset,
} from "@/services/auth.service"

interface ForgotPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Dialog "Lupa Password?" di halaman login.
 *
 * Supabase tidak membocorkan apakah email terdaftar (respons selalu sukses),
 * sehingga UI juga memakai pesan netral: "jika email terdaftar, tautan
 * telah dikirim". Tautan membuka /reset-password dengan sesi recovery.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: ForgotPasswordDialogProps) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  })

  const submitting = form.formState.isSubmitting

  // Reset isi form & status setiap kali dialog dibuka.
  useEffect(() => {
    if (!open) return
    setSentTo(null)
    setFormError(null)
    form.reset()
  }, [open, form])

  function handleOpenChange(next: boolean) {
    if (!next && submitting) return
    onOpenChange(next)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await requestPasswordReset(values.email)
      setSentTo(values.email)
      toast.success("Jika email terdaftar, tautan reset telah dikirim.")
    } catch (err) {
      const message = getPasswordResetRequestErrorMessage(err)
      setFormError(message)
      toast.error(message)
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lupa Password?</DialogTitle>
          <DialogDescription>
            Masukkan email akun admin Anda. Kami akan mengirim tautan untuk
            membuat password baru.
          </DialogDescription>
        </DialogHeader>

        {sentTo ? (
          <div className="space-y-4">
            <div
              role="status"
              className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm"
            >
              <p className="flex items-center gap-2 font-semibold text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Jika email terdaftar, tautan reset telah dikirim
              </p>
              <p className="mt-1.5 text-muted-foreground">
                Periksa inbox{" "}
                <span className="font-medium text-foreground">{sentTo}</span>{" "}
                dan folder spam. Klik tautan untuk membuat password baru.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Tautan hanya bisa dipakai sekali dan berlaku terbatas. Jika belum
              menerima email, tunggu minimal 60 detik sebelum mencoba lagi —
              layanan email bawaan Supabase dibatasi 2 email/jam per proyek.
            </p>

            <p className="text-xs text-muted-foreground">
              Lupa alamat email? Hubungi pengelola sistem — email terdaftar
              hanya bisa dilihat melalui Supabase Dashboard → Authentication →
              Users.
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Tutup
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email Akun</Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@mtwosteam.id"
                  className="pl-9"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email?.message && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                {formError}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Demi keamanan, aplikasi tidak memberi tahu apakah email terdaftar
              atau tidak. Hubungi pengelola sistem jika email Anda lupa.
            </p>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  "Kirim Tautan Reset"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
