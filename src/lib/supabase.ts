import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Konfigurasi Supabase belum lengkap. " +
      "Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada file .env " +
      "(salin dari .env.example).",
  )
}

/**
 * Client Supabase untuk sisi frontend.
 *
 * Hanya memakai publishable/anon key yang dilindungi Row Level Security.
 * JANGAN PERNAH memasukkan service_role key ke project ini.
 *
 * Session admin disimpan otomatis di localStorage (persist) dan token
 * di-refresh otomatis sehingga admin tetap login antar kunjungan.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Kunci localStorage penanda sesi recovery (tautan reset password). */
export const PASSWORD_RECOVERY_STORAGE_KEY = "mtwo-password-recovery"

/**
 * Tangkap tautan recovery dari URL sedini mungkin — sebelum Supabase
 * membersihkan hash saat inisialisasi. Event PASSWORD_RECOVERY bisa tiba
 * sebelum listener React terpasang, sehingga penanda ini mencegah halaman
 * /reset-password salah menganggap tautan kedaluwarsa.
 *
 * Hanya URL yang membawa token (access_token pada implicit flow atau code
 * pada PKCE) yang diterima, bukan sekadar `#type=recovery`.
 */
function capturePasswordRecoveryFromUrl(): void {
  try {
    const { search, hash } = window.location
    const hasRecoveryType = /(?:^|[#&?])type=recovery(?:[&=]|$)/.test(
      `${search}${hash}`,
    )
    if (!hasRecoveryType) return

    const hasToken =
      /(?:^|[#&?])access_token=/.test(hash) ||
      /(?:^|[?&])code=/.test(search)
    if (!hasToken) return

    window.localStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "1")
  } catch {
    // URL/localStorage tidak tersedia (mis. SSR/privat) — abaikan.
  }
}

capturePasswordRecoveryFromUrl()
