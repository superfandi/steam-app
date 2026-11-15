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

import { supabase } from "@/lib/supabase"
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
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

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

  useEffect(() => {
    // Pulihkan session tersimpan (kalau ada) lalu matikan loading.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
      })
      .finally(() => {
        setLoading(false)
      })

    // Dengarkan perubahan status auth (termasuk event INITIAL_SESSION).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
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

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      login,
      logout,
    }),
    [session, profile, loading, login, logout],
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
