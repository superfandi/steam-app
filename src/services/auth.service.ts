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

/**
 * Ganti email akun. Supabase mengirim tautan konfirmasi ke email baru
 * (dan email lama bila pengaturan "Secure email change" aktif di proyek).
 * Email baru berlaku efektif setelah tautan dikonfirmasi.
 */
export async function updateEmail(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: window.location.origin },
  )
  if (error) throw error
}

/**
 * Ganti password. Password saat ini diverifikasi ulang (re-autentikasi)
 * agar sesi yang tertinggal terbuka tidak bisa dipakai mengganti password
 * tanpa mengetahui password lama.
 */
export async function updatePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (verifyError) throw verifyError

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

/**
 * Kirim tautan reset password ke email terdaftar.
 * Supabase selalu merespons sukses walau email tidak terdaftar
 * (mencegah penebakan email), jadi UI wajib memakai pesan netral.
 * Tautan mengarah ke /reset-password di origin aplikasi.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

/**
 * Simpan password baru dari sesi recovery (tautan email), lalu putuskan
 * semua sesi: perangkat lain di-revoke dan sesi lokal ditutup agar admin
 * login ulang dengan password baru.
 */
export async function completePasswordReset(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error

  // Best-effort: gagal memutus sesi lain tidak membatalkan password baru.
  await supabase.auth.signOut({ scope: "others" })

  // Tutup sesi recovery di perangkat ini.
  const { error: localError } = await supabase.auth.signOut({ scope: "local" })
  if (localError) throw localError
}

/**
 * Keluar dari sesi recovery tanpa mengganti password. Hanya sesi lokal
 * yang ditutup — sesi admin di perangkat lain tidak ikut diputus.
 */
export async function cancelPasswordReset(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" })
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

/**
 * Kode error Supabase Auth (tersedia pada AuthApiError), mis.
 * "over_email_send_rate_limit" atau "email_address_not_authorized".
 */
function getAuthErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string") return code
  }
  return ""
}

/** Pesan kuota email Supabase (layanan bawaan) — dipakai beberapa mapping. */
const EMAIL_QUOTA_MESSAGE =
  "Kuota email Supabase sudah habis (layanan email bawaan dibatasi 2 email/jam " +
  "per proyek, bukan per pengguna). Tunggu ±1 jam, atau pasang SMTP sendiri di " +
  "Supabase → Authentication → Emails → SMTP Settings agar batasnya naik."

/**
 * Menerjemahkan error pengiriman email Supabase (kuota proyek, jeda per
 * alamat, atau alamat tidak diizinkan). Mengembalikan null jika bukan
 * error pengiriman email.
 */
function getEmailSendErrorMessage(code: string, raw: string): string | null {
  // Satu kode dipakai untuk dua batas: kuota proyek (2 email/jam) dan
  // jeda per alamat (60 detik). Pesan membedakannya.
  if (code === "over_email_send_rate_limit") {
    const wait = raw.match(/after (\d+) seconds?/i)
    if (wait) {
      return `Terlalu sering meminta tautan. Tunggu ${wait[1]} detik sebelum mencoba lagi.`
    }
    return EMAIL_QUOTA_MESSAGE
  }
  if (/email rate limit exceeded/i.test(raw)) {
    return EMAIL_QUOTA_MESSAGE
  }
  if (
    code === "email_address_not_authorized" ||
    /email address not authorized/i.test(raw)
  ) {
    return (
      "Layanan email bawaan Supabase hanya mengirim ke alamat anggota tim " +
      "proyek. Gunakan email tersebut, atau pasang SMTP sendiri di " +
      "Authentication → Emails → SMTP Settings."
    )
  }
  return null
}

/**
 * Menerjemahkan error operasi akun (ganti email/password) menjadi
 * pesan ramah pengguna.
 */
export function getAccountErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const code = getAuthErrorCode(error)

  // --- Batas pengiriman email Supabase -------------------------------
  const emailSendError = getEmailSendErrorMessage(code, raw)
  if (emailSendError) return emailSendError

  // --- Kesalahan umum lainnya ----------------------------------------
  if (/invalid login credentials/i.test(raw)) {
    return "Password saat ini salah."
  }
  if (/new password should be different|should be different from the old/i.test(raw)) {
    return "Password baru harus berbeda dari password saat ini."
  }
  if (/password.*(at least|characters)|weak.?password/i.test(raw)) {
    return "Password baru terlalu lemah. Gunakan minimal 8 karakter."
  }
  if (/already (been )?registered|email.*already.*(exist|in use)/i.test(raw)) {
    return "Email tersebut sudah terdaftar pada akun lain."
  }
  if (/invalid email|email.*invalid|unable to validate email/i.test(raw)) {
    return "Format email tidak valid."
  }
  if (/rate limit|too many/i.test(raw)) {
    return "Terlalu banyak permintaan. Tunggu beberapa saat, lalu coba lagi."
  }
  if (/auth session missing|session.*(expired|not found)/i.test(raw)) {
    return "Sesi login berakhir. Silakan login ulang."
  }
  if (/failed to fetch|network|load failed/i.test(raw)) {
    return "Koneksi ke server gagal. Periksa koneksi internet Anda."
  }
  return "Gagal memperbarui akun. Silakan coba lagi."
}

/**
 * Menerjemahkan error permintaan tautan reset password (dialog
 * "Lupa Password") menjadi pesan ramah pengguna.
 */
export function getPasswordResetRequestErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const code = getAuthErrorCode(error)

  const emailSendError = getEmailSendErrorMessage(code, raw)
  if (emailSendError) return emailSendError

  if (/invalid email|email.*invalid|unable to validate email/i.test(raw)) {
    return "Format email tidak valid."
  }
  if (/rate limit|too many|security purposes/i.test(raw)) {
    return "Terlalu banyak permintaan. Tunggu beberapa saat, lalu coba lagi."
  }
  if (/failed to fetch|network|load failed/i.test(raw)) {
    return "Koneksi ke server gagal. Periksa koneksi internet Anda."
  }
  return "Gagal mengirim tautan reset. Silakan coba lagi."
}

/**
 * Menerjemahkan error penyimpanan password baru dari halaman
 * /reset-password (sesi recovery).
 */
export function getSetPasswordErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const code = getAuthErrorCode(error)

  if (
    code === "same_password" ||
    /should be different from the old|new password should be different/i.test(raw)
  ) {
    return "Password baru harus berbeda dari password sebelumnya."
  }
  if (code === "reauthentication_needed" || /requires reauthentication/i.test(raw)) {
    return "Sesi terlalu lama untuk mengganti password. Minta tautan reset baru dari halaman login."
  }
  if (/weak.?password|password.*(at least|characters)/i.test(raw)) {
    return "Password baru terlalu lemah. Gunakan minimal 8 karakter."
  }
  if (
    code === "session_not_found" ||
    code === "refresh_token_not_found" ||
    /auth session missing|session.*(expired|not found)|invalid.*(token|jwt)/i.test(
      raw,
    )
  ) {
    return "Sesi reset sudah berakhir. Minta tautan reset baru dari halaman login."
  }
  if (/rate limit|too many/i.test(raw)) {
    return "Terlalu banyak permintaan. Tunggu beberapa saat, lalu coba lagi."
  }
  if (/failed to fetch|network|load failed/i.test(raw)) {
    return "Koneksi ke server gagal. Periksa koneksi internet Anda."
  }
  return "Gagal menyimpan password baru. Silakan coba lagi."
}
