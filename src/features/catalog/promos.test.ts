// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { promoDaysText, promoValidToday } from './promos'
import type { PromoInfo } from './types'

const TZ = 'America/Argentina/Buenos_Aires'
const promo = (weekdays: number[]): PromoInfo => ({
  id: 'p',
  label: 'Martes de tacos 2x1',
  kind: 'two_for_one',
  value: 0,
  weekdays,
  minPurchase: 0,
})

describe('promos', () => {
  it('is valid every day when no weekdays are set', () => {
    expect(promoValidToday(promo([]), new Date('2026-10-19T21:00:00-03:00'), TZ)).toBe(true)
  })

  it('uses the business day: Tuesday night still counts at 00:30 of Wednesday', () => {
    const tuesdays = promo([2])
    expect(promoValidToday(tuesdays, new Date('2026-10-20T21:00:00-03:00'), TZ)).toBe(true)
    expect(promoValidToday(tuesdays, new Date('2026-10-21T00:30:00-03:00'), TZ)).toBe(true)
    expect(promoValidToday(tuesdays, new Date('2026-10-21T19:00:00-03:00'), TZ)).toBe(false)
  })

  it('describes the days in Spanish', () => {
    expect(promoDaysText(promo([]))).toBe('Todos los días')
    expect(promoDaysText(promo([2]))).toBe('Los martes')
    expect(promoDaysText(promo([2, 4]))).toBe('Los martes y jueves')
  })
})
