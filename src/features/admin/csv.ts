export type Cell = string | number | boolean | null | undefined

const BOM = '﻿'

/**
 * Spreadsheet formulas start with = + - @ (or a tab / carriage return). A customer name like "=HYPERLINK(...)" would
 * run when the owner opens the export, so such text gets a leading apostrophe. Real numbers are left alone.
 */
function guard(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function escape(cell: Cell): string {
  if (cell === null || cell === undefined) return ''
  const text =
    typeof cell === 'number' ? String(cell) : typeof cell === 'boolean' ? (cell ? 'Sí' : 'No') : guard(cell)
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** CSV for Excel in es-AR: `;` separator (the comma is the decimal mark), CRLF lines, UTF-8 BOM so accents survive. */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return BOM + rows.map((row) => row.map(escape).join(';')).join('\r\n') + '\r\n'
}

/** Triggers a browser download of `text` as a file. */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type }))
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
