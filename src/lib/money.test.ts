// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cashChange, clampInt, formatARS, isMoney } from './money.ts'

describe('formatARS', () => {
  it('formats whole pesos with es-AR separators and no decimals', () => {
    expect(formatARS(1500).replace(/\s/g, ' ')).toBe('$ 1.500')
    expect(formatARS(12345678).replace(/\s/g, ' ')).toBe('$ 12.345.678')
  })

  it('formats zero', () => {
    expect(formatARS(0).replace(/\s/g, ' ')).toBe('$ 0')
  })

  it('formats negative amounts (discount lines) with a minus sign', () => {
    expect(formatARS(-500)).toContain('-')
    expect(formatARS(-500)).toContain('500')
  })
})

describe('isMoney', () => {
  it('accepts non-negative safe integers', () => {
    expect(isMoney(0)).toBe(true)
    expect(isMoney(2500)).toBe(true)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects %s', (v) => {
    expect(isMoney(v)).toBe(false)
  })

  it('rejects non-numbers', () => {
    expect(isMoney('100')).toBe(false)
    expect(isMoney(null)).toBe(false)
  })
})

describe('clampInt', () => {
  it('clamps and truncates', () => {
    expect(clampInt(5.9, 1, 20)).toBe(5)
    expect(clampInt(0, 1, 20)).toBe(1)
    expect(clampInt(99, 1, 20)).toBe(20)
  })

  it('falls back to the minimum for NaN', () => {
    expect(clampInt(Number.NaN, 1, 20)).toBe(1)
  })
})

describe('cashChange', () => {
  it('returns the change when the customer pays with more than the total', () => {
    expect(cashChange(8500, 10000)).toEqual({ ok: true, change: 1500 })
  })

  it('returns zero change for an exact payment', () => {
    expect(cashChange(8500, 8500)).toEqual({ ok: true, change: 0 })
  })

  it('rejects an amount lower than the total', () => {
    expect(cashChange(8500, 8000)).toEqual({ ok: false, shortBy: 500 })
  })
})
