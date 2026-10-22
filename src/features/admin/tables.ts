import { z } from 'zod'

/** The link a table's QR opens: the menu, remembering the table for the whole visit (see `parseTable`). */
export function tableUrl(base: string, number: number): string {
  return `${base.trim().replace(/\/+$/, '')}/menu?mesa=${number}`
}

/** Lowest free number above the highest one in use (tables are usually numbered 1, 2, 3…). */
export function nextTableNumber(taken: readonly number[]): number {
  return Math.max(0, ...taken) + 1
}

export const tableFormSchema = z.object({
  number: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, 'Un número del 1 al 999.')
    .transform(Number)
    .pipe(z.number().min(1, 'Un número del 1 al 999.')),
  label: z.string().trim().max(20, 'Máximo 20 letras.'),
})
export type TableFormInput = z.input<typeof tableFormSchema>

/** Cards per A4 page: 2 columns × 3 rows. */
export const CARDS_PER_PAGE = 6

export interface CardBox {
  page: number
  x: number
  y: number
  w: number
  h: number
}

/** Millimetre boxes for the QR cards on A4 (210 × 297), left to right, top to bottom, 6 per page. */
export function cardBoxes(count: number): CardBox[] {
  const margin = 10
  const gap = 6
  const w = (210 - margin * 2 - gap) / 2
  const h = (297 - margin * 2 - gap * 2) / 3
  return Array.from({ length: count }, (_, i) => {
    const slot = i % CARDS_PER_PAGE
    return {
      page: Math.floor(i / CARDS_PER_PAGE),
      x: margin + (slot % 2) * (w + gap),
      y: margin + Math.floor(slot / 2) * (h + gap),
      w,
      h,
    }
  })
}
