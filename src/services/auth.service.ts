import { supabase } from "@/lib/supabase"
import type { ProfileRow } from "@/types"

/** Login admin dengan email + password (Supabase Auth). */
export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Logout dan hapus session. */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/** Ambil profil admin (tabel profiles) milik user yang sedang login. */
export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error
  return (data as ProfileRow | null) ?? null
}

/**
 * Menerjemahkan error Supabase menjadi pesan ramah pengguna
 * (jangan menampilkan error teknis mentah ke admin).
 */
export function getAuthErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : ""

  if (/invalid login credentials/i.test(raw)) {
    return "Email atau password salah."
  }
  if (/rate limit|too many/i.test(raw)) {
    return "Terlalu banyak percobaan login. Tunggu beberapa saat, lalu coba lagi."
  }
  if (/email not confirmed/i.test(raw)) {
    return "Email belum dikonfirmasi. Periksa email Anda terlebih dahulu."
  }
  if (/failed to fetch|network|load failed/i.test(raw)) {
    return "Koneksi ke server gagal. Periksa koneksi internet Anda."
  }
  if (/konfigurasi supabase/i.test(raw)) {
    return "Konfigurasi aplikasi belum lengkap. Hubungi pengelola sistem."
  }
  return "Terjadi kesalahan saat login. Silakan coba lagi."
}
