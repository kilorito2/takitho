// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  businessDate,
  currentInterval,
  isOpenAt,
  localParts,
  nextOpening,
  scheduleSlots,
  storeStatus,
  validateScheduledAt,
  zonedTimeToUtc,
  type OpeningShift,
} from './hours.ts'

const TZ = 'America/Argentina/Buenos_Aires' // UTC−3, no DST
/** Local Buenos Aires wall-clock → instant. 2026-10-19 is a Monday. */
const ba = (local: string): Date => new Date(`${local}:00-03:00`)

const everyNight: OpeningShift[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensAt: '19:00',
  closesAt: '01:00',
}))

describe('localParts / zonedTimeToUtc', () => {
  it('reads the wall clock in the requested zone, not the machine zone', () => {
    const instant = new Date('2026-10-20T03:30:00Z') // 00:30 in Buenos Aires
    expect(localParts(instant, TZ)).toMatchObject({
      year: 2026,
      month: 10,
      day: 20,
      hour: 0,
      minute: 30,
      weekday: 2,
    })
    expect(localParts(instant, 'UTC')).toMatchObject({ day: 20, hour: 3, minute: 30 })
  })

  it('round-trips a local time into the right instant', () => {
    expect(zonedTimeToUtc(2026, 10, 19, 19 * 60, TZ).toISOString()).toBe('2026-10-19T22:00:00.000Z')
  })

  it('normalises day overflow (day 32 → next month)', () => {
    expect(zonedTimeToUtc(2026, 10, 32, 0, TZ).toISOString()).toBe('2026-11-01T03:00:00.000Z')
  })
})

describe('isOpenAt — shift 19:00–01:00 every night', () => {
  it.each([
    ['2026-10-19T18:59', false],
    ['2026-10-19T19:00', true],
    ['2026-10-19T23:59', true],
    ['2026-10-20T00:00', true],
    ['2026-10-20T00:59', true],
    ['2026-10-20T01:00', false],
    ['2026-10-20T01:01', false],
    ['2026-10-19T12:00', false],
  ])('%s → %s', (local, expected) => {
    expect(isOpenAt(ba(local), everyNight, TZ)).toBe(expected)
  })

  it('stays open at 00:30 on Monday because of the Sunday shift', () => {
    const sundayOnly: OpeningShift[] = [{ weekday: 0, opensAt: '19:00', closesAt: '01:00' }]
    expect(isOpenAt(ba('2026-10-19T00:30'), sundayOnly, TZ)).toBe(true)
    expect(isOpenAt(ba('2026-10-19T19:00'), sundayOnly, TZ)).toBe(false)
  })

  it('crosses the week boundary (Saturday shift → Sunday 00:30)', () => {
    const saturdayOnly: OpeningShift[] = [{ weekday: 6, opensAt: '20:00', closesAt: '02:00' }]
    expect(isOpenAt(ba('2026-10-25T00:30'), saturdayOnly, TZ)).toBe(true) // Sunday morning
    expect(isOpenAt(ba('2026-10-25T02:00'), saturdayOnly, TZ)).toBe(false)
  })

  it('crosses the month boundary', () => {
    const shifts: OpeningShift[] = [{ weekday: 6, opensAt: '20:00', closesAt: '02:00' }] // Sat 2026-10-31
    expect(isOpenAt(ba('2026-11-01T01:30'), shifts, TZ)).toBe(true)
  })
})

