// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatArPhone, normalizeArPhone } from './phone.ts'

describe('normalizeArPhone', () => {
  it.each([
    ['1112345678', '+5491112345678'],
    ['11 1234-5678', '+5491112345678'],
    ['011 1234-5678', '+5491112345678'],
    ['011 15 1234-5678', '+5491112345678'],
    ['+54 9 11 1234 5678', '+5491112345678'],
    ['+5491112345678', '+5491112345678'],
    ['54 11 1234 5678', '+5491112345678'],
    ['(0351) 15-5123456', '+5493515123456'],
    ['351 555 1234', '+5493515551234'],
    ['0341 15 4567890', '+5493414567890'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeArPhone(input)).toEqual({ ok: true, e164: expected })
  })

  it.each([
    '',
    '   ',
    '123',
    'abcdefghij',
    '12345678901234',
    '0000000000',
    '+1 305 555 0100',
    '1512345678',
    '00123456789',
  ])('rejects %j', (input) => {
    expect(normalizeArPhone(input).ok).toBe(false)
  })

  it('rejects numbers whose area code starts with 1 but is not 11', () => {
    expect(normalizeArPhone('1212345678').ok).toBe(false)
  })
})

describe('formatArPhone', () => {
  it('formats a Buenos Aires mobile for display', () => {
    expect(formatArPhone('+5491112345678')).toBe('11 1234-5678')
  })

  it('formats an interior mobile for display', () => {
    expect(formatArPhone('+5493515551234')).toBe('351 555-1234')
  })

  it('returns the input unchanged when it is not an AR mobile', () => {
    expect(formatArPhone('+12125550100')).toBe('+12125550100')
  })
})
