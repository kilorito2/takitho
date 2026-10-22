import { z } from 'zod'
import { isFilled } from '@/lib/links'

const int = (min: number, max: number, what: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${what}: solo números enteros.`)
    .transform(Number)
    .pipe(z.number().min(min, `${what}: mínimo ${min}.`).max(max, `${what}: máximo ${max}.`))

/** A web address, or the `[COMPLETAR]` placeholder / empty while the data is not there yet. */
const url = z
  .string()
  .trim()
  .refine((v) => v === '' || !isFilled(v) || /^https:\/\/\S+$/.test(v), 'Tiene que empezar con https://')

/** "0, 5, 10" → [0, 5, 10] (sorted, unique, 0–50 %). */
export function parseTipPresets(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 5) return null
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : Number.NaN))
  if (nums.some((n) => Number.isNaN(n) || n > 50)) return null
  return [...new Set(nums)].sort((a, b) => a - b)
}

export const settingsFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Poné el nombre del local.').max(40),
    tagline: z.string().trim().max(80),
    address: z.string().trim().max(120),
    mapsUrl: url,
    whatsapp: z
      .string()
      .trim()
      .refine((v) => !isFilled(v) || /^\+?[\d\s()-]{8,20}$/.test(v), 'Escribí el número con código de área.'),
    instagram: z.string().trim().max(60),
    facebook: z.string().trim().max(60),
    tiktok: z.string().trim().max(60),
    publicUrl: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || /^https:\/\/[^\s/]+\/?$/.test(v),
        'La dirección de la web, con https:// y sin barras al final.',
      ),
    transferAlias: z.string().trim().max(40),
    transferCbu: z
      .string()
      .trim()
      .refine((v) => !isFilled(v) || /^\d{22}$/.test(v.replaceAll(' ', '')), 'El CBU/CVU tiene 22 números.'),
    transferHolder: z.string().trim().max(60),
    prepMinutes: int(0, 240, 'Demora estimada'),
    timerWarnMinutes: int(1, 240, 'Aviso de demora'),
    timerLateMinutes: int(2, 480, 'Pedido atrasado'),
    pendingPaymentTtlMin: int(5, 1440, 'Espera de pago'),
    maxScheduleDays: int(0, 14, 'Días para programar'),
    tipPresets: z
      .string()
      .refine(
        (v) => parseTipPresets(v) !== null,
        'Hasta 5 porcentajes entre 0 y 50, separados por coma. Ej.: 0, 5, 10',
      ),
    payMpEnabled: z.boolean(),
    payCashEnabled: z.boolean(),
    payTransferEnabled: z.boolean(),
    isPaused: z.boolean(),
    isClosedManually: z.boolean(),
    acceptsScheduledWhenClosed: z.boolean(),
  })
  .superRefine((s, ctx) => {
    if (s.timerLateMinutes <= s.timerWarnMinutes)
      ctx.addIssue({
        code: 'custom',
        path: ['timerLateMinutes'],
        message: '"Atrasado" tiene que ser más que "Demora".',
      })
    if (!s.payMpEnabled && !s.payCashEnabled && !s.payTransferEnabled)
      ctx.addIssue({
        code: 'custom',
        path: ['payCashEnabled'],
        message: 'Dejá al menos un medio de pago habilitado.',
      })
  })

export type SettingsFormInput = z.input<typeof settingsFormSchema>
export type SettingsFormValues = z.output<typeof settingsFormSchema>

/* ----------------------------------------------------------------- opening hours */

export interface ShiftDraft {
  weekday: number
  opensAt: string
  closesAt: string
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}

const WEEK = 7 * 1440

/** Absolute span within the week; a shift that closes at or before it opens ends the next day. */
function span(s: ShiftDraft): [number, number] {
  const start = s.weekday * 1440 + toMinutes(s.opensAt)
  const closes = toMinutes(s.closesAt)
  const length =
    closes <= toMinutes(s.opensAt) ? 1440 - toMinutes(s.opensAt) + closes : closes - toMinutes(s.opensAt)
  return [start, start + length]
}

/** First problem in the weekly schedule, in words for the owner; null when it is consistent. */
export function shiftsProblem(shifts: readonly ShiftDraft[]): string | null {
  const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  for (const s of shifts) {
    if (!/^\d{2}:\d{2}$/.test(s.opensAt) || !/^\d{2}:\d{2}$/.test(s.closesAt))
      return `Completá la hora del ${names[s.weekday] ?? 'día'}.`
    if (s.opensAt === s.closesAt) return `El ${names[s.weekday] ?? 'día'} abre y cierra a la misma hora.`
  }
  const spans = shifts.map((s) => ({ s, range: span(s) }))
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]
      const b = spans[j]
      if (!a || !b) continue
      // Compare on a circular week: shift b by ±one week so Saturday night overlapping Sunday morning is caught.
      for (const shift of [0, WEEK, -WEEK]) {
        if (a.range[0] < b.range[1] + shift && b.range[0] + shift < a.range[1])
          return `Se superponen dos turnos del ${names[a.s.weekday] ?? 'día'} y el ${names[b.s.weekday] ?? 'día'}.`
      }
    }
  }
  return null
}

/* ----------------------------------------------------------------- delivery zones */

export const zoneFormSchema = z.object({
  name: z.string().trim().min(2, 'Poné un nombre.').max(60),
  neighborhoods: z.string().trim().max(300),
  fee: int(0, 100_000, 'Costo de envío'),
  minOrder: int(0, 1_000_000, 'Pedido mínimo'),
})
export type ZoneFormInput = z.input<typeof zoneFormSchema>

/** "Centro, Alberdi , Güemes" → ["Centro", "Alberdi", "Güemes"]. */
export const parseNeighborhoods = (text: string): string[] => [
  ...new Set(
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
]
