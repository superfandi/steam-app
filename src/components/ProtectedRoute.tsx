import { Navigate, Outlet, useLocation } from "react-router-dom"

import { FullScreenLoader } from "@/components/shared/FullScreenLoader"
import { useAuth } from "@/hooks/useAuth"

/**
 * Guard seluruh area admin:
 * - Menampilkan loader saat session masih dipulihkan.
 * - Sesi recovery (dari tautan reset password) hanya boleh mengakses
 *   /reset-password — tidak bisa dipakai masuk aplikasi.
 * - Mengalihkan ke /login jika belum terautentikasi
 *   (menyimpan halaman asal agar bisa kembali setelah login).
 */
export function ProtectedRoute() {
  const { session, loading, passwordRecovery } = useAuth()
  const location = useLocation()

  if (loading) {
    return <FullScreenLoader label="Memeriksa sesi..." />
  }

  if (passwordRecovery) {
    return <Navigate to="/reset-password" replace />
  }

  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  }

  return <Outlet />
}
