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
