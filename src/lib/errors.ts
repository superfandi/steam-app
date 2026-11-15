/**
 * Helper membaca kode error Postgres dari error Supabase,
 * dipakai untuk menerjemahkan error menjadi pesan ramah pengguna.
 */
export function getDbErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string" && code.length > 0) return code
  }
  return null
}
