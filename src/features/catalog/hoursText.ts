import type { OpeningShift } from '@/lib/hours'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
/** Week order for display: Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]

/** "19:00:00" → "19 h", "19:30" → "19:30 h". */
export function clockText(hm: string): string {
  const [h = '0', m = '0'] = hm.split(':')
  return Number(m) === 0 ? `${Number(h)} h` : `${Number(h)}:${m.padStart(2, '0')} h`
}

export interface HoursLine {
  weekday: number
  day: string
  /** "19 h a 1 h" per shift, or "Cerrado". */
  text: string
}

/** One line per weekday (Monday → Sunday), several shifts joined with " y ". */
export function hoursLines(shifts: readonly OpeningShift[]): HoursLine[] {
  return WEEK.map((weekday) => {
    const day = shifts
      .filter((s) => s.isActive !== false && s.weekday === weekday)
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
    return {
      weekday,
      day: DAY_NAMES[weekday] ?? '',
      text:
        day.length === 0
          ? 'Cerrado'
          : day.map((s) => `${clockText(s.opensAt)} a ${clockText(s.closesAt)}`).join(' y '),
    }
  })
}

export const dayName = (weekday: number): string => DAY_NAMES[weekday] ?? ''
