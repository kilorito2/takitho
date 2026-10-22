// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OpeningShift } from '@/lib/hours'
import { cashSuggestions, parseAmount, tipFromPercent } from './money'
import { groupSlots, slotOptions } from './slots'

const TZ = 'America/Argentina/Buenos_Aires'
const ba = (local: string) => new Date(`${local}:00-03:00`)
const nightly: OpeningShift[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensAt: '19:00',
  closesAt: '01:00',
}))

describe('cashSuggestions', () => {
  it('offers the exact amount and the bills people hand over', () => {
    expect(cashSuggestions(17700)).toEqual([17700, 18000, 20000, 50000])
    expect(cashSuggestions(8500)).toEqual([8500, 9000, 10000, 20000])
  })

  it('does not repeat values and never goes below the total', () => {
    expect(cashSuggestions(10000)).toEqual([10000, 20000, 50000])
    for (const total of [1, 999, 1000, 4321, 99999]) {
      const s = cashSuggestions(total)
      expect(new Set(s).size).toBe(s.length)
      expect(s.every((n) => n >= total)).toBe(true)
      expect(s[0]).toBe(total)
    }
  })

  it('returns nothing for an empty order', () => {
    expect(cashSuggestions(0)).toEqual([])
  })
})

describe('tipFromPercent', () => {
  it('rounds to the nearest 10 pesos', () => {
    expect(tipFromPercent(16200, 10)).toBe(1620)
    expect(tipFromPercent(7230, 10)).toBe(720)
    expect(tipFromPercent(16200, 5)).toBe(810)
  })

  it('is zero for 0 %, empty orders and negatives', () => {
    expect(tipFromPercent(16200, 0)).toBe(0)
    expect(tipFromPercent(0, 10)).toBe(0)
    expect(tipFromPercent(1000, -5)).toBe(0)
  })
})

describe('parseAmount', () => {
  it.each([
    ['20000', 20000],
    ['20.000', 20000],
    ['$ 20.000', 20000],
    [' 5000 ', 5000],
  ])('%s → %s', (text, expected) => {
    expect(parseAmount(text)).toBe(expected)
  })

  it.each(['', 'abc', '12,5', '-5', '1e5', '1234567890'])('rejects %j', (text) => {
    expect(parseAmount(text)).toBeNull()
  })
})

describe('slotOptions', () => {
  const opts = { prepMinutes: 30, maxDays: 2 }

  it('labels tonight as Hoy, including the slots after midnight of the same shift', () => {
    const options = slotOptions(ba('2026-10-20T18:00'), nightly, TZ, opts)
    expect(options[0]).toMatchObject({ time: '19:00 h', day: 'Hoy' })
    const tonight = options.filter((o) => o.day === 'Hoy')
    expect(tonight.at(-1)?.time).toBe('00:45 h')
    expect(tonight).toHaveLength(24)
  })

  it('moves on to "Mañana" for the next night, and names later days', () => {
    const wide = slotOptions(ba('2026-10-20T18:00'), nightly, TZ, { prepMinutes: 30, maxDays: 3 })
    const days = [...new Set(wide.map((o) => o.day))]
    expect(days).toEqual(['Hoy', 'Mañana', 'jueves 22/10', 'viernes 23/10'].slice(0, days.length))
    expect(days.slice(0, 3)).toEqual(['Hoy', 'Mañana', 'jueves 22/10'])
  })

  it('still says "Hoy" for the small hours of the current shift', () => {
    const options = slotOptions(ba('2026-10-21T00:10'), nightly, TZ, opts)
    expect(options[0]).toMatchObject({ time: '00:45 h', day: 'Hoy' })
  })

  it('groups consecutive slots by business day in order', () => {
    const groups = groupSlots(slotOptions(ba('2026-10-20T18:00'), nightly, TZ, opts))
    expect(groups.map((g) => g.day)).toEqual(['Hoy', 'Mañana'])
    expect(groups.every((g) => g.slots.length > 0)).toBe(true)
  })

  it('offers only future slots after the preparation time', () => {
    const now = ba('2026-10-20T21:10')
    const options = slotOptions(now, nightly, TZ, opts)
    expect(options[0]?.time).toBe('21:45 h')
    expect(options.every((o) => Date.parse(o.value) >= now.getTime() + 30 * 60_000)).toBe(true)
  })
})
