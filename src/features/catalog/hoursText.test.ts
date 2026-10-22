// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clockText, hoursLines } from './hoursText'

describe('hours text', () => {
  it('prints whole hours without minutes', () => {
    expect(clockText('19:00:00')).toBe('19 h')
    expect(clockText('01:00')).toBe('1 h')
    expect(clockText('19:30')).toBe('19:30 h')
  })

  it('lists Monday to Sunday, marks closed days and joins split shifts', () => {
    const lines = hoursLines([
      { weekday: 2, opensAt: '19:00', closesAt: '01:00' },
      { weekday: 0, opensAt: '20:00', closesAt: '00:00' },
      { weekday: 0, opensAt: '13:00', closesAt: '16:00' },
      { weekday: 3, opensAt: '19:00', closesAt: '01:00', isActive: false },
    ])
    expect(lines.map((l) => l.day)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ])
    expect(lines[0]?.text).toBe('Cerrado')
    expect(lines[1]?.text).toBe('19 h a 1 h')
    expect(lines[2]?.text).toBe('Cerrado')
    expect(lines[6]?.text).toBe('13 h a 16 h y 20 h a 0 h')
  })
})
