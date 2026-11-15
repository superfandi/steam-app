import { useState } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { toast } from "sonner"
import {
  BarChart3,
  Droplets,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ShoppingCart,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react"

import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useAuth } from "@/hooks/useAuth"
import { ChatWidget } from "@/components/chat/ChatWidget"

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** true jika harus cocok persis (untuk route index). */
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/pos", label: "Kasir (POS)", icon: ShoppingCart },
  { to: "/services", label: "Manajemen Layanan", icon: Sparkles },
  { to: "/employees", label: "Karyawan", icon: Users },
  { to: "/history", label: "Riwayat Transaksi", icon: ReceiptText },
  { to: "/commissions", label: "Komisi", icon: HandCoins },
  { to: "/reports", label: "Laporan", icon: BarChart3 },
]

/** Logo + nama aplikasi pada sidebar. */
function SidebarBrand() {
  return (
    <div className="flex items-center gap-3 px-6 py-5 lg:pl-[18px] lg:pr-3 lg:transition-[padding] lg:duration-200 lg:ease-out lg:group-hover/sb:px-6">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary">
        <Droplets className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="min-w-0 whitespace-nowrap leading-tight lg:opacity-0 lg:transition-opacity lg:duration-200 lg:group-hover/sb:opacity-100">
        <p className="text-sm font-bold tracking-wide text-white">Pandawa Steam</p>
        <p className="text-[11px] text-sidebar-muted">Cuci Motor &amp; Mobil</p>
      </div>
    </div>
  )
}

/** Daftar tautan navigasi sidebar. */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3 lg:px-0 lg:transition-[padding] lg:duration-200 lg:ease-out lg:group-hover/sb:px-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          title={item.label}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:px-[28px] lg:transition-[padding,color,background-color] lg:duration-200 lg:ease-out lg:group-hover/sb:px-3",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate whitespace-nowrap lg:w-0 lg:flex-none lg:opacity-0 lg:transition-[opacity,width] lg:duration-200 lg:group-hover/sb:w-auto lg:group-hover/sb:flex-1 lg:group-hover/sb:opacity-100">
            {item.label}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}

/** Kartu akun admin + tombol keluar di dasar sidebar. */
function SidebarFooterCard({
  displayName,
  email,
  onLogout,
}: {
  displayName: string
  email: string
  onLogout: () => void
}) {
  return (
    <div className="border-t border-sidebar-border p-4 lg:p-[18px] lg:transition-[padding] lg:duration-200 lg:ease-out lg:group-hover/sb:p-4">
      <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/40 p-3 lg:bg-transparent lg:p-0 lg:transition-[padding,background-color] lg:duration-200 lg:ease-out lg:group-hover/sb:bg-sidebar-accent/40 lg:group-hover/sb:p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {displayName.charAt(0).toUpperCase() || "A"}
        </div>
        <div className="min-w-0 flex-1 leading-tight lg:w-0 lg:flex-none lg:opacity-0 lg:transition-[opacity,width] lg:duration-200 lg:group-hover/sb:w-auto lg:group-hover/sb:flex-1 lg:group-hover/sb:opacity-100">
          <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">
            {displayName}
          </p>
          <p className="truncate text-xs text-sidebar-muted">{email}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onLogout}
          className="shrink-0 text-sidebar-muted hover:bg-sidebar-accent hover:text-red-400 lg:pointer-events-none lg:opacity-0 lg:transition-opacity lg:duration-200 lg:group-hover/sb:pointer-events-auto lg:group-hover/sb:opacity-100"
          title="Keluar dari aplikasi"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Layout utama seluruh halaman admin:
 * - Sidebar gelap di layar besar (lg+): mode rail 72px (ikon saja) yang
 *   mengembang ke 256px saat di-hover atau menerima fokus keyboard
 *   (focus-within) — overlay, konten halaman tidak bergeser.
 * - Sidebar berupa drawer (Sheet) di layar kecil.
 * - Topbar berjudul halaman aktif + menu akun admin.
 */
export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const { user, profile, logout } = useAuth()

  const activeItem =
    NAV_ITEMS.find((item) =>
      item.end
        ? location.pathname === item.to
        : location.pathname.startsWith(item.to),
    ) ?? null

  const pageTitle = activeItem?.label ?? "Pandawa Steam"

  const displayName = profile?.full_name?.trim() || "Admin"
  const email = user?.email ?? "-"

  async function handleLogout() {
    try {
      await logout()
      toast.success("Anda telah keluar dari aplikasi.")
    } catch {
      toast.error("Gagal logout. Coba lagi.")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ---------------- Sidebar desktop ---------------- */}
      <aside className="group/sb fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out hover:w-64 focus-within:w-64 motion-reduce:transition-none lg:flex">
        <SidebarBrand />
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav />
        </div>
        <SidebarFooterCard
          displayName={displayName}
          email={email}
          onLogout={handleLogout}
        />
      </aside>

      {/* ---------------- Konten + topbar ---------------- */}
      <div className="flex min-h-screen flex-col lg:pl-[72px]">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            {/* Tombol menu (mobile) */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  title="Buka menu navigasi"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
                <div className="flex h-full flex-col">
                  <SidebarBrand />
                  <div className="flex-1 overflow-y-auto py-4">
                    <SidebarNav onNavigate={() => setDrawerOpen(false)} />
                  </div>
                  <SidebarFooterCard
                    displayName={displayName}
                    email={email}
                    onLogout={() => {
                      setDrawerOpen(false)
                      void handleLogout()
                    }}
                  />
                </div>
              </SheetContent>
            </Sheet>

            <h1 className="truncate text-base font-semibold md:text-lg">
              {pageTitle}
            </h1>

            {/* Menu akun (mobile & desktop) */}
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground outline-none ring-ring transition focus-visible:ring-2 focus-visible:ring-offset-2"
                    title="Menu akun"
                  >
                    {displayName.charAt(0).toUpperCase() || "A"}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="truncate text-sm font-semibold">{displayName}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {email}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void handleLogout()}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
          <Outlet />
        </main>
      </div>

      {/* Asisten data (chat Gemini) — semua halaman */}
      <ChatWidget />
    </div>
  )
}