describe('isOpenAt — other shapes', () => {
  const split: OpeningShift[] = [
    { weekday: 1, opensAt: '13:00', closesAt: '16:00' },
    { weekday: 1, opensAt: '20:00', closesAt: '00:00' },
  ]

  it('supports several shifts per day, one ending exactly at midnight', () => {
    expect(isOpenAt(ba('2026-10-19T14:00'), split, TZ)).toBe(true)
    expect(isOpenAt(ba('2026-10-19T16:00'), split, TZ)).toBe(false)
    expect(isOpenAt(ba('2026-10-19T18:00'), split, TZ)).toBe(false)
    expect(isOpenAt(ba('2026-10-19T23:59'), split, TZ)).toBe(true)
    expect(isOpenAt(ba('2026-10-20T00:00'), split, TZ)).toBe(false)
  })

  it('treats opens == closes as a 24 h shift', () => {
    const allDay: OpeningShift[] = [{ weekday: 1, opensAt: '00:00', closesAt: '00:00' }]
    expect(isOpenAt(ba('2026-10-19T00:00'), allDay, TZ)).toBe(true)
    expect(isOpenAt(ba('2026-10-19T23:59'), allDay, TZ)).toBe(true)
    expect(isOpenAt(ba('2026-10-20T00:00'), allDay, TZ)).toBe(false)
  })

  it('ignores inactive shifts', () => {
    const off: OpeningShift[] = [{ weekday: 1, opensAt: '19:00', closesAt: '01:00', isActive: false }]
    expect(isOpenAt(ba('2026-10-19T20:00'), off, TZ)).toBe(false)
  })

  it('is closed when there are no shifts', () => {
    expect(isOpenAt(ba('2026-10-19T20:00'), [], TZ)).toBe(false)
  })

  it('uses the zone given, so a device in another zone gets the same answer', () => {
    const instant = ba('2026-10-19T23:00') // 02:00 UTC next day
    expect(isOpenAt(instant, everyNight, TZ)).toBe(true)
    expect(isOpenAt(instant, everyNight, 'UTC')).toBe(false)
  })
})

describe('currentInterval / nextOpening', () => {
  it('returns when the current shift ends (the next calendar day for night shifts)', () => {
    const interval = currentInterval(ba('2026-10-19T22:00'), everyNight, TZ)
    expect(interval?.start.toISOString()).toBe(ba('2026-10-19T19:00').toISOString())
    expect(interval?.end.toISOString()).toBe(ba('2026-10-20T01:00').toISOString())
  })

  it('returns null while closed', () => {
    expect(currentInterval(ba('2026-10-19T12:00'), everyNight, TZ)).toBeNull()
  })

  it("finds today's opening when it is still ahead", () => {
    expect(nextOpening(ba('2026-10-19T18:00'), everyNight, TZ)?.toISOString()).toBe(
      ba('2026-10-19T19:00').toISOString(),
    )
  })

  it('finds the next night when the shift already started tonight', () => {
    expect(nextOpening(ba('2026-10-19T22:00'), everyNight, TZ)?.toISOString()).toBe(
      ba('2026-10-20T19:00').toISOString(),
    )
  })

  it('looks past days without shifts', () => {
    const fridayOnly: OpeningShift[] = [{ weekday: 5, opensAt: '19:00', closesAt: '01:00' }]
    expect(nextOpening(ba('2026-10-19T12:00'), fridayOnly, TZ)?.toISOString()).toBe(
      ba('2026-10-23T19:00').toISOString(),
    )
  })

  it('returns null with no shifts at all', () => {
    expect(nextOpening(ba('2026-10-19T12:00'), [], TZ)).toBeNull()
  })
})

describe('businessDate', () => {
  it('keeps the small hours on the previous business day (cutoff 06:00)', () => {
    expect(businessDate(ba('2026-10-20T00:30'), TZ)).toBe('2026-10-19')
    expect(businessDate(ba('2026-10-20T05:59'), TZ)).toBe('2026-10-19')
    expect(businessDate(ba('2026-10-20T06:00'), TZ)).toBe('2026-10-20')
    expect(businessDate(ba('2026-10-19T20:00'), TZ)).toBe('2026-10-19')
  })

  it('handles the first of the month', () => {
    expect(businessDate(ba('2026-11-01T01:00'), TZ)).toBe('2026-10-31')
  })
})

