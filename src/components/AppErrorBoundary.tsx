import { Component, type ErrorInfo, type ReactNode } from "react"

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
}

/**
 * Batas error level aplikasi.
 * Menangkap error render (termasuk gagal memuat chunk hasil code-splitting,
 * misalnya saat pengguna memegang versi lama halaman setelah deploy baru)
 * lalu menampilkan pesan ramah dengan tombol muat ulang — alih-alih
 * layar putih kosong.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary:", error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
            <h2 className="text-lg font-bold">Terjadi kesalahan</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Aplikasi gagal dimuat dengan benar. Muat ulang halaman untuk
              mencoba lagi. Data yang sudah tersimpan di database tidak
              terpengaruh.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
