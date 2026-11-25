import { useState } from "react"
import type { UseFormRegisterReturn } from "react-hook-form"
import { Eye, EyeOff } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PasswordFieldProps {
  id: string
  label: string
  autoComplete: string
  registration: UseFormRegisterReturn
  error?: string
  hint?: string
}

/** Input password dengan tombol tampilkan/sembunyikan. */
export function PasswordField({
  id,
  label,
  autoComplete,
  registration,
  error,
  hint,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-10"
          aria-invalid={Boolean(error)}
          {...registration}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          title={visible ? "Sembunyikan password" : "Tampilkan password"}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
