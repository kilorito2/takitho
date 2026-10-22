import { businessDate, localParts, scheduleSlots, type OpeningShift } from '@/lib/hours'

export interface SlotOption {
  /** ISO instant sent to the server. */
  value: string
  /** "19:30 h" */
  time: string
  /** "Hoy", "Mañana" or "jueves 22/10" */
  day: string
  dayKey: string
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const pad = (n: number) => String(n).padStart(2, '0')

const dayNumber = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000

/**
 * 15-minute pickup/delivery slots inside opening hours, labelled the way people say them.
 * Days follow the *business day* (ADR-0010): a 00:45 slot of tonight's shift is still "Hoy", not "Mañana".
 */
export function slotOptions(
  now: Date,
  shifts: readonly OpeningShift[],
  tz: string,
  opts: { prepMinutes: number; maxDays: number },
): SlotOption[] {
  const today = businessDate(now, tz)
  return scheduleSlots(now, shifts, tz, { ...opts, stepMinutes: 15 }).map((date) => {
    const p = localParts(date, tz)
    const bd = businessDate(date, tz)
    const diff = dayNumber(bd) - dayNumber(today)
    const weekday = new Date(`${bd}T00:00:00Z`).getUTCDay()
    const [, month = '', day = ''] = bd.split('-')
    const label =
      diff <= 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `${WEEKDAYS[weekday] ?? ''} ${Number(day)}/${month}`
    return { value: date.toISOString(), time: `${pad(p.hour)}:${pad(p.minute)} h`, day: label, dayKey: bd }
  })
}

/** Groups consecutive options by day, keeping order. */
export function groupSlots(options: readonly SlotOption[]): { day: string; slots: SlotOption[] }[] {
  const groups: { day: string; key: string; slots: SlotOption[] }[] = []
  for (const o of options) {
    const last = groups.at(-1)
    if (last?.key === o.dayKey) last.slots.push(o)
    else groups.push({ day: o.day, key: o.dayKey, slots: [o] })
  }
  return groups.map(({ day, slots }) => ({ day, slots }))
}
