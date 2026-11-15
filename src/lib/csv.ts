/**
 * Util export CSV.
 * Pemisah kolom memakai ";" (konvensi Excel lokal Indonesia, karena
 * koma dipakai sebagai pemisah desimal) dan diberi BOM agar karakter
 * non-ASCII tampil benar di Excel.
 */

function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value)
  if (/[",;\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null>>,
): void {
  const lines = [
    headers.map(escapeCell).join(";"),
    ...rows.map((row) => row.map(escapeCell).join(";")),
  ]
  const content = `\uFEFF${lines.join("\r\n")}`

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
