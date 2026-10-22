// Pure core (ADR-0004/0010): opening hours with midnight crossover, schedule slots, business date.
// No imports. "Now" is always a parameter; the zone is always explicit (America/Argentina/Buenos_Aires).

export interface OpeningShift {
  /** 0 = Sunday … 6 = Saturday, the day on which the shift *opens*. */
  weekday: number
  /** "HH:MM" (an optional ":SS" is ignored). */
  opensAt: string
  /** "HH:MM". If it is ≤ opensAt the shift ends on the following day. */
  closesAt: string
  isActive?: boolean
}

export interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

export interface Interval {
  start: Date
  end: Date
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    })
    formatters.set(tz, f)
  }
  return f
}

/** Wall-clock fields of `date` in zone `tz`. */
export function localParts(date: Date, tz: string): LocalParts {
  const out: Record<string, string> = {}
  for (const p of formatter(tz).formatToParts(date)) out[p.type] = p.value
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS.indexOf(String(out.weekday)),
  }
}

function offsetMs(instant: Date, tz: string): number {
  const p = localParts(instant, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** Instant for the wall-clock `minutes` after local midnight of y-m-d in `tz` (day overflow is normalised). */
export function zonedTimeToUtc(year: number, month: number, day: number, minutes: number, tz: string): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minutes)
  const first = naive - offsetMs(new Date(naive), tz)
  return new Date(naive - offsetMs(new Date(first), tz))
}

function toMinutes(hm: string): number {
  const [h = '0', m = '0'] = hm.split(':')
  return Number(h) * 60 + Number(m)
}

/** Concrete intervals of every active shift that opens on local days [today+from, today+to]. */
function intervals(
  now: Date,
  shifts: readonly OpeningShift[],
  tz: string,
  from: number,
  to: number,
): Interval[] {
  const today = localParts(now, tz)
  const out: Interval[] = []
  for (let off = from; off <= to; off++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + off))
    const [y, m, day, wd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCDay()] as const
    for (const shift of shifts) {
      if (shift.isActive === false || shift.weekday !== wd) continue
      const opens = toMinutes(shift.opensAt)
      const closes = toMinutes(shift.closesAt)
      out.push({
        start: zonedTimeToUtc(y, m, day, opens, tz),
        end:
          closes > opens ? zonedTimeToUtc(y, m, day, closes, tz) : zonedTimeToUtc(y, m, day + 1, closes, tz),
      })
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** The shift interval that contains `now` (yesterday's night shift included), or null. */
export function currentInterval(now: Date, shifts: readonly OpeningShift[], tz: string): Interval | null {
  const t = now.getTime()
  const hits = intervals(now, shifts, tz, -1, 0).filter((i) => i.start.getTime() <= t && t < i.end.getTime())
  return hits.at(-1) ?? null
}

export function isOpenAt(now: Date, shifts: readonly OpeningShift[], tz: string): boolean {
  return currentInterval(now, shifts, tz) !== null
}

/** The next moment a shift starts strictly after `now` (looks two weeks ahead). */
export function nextOpening(now: Date, shifts: readonly OpeningShift[], tz: string): Date | null {
  const t = now.getTime()
  return intervals(now, shifts, tz, 0, 14).find((i) => i.start.getTime() > t)?.start ?? null
}

/** Business day (reports, order codes). Small hours before `cutoff` still belong to the previous day. */
export function businessDate(now: Date, tz: string, cutoff = '06:00'): string {
  const p = localParts(now, tz)
  const shift = p.hour * 60 + p.minute < toMinutes(cutoff) ? -1 : 0
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + shift))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export interface SlotOptions {
  /** Minimum lead time before the first slot. */
  prepMinutes: number
  /** Slot granularity; the brief asks for 15. */
  stepMinutes?: number
  /** How many days ahead can be scheduled. */
  maxDays: number
}

/** Selectable pickup/delivery times: on the grid, ≥ now+prep, strictly before closing, within the horizon. */
export function scheduleSlots(
  now: Date,
  shifts: readonly OpeningShift[],
  tz: string,
  opts: SlotOptions,
): Date[] {
  const step = (opts.stepMinutes ?? 15) * MINUTE
  const earliest = Math.ceil((now.getTime() + opts.prepMinutes * MINUTE) / step) * step
  const horizon = now.getTime() + opts.maxDays * DAY
  const slots = new Set<number>()
  for (const { start, end } of intervals(now, shifts, tz, -1, opts.maxDays + 1)) {
    const from = Math.max(earliest, Math.ceil(start.getTime() / step) * step)
    for (let t = from; t < end.getTime() && t <= horizon; t += step) slots.add(t)
  }
  return [...slots].sort((a, b) => a - b).map((t) => new Date(t))
}

/** Server-side check that a requested scheduled time is one of the offered slots. */
export function validateScheduledAt(
  at: Date,
  now: Date,
  shifts: readonly OpeningShift[],
  tz: string,
  opts: SlotOptions,
): boolean {
  return scheduleSlots(now, shifts, tz, opts).some((s) => s.getTime() === at.getTime())
}

export type StoreReason = 'open' | 'closed' | 'paused' | 'manual'

export interface StoreStatus {
  /** Open by hours and not manually closed. */
  isOpen: boolean
  canOrderNow: boolean
  canSchedule: boolean
  reason: StoreReason
  nextOpenAt: Date | null
  closesAt: Date | null
}

export interface StoreStatusInput {
  now: Date
  shifts: readonly OpeningShift[]
  tz: string
  isPaused: boolean
  isClosedManually: boolean
  /** Whether a manual closure still lets customers schedule for later. */
  acceptsScheduledWhenClosed?: boolean
}

export function storeStatus(input: StoreStatusInput): StoreStatus {
  const { now, shifts, tz, isPaused, isClosedManually, acceptsScheduledWhenClosed = false } = input
  const current = currentInterval(now, shifts, tz)
  const openByHours = current !== null
  const isOpen = openByHours && !isClosedManually
  const reason: StoreReason = isClosedManually
    ? 'manual'
    : !openByHours
      ? 'closed'
      : isPaused
        ? 'paused'
        : 'open'
  return {
    isOpen,
    canOrderNow: isOpen && !isPaused,
    canSchedule: !isClosedManually || acceptsScheduledWhenClosed,
    reason,
    nextOpenAt: isOpen ? null : nextOpening(now, shifts, tz),
    closesAt: openByHours ? current.end : null,
  }
}