describe('scheduleSlots', () => {
  const opts = { prepMinutes: 30, stepMinutes: 15, maxDays: 1 }

  it('starts at opening time and goes in 15-minute steps until just before closing', () => {
    const slots = scheduleSlots(ba('2026-10-19T18:00'), everyNight, TZ, opts)
    expect(slots[0]?.toISOString()).toBe(ba('2026-10-19T19:00').toISOString())
    expect(slots.at(-1)?.toISOString()).toBe(ba('2026-10-20T00:45').toISOString())
    expect(slots).toHaveLength(24)
  })

  it('respects the preparation time and rounds up to the next step', () => {
    const slots = scheduleSlots(ba('2026-10-19T20:07'), everyNight, TZ, { ...opts, prepMinutes: 20 })
    expect(slots[0]?.toISOString()).toBe(ba('2026-10-19T20:30').toISOString())
  })

  it('does not offer closing time itself', () => {
    const slots = scheduleSlots(ba('2026-10-19T18:00'), everyNight, TZ, opts)
    expect(slots.some((s) => s.toISOString() === ba('2026-10-20T01:00').toISOString())).toBe(false)
  })

  it('reaches the next night when maxDays allows it', () => {
    const slots = scheduleSlots(ba('2026-10-19T18:00'), everyNight, TZ, { ...opts, maxDays: 2 })
    expect(slots.some((s) => s.toISOString() === ba('2026-10-20T19:00').toISOString())).toBe(true)
  })

  it("offers slots after midnight that belong to last night's shift", () => {
    const slots = scheduleSlots(ba('2026-10-20T00:10'), everyNight, TZ, { ...opts, prepMinutes: 15 })
    expect(slots[0]?.toISOString()).toBe(ba('2026-10-20T00:30').toISOString())
  })

  it('defaults to 15-minute steps', () => {
    const slots = scheduleSlots(ba('2026-10-19T18:00'), everyNight, TZ, { prepMinutes: 30, maxDays: 1 })
    expect(slots).toHaveLength(24)
  })

  it('returns nothing when there are no shifts', () => {
    expect(scheduleSlots(ba('2026-10-19T18:00'), [], TZ, opts)).toEqual([])
  })

  it('returns no duplicates when shifts overlap', () => {
    const overlapping: OpeningShift[] = [
      { weekday: 1, opensAt: '19:00', closesAt: '23:00' },
      { weekday: 1, opensAt: '21:00', closesAt: '23:30' },
    ]
    const slots = scheduleSlots(ba('2026-10-19T18:00'), overlapping, TZ, { ...opts, prepMinutes: 0 })
    const unique = new Set(slots.map((s) => s.getTime()))
    expect(unique.size).toBe(slots.length)
  })
})

describe('validateScheduledAt', () => {
  const opts = { prepMinutes: 30, stepMinutes: 15, maxDays: 1 }
  const now = ba('2026-10-19T18:00')

  it('accepts a listed slot', () => {
    expect(validateScheduledAt(ba('2026-10-19T20:15'), now, everyNight, TZ, opts)).toBe(true)
  })

  it('rejects an off-grid minute, a past time and an out-of-hours time', () => {
    expect(validateScheduledAt(ba('2026-10-19T20:10'), now, everyNight, TZ, opts)).toBe(false)
    expect(validateScheduledAt(ba('2026-10-19T17:00'), now, everyNight, TZ, opts)).toBe(false)
    expect(validateScheduledAt(ba('2026-10-19T15:00'), now, everyNight, TZ, opts)).toBe(false)
  })

  it('rejects a slot earlier than now + prep time', () => {
    expect(validateScheduledAt(ba('2026-10-19T20:00'), ba('2026-10-19T19:50'), everyNight, TZ, opts)).toBe(
      false,
    )
  })
})

describe('storeStatus', () => {
  const base = { shifts: everyNight, tz: TZ, isPaused: false, isClosedManually: false }

  it('is open and takes immediate orders during a shift', () => {
    const s = storeStatus({ ...base, now: ba('2026-10-19T20:00') })
    expect(s).toMatchObject({ isOpen: true, canOrderNow: true, canSchedule: true, reason: 'open' })
    expect(s.closesAt?.toISOString()).toBe(ba('2026-10-20T01:00').toISOString())
  })

  it('blocks immediate orders but allows scheduling when closed by hours', () => {
    const s = storeStatus({ ...base, now: ba('2026-10-19T12:00') })
    expect(s).toMatchObject({ isOpen: false, canOrderNow: false, canSchedule: true, reason: 'closed' })
    expect(s.nextOpenAt?.toISOString()).toBe(ba('2026-10-19T19:00').toISOString())
  })

  it('blocks immediate orders but allows scheduling while paused', () => {
    expect(storeStatus({ ...base, now: ba('2026-10-19T20:00'), isPaused: true })).toMatchObject({
      isOpen: true,
      canOrderNow: false,
      canSchedule: true,
      reason: 'paused',
    })
  })

  it('blocks everything on manual closure unless scheduling is explicitly accepted', () => {
    const closed = storeStatus({ ...base, now: ba('2026-10-19T20:00'), isClosedManually: true })
    expect(closed).toMatchObject({ isOpen: false, canOrderNow: false, canSchedule: false, reason: 'manual' })
    const accepting = storeStatus({
      ...base,
      now: ba('2026-10-19T20:00'),
      isClosedManually: true,
      acceptsScheduledWhenClosed: true,
    })
    expect(accepting.canSchedule).toBe(true)
  })
})
