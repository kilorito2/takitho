import { businessDate } from '@/lib/hours'

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'month'

export interface DateRange {
  from: string
  to: string
}

export const PRESETS: readonly { id: RangePreset; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'month', label: 'Este mes' },
]

/** Adds days to a `YYYY-MM-DD` date (calendar arithmetic, no time zones involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

/** Business-day ranges: a sale at 00:45 counts for the day the shift started (cutoff 06:00). */
export function presetRange(preset: RangePreset, now: Date, tz: string): DateRange {
  const today = businessDate(now, tz)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const day = addDays(today, -1)
      return { from: day, to: day }
    }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '30d':
      return { from: addDays(today, -29), to: today }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
  }
}

/** The same-length range right before `range`, for "vs. período anterior". */
export function previousRange(range: DateRange): DateRange {
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "20 oct" from `2026-10-20`. */
export function shortDay(date: string): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number]
  return `${d} ${MONTHS[m - 1] ?? ''}`
}

/** Percentage change, or null when there is nothing to compare against. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
