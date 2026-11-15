import { BrowserRouter, Route, Routes } from "react-router-dom"

import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/hooks/useAuth"
import AdminLayout from "@/layouts/AdminLayout"
import DashboardPage from "@/pages/DashboardPage"
import HistoryDetailPage from "@/pages/HistoryDetailPage"
import HistoryPage from "@/pages/HistoryPage"
import LoginPage from "@/pages/LoginPage"
import NotFoundPage from "@/pages/NotFoundPage"
import PosPage from "@/pages/PosPage"
import ReportsPage from "@/pages/ReportsPage"
import ServicesPage from "@/pages/ServicesPage"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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

        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}
