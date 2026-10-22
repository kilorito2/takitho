// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatClock } from './formatClock'

describe('formatClock', () => {
  it('prints the hour in Buenos Aires time', () => {
    expect(formatClock(new Date('2026-10-20T22:00:00Z'), 'America/Argentina/Buenos_Aires')).toBe('19 h')
    expect(formatClock(new Date('2026-10-20T22:30:00Z'), 'America/Argentina/Buenos_Aires')).toBe('19:30 h')
    expect(formatClock(new Date('2026-10-21T04:00:00Z'), 'America/Argentina/Buenos_Aires')).toBe('1 h')
  })
})
