import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppErrorBoundary } from "@/components/AppErrorBoundary"
import { FullScreenLoader } from "@/components/shared/FullScreenLoader"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/hooks/useAuth"
import AdminLayout from "@/layouts/AdminLayout"

/**
 * Code-splitting: setiap halaman dipecah menjadi chunk tersendiri dan
 * dimuat on-demand, sehingga bundle awal tetap kecil (mis. Recharts hanya
 * dibutuhkan di Dashboard & Laporan). Layout admin tetap dimuat eagerly
 * agar kerangka aplikasi tampil segera.
 */
const LoginPage = lazy(() => import("@/pages/LoginPage"))
const DashboardPage = lazy(() => import("@/pages/DashboardPage"))
const PosPage = lazy(() => import("@/pages/PosPage"))
const ServicesPage = lazy(() => import("@/pages/ServicesPage"))
const HistoryPage = lazy(() => import("@/pages/HistoryPage"))
const HistoryDetailPage = lazy(() => import("@/pages/HistoryDetailPage"))
const ReportsPage = lazy(() => import("@/pages/ReportsPage"))
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppErrorBoundary>
          {/* Fallback Suspense dipakai saat chunk halaman sedang dimuat. */}
          <Suspense fallback={<FullScreenLoader label="Memuat halaman..." />}>
            <Routes>
              {/* Publik: hanya halaman login (tanpa registrasi publik). */}
              <Route path="/login" element={<LoginPage />} />

              {/* Area admin: dilindungi ProtectedRoute + layout sidebar. */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AdminLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="pos" element={<PosPage />} />
                  <Route path="services" element={<ServicesPage />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="history/:id" element={<HistoryDetailPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                </Route>
              </Route>

              {/* Fallback 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AppErrorBoundary>

        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}
