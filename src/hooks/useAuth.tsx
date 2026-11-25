import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"

import { supabase, PASSWORD_RECOVERY_STORAGE_KEY } from "@/lib/supabase"
import { fetchProfile, signIn, signOut } from "@/services/auth.service"
import type { ProfileRow } from "@/types"

interface AuthContextValue {
  /** Session Supabase aktif (null = belum login / logout). */
  session: Session | null
  user: User | null
  /** Profil admin dari tabel profiles. */
  profile: ProfileRow | null
  /** True saat proses pemulihan session awal masih berjalan. */
  loading: boolean
  /**
   * True saat session berasal dari tautan reset password (event
   * PASSWORD_RECOVERY). Selama aktif, area admin dialihkan ke /reset-password.
   */
  passwordRecovery: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Hapus status recovery (dipanggil setelah password baru tersimpan). */
  clearPasswordRecovery: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Penanda sesi recovery disimpan di localStorage agar berlaku lintas tab
 * dan tetap ada saat halaman di-refresh — Supabase hanya mengirim event
 * PASSWORD_RECOVERY sekali saat tautan email pertama dibuka. Penanda awal
 * juga dipasang oleh `lib/supabase.ts` saat URL masih utuh.
 */
function readRecoveryFlag(): boolean {
  try {
    return window.localStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function writeRecoveryFlag(active: boolean): void {
  try {
    if (active) {
      window.localStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "1")
    } else {
      window.localStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY)
    }
  } catch {
    // localStorage bisa diblokir (mis. mode privat) — abaikan.
  }
}

/**
 * Deteksi cadangan dari URL: tautan recovery membawa `type=recovery` plus
 * token asli (access_token pada implicit flow / code pada PKCE). Sekadar
 * menambahkan `#type=recovery` manual tidak dianggap sah.
 */
function detectRecoveryInUrl(): boolean {
  try {
    const { search, hash } = window.location
    const hasRecoveryType = /(?:^|[#&?])type=recovery(?:[&=]|$)/.test(
      `${search}${hash}`,
    )
    if (!hasRecoveryType) return false

    return (
      /(?:^|[#&?])access_token=/.test(hash) ||
      /(?:^|[?&])code=/.test(search)
    )
  } catch {
    return false
  }
}

/**
 * Provider autentikasi aplikasi.
 * - Memulihkan session tersimpan saat aplikasi dibuka (session persistence).
 * - Mendengarkan perubahan auth (login/logout) dari Supabase.
 * - Mengambil profil admin setelah user diketahui.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    const fromUrl = detectRecoveryInUrl()
    if (fromUrl) writeRecoveryFlag(true)
    return fromUrl || readRecoveryFlag()
  })

  useEffect(() => {
    // Pulihkan session tersimpan (kalau ada) lalu matikan loading.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)

        // Tautan recovery kedaluwarsa/tidak valid: Supabase tidak membuat
        // session. Bersihkan penanda agar tidak terjadi loop
        // login → /reset-password → login.
        if (!data.session) {
          writeRecoveryFlag(false)
          setPasswordRecovery(false)
        }
      })
      .finally(() => {
        setLoading(false)
      })

    // Dengarkan perubahan status auth (termasuk event INITIAL_SESSION).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)

      if (event === "PASSWORD_RECOVERY") {
        // Sesi sementara dari tautan email — wajib ganti password dulu.
        writeRecoveryFlag(true)
        setPasswordRecovery(true)
      } else if (event === "SIGNED_OUT") {
        writeRecoveryFlag(false)
        setPasswordRecovery(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id ?? null

  useEffect(() => {
    let cancelled = false

    if (!userId) {
      setProfile(null)
      return
    }

    fetchProfile(userId)
      .then((profileRow) => {
        if (!cancelled) setProfile(profileRow)
      })
      .catch(() => {
        // Profil gagal dimuat tidak fatal; UI memakai fallback nama.
        if (!cancelled) setProfile(null)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const login = useCallback(async (email: string, password: string) => {
    await signIn(email, password)
    // State session diperbarui otomatis oleh onAuthStateChange.
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setProfile(null)
  }, [])

  const clearPasswordRecovery = useCallback(() => {
    writeRecoveryFlag(false)
    setPasswordRecovery(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      passwordRecovery,
      login,
      logout,
      clearPasswordRecovery,
    }),
    [
      session,
      profile,
      loading,
      passwordRecovery,
      login,
      logout,
      clearPasswordRecovery,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Hook akses state & aksi autentikasi. Wajib dipakai di dalam AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth harus dipanggil di dalam <AuthProvider>.")
  }
  return ctx
}
