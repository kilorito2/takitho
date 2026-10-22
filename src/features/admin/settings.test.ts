import { describe, expect, it } from 'vitest'
import {
  parseNeighborhoods,
  parseTipPresets,
  settingsFormSchema,
  shiftsProblem,
  zoneFormSchema,
  type SettingsFormInput,
} from './settings'

const base: SettingsFormInput = {
  name: 'Takitho',
  tagline: 'Tacos de barrio',
  address: 'Av. Siempreviva 742',
  mapsUrl: 'https://maps.app.goo.gl/abc',
  whatsapp: '+54 9 11 5555-0000',
  instagram: 'takitho.tacos',
  facebook: '',
  tiktok: '',
  publicUrl: 'https://takitho.com.ar',
  transferAlias: 'takitho.tacos',
  transferCbu: '0000003100012345678901',
  transferHolder: 'Takitho SRL',
  prepMinutes: '25',
  timerWarnMinutes: '10',
  timerLateMinutes: '20',
  pendingPaymentTtlMin: '30',
  maxScheduleDays: '2',
  tipPresets: '0, 5, 10',
  payMpEnabled: true,
  payCashEnabled: true,
  payTransferEnabled: true,
  isPaused: false,
  isClosedManually: false,
  acceptsScheduledWhenClosed: true,
}

const issues = (over: Partial<SettingsFormInput>) => {
  const r = settingsFormSchema.safeParse({ ...base, ...over })
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('settingsFormSchema', () => {
  it('accepts a complete configuration', () => {
    expect(issues({})).toEqual([])
  })

  it('lets the owner save while data is still [COMPLETAR]', () => {
    expect(
      issues({
        mapsUrl: '[COMPLETAR: link de Google Maps]',
        whatsapp: '[COMPLETAR]',
        transferCbu: '[COMPLETAR]',
      }),
    ).toEqual([])
  })

  it('checks the shapes that matter: https links, phone, 22-digit CBU', () => {
    expect(issues({ mapsUrl: 'http://x.test' })).toEqual(['mapsUrl'])
    expect(issues({ whatsapp: 'llamame' })).toEqual(['whatsapp'])
    expect(issues({ transferCbu: '123' })).toEqual(['transferCbu'])
    expect(issues({ transferCbu: '0000003 1000123456789 01' })).toEqual([])
    expect(issues({ publicUrl: 'https://takitho.com.ar/menu' })).toEqual(['publicUrl'])
  })

  it('keeps the kitchen timers in order', () => {
    expect(issues({ timerWarnMinutes: '20', timerLateMinutes: '20' })).toEqual(['timerLateMinutes'])
    expect(issues({ timerWarnMinutes: '5', timerLateMinutes: '6' })).toEqual([])
  })

  it('does not let every payment method be switched off', () => {
    expect(issues({ payMpEnabled: false, payCashEnabled: false, payTransferEnabled: false })).toEqual([
      'payCashEnabled',
    ])
    expect(issues({ payMpEnabled: false, payCashEnabled: false })).toEqual([])
  })

  it('bounds the numbers', () => {
    expect(issues({ prepMinutes: '241' })).toEqual(['prepMinutes'])
    expect(issues({ maxScheduleDays: '15' })).toEqual(['maxScheduleDays'])
    expect(issues({ pendingPaymentTtlMin: '4' })).toEqual(['pendingPaymentTtlMin'])
    expect(issues({ prepMinutes: '2,5' })).toEqual(['prepMinutes'])
  })
})

describe('parseTipPresets', () => {
  it('sorts, de-duplicates and caps at 50 %', () => {
    expect(parseTipPresets('10, 0, 5, 5')).toEqual([0, 5, 10])
    expect(parseTipPresets('0 5 10')).toEqual([0, 5, 10])
  })

  it.each(['', 'diez', '5, 60', '1,2,3,4,5,6', '-5'])('rejects %j', (text) => {
    expect(parseTipPresets(text)).toBeNull()
  })
})

describe('shiftsProblem', () => {
  const at = (weekday: number, opensAt: string, closesAt: string) => ({ weekday, opensAt, closesAt })

  it('accepts the usual week, including shifts that cross midnight', () => {
    expect(
      shiftsProblem([
        at(2, '19:00', '01:00'),
        at(5, '19:00', '02:00'),
        at(6, '19:00', '02:00'),
        at(0, '12:00', '16:00'),
        at(0, '19:00', '23:00'),
      ]),
    ).toBeNull()
  })

  it('accepts an empty week (the shop is simply closed)', () => {
    expect(shiftsProblem([])).toBeNull()
  })

  it('catches a shift that opens and closes at the same time', () => {
    expect(shiftsProblem([at(2, '19:00', '19:00')])).toMatch(/misma hora/)
  })

  it('catches overlapping shifts on the same day', () => {
    expect(shiftsProblem([at(2, '12:00', '16:00'), at(2, '15:00', '20:00')])).toMatch(/superponen/)
  })

  it('catches a night shift that runs into the next morning shift', () => {
    expect(shiftsProblem([at(2, '19:00', '02:00'), at(3, '01:00', '05:00')])).toMatch(/superponen/)
  })

  it('catches the wrap from Saturday night into Sunday', () => {
    expect(shiftsProblem([at(6, '20:00', '03:00'), at(0, '02:00', '06:00')])).toMatch(/superponen/)
  })

  it('allows a shift that ends exactly when the next begins', () => {
    expect(shiftsProblem([at(2, '12:00', '16:00'), at(2, '16:00', '20:00')])).toBeNull()
  })

  it('asks for incomplete times', () => {
    expect(shiftsProblem([at(2, '', '20:00')])).toMatch(/Completá/)
  })
})

describe('zoneFormSchema', () => {
  it('parses money fields and neighborhoods', () => {
    const r = zoneFormSchema.safeParse({
      name: 'Centro',
      neighborhoods: 'Centro, Alberdi',
      fee: '1500',
      minOrder: '7000',
    })
    expect(r.success && r.data).toMatchObject({ fee: 1500, minOrder: 7000 })
    expect(
      zoneFormSchema.safeParse({ name: 'Centro', neighborhoods: '', fee: '1.500', minOrder: '0' }).success,
    ).toBe(false)
    expect(parseNeighborhoods(' Centro, Alberdi ,, Centro ')).toEqual(['Centro', 'Alberdi'])
  })
})
